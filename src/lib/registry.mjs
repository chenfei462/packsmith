import path from "node:path";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ensureDir, pathExists, readJson, writeJsonAtomic } from "./fs-utils.mjs";
import { fetchJsonWithTimeout } from "./http.mjs";
import { getLogger } from "./log.mjs";
import { defaultStateDir, SUPPORTED_TARGET_IDS } from "./targets.mjs";

export const DEFAULT_REGISTRY_PATH = fileURLToPath(new URL("../../registry/catalog.json", import.meta.url));
export const OFFICIAL_REGISTRY_URL = "https://raw.githubusercontent.com/packsmith/registry/main/catalog.json";

const REGISTRY_REFRESH_TIMEOUT_MS = 30_000;
const REGISTRY_REFRESH_MAX_BYTES = 10 * 1024 * 1024;
// Shorter budget for the implicit read-path fetch: a degraded search should
// fall back to the bundled catalog quickly rather than stall the command.
const REGISTRY_FALLBACK_TIMEOUT_MS = 5_000;

/**
 * Module-level catalog cache keyed by (path, mtime) (#36).
 * Prevents re-parsing the 80KB catalog on every call — only re-reads when the file changes on disk.
 * @type {Map<string, {mtime: number, catalog: object}>}
 */
const catalogCache = new Map();

// ---------------------------------------------------------------------------
// Trust model note (#2)
// ---------------------------------------------------------------------------
// `verified` in registry entries is a directory-level boolean claim, NOT a
// cryptographic guarantee. It is stored in the same untrusted catalog as
// `riskLevel` and any declared checksum, so all three can be forged together.
// Consumers must not treat `verified: true` as proof of integrity or
// provenance. The built-in `official` registry is therefore NOT trusted by
// default, and cache checksums recorded during refresh are re-verified (#13).
// ---------------------------------------------------------------------------

function registryConfigPath(options = {}) {
  return path.join(path.resolve(options.stateDir ?? defaultStateDir()), "registries.json");
}

function registryCacheDir(options = {}) {
  return path.join(path.resolve(options.stateDir ?? defaultStateDir()), "registry-cache");
}

function safeRegistryName(name) {
  return String(name).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "registry";
}

function registryCachePath(name, options = {}) {
  return path.join(registryCacheDir(options), `${safeRegistryName(name)}.catalog.json`);
}

function hashText(value) {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`;
}

function defaultRegistryConfig() {
  return {
    active: "bundled",
    registries: [
      {
        name: "bundled",
        type: "bundled",
        url: DEFAULT_REGISTRY_PATH,
        trusted: true
      },
      {
        // #2: the official URL points at a third-party hosted catalog whose
        // `verified` claims are not cryptographic guarantees, so it does not
        // get default trust.
        name: "official",
        type: "remote",
        url: OFFICIAL_REGISTRY_URL,
        trusted: false
      }
    ]
  };
}

async function loadRegistryConfig(options = {}) {
  const configPath = registryConfigPath(options);

  if (!(await pathExists(configPath))) {
    return {
      path: configPath,
      ...defaultRegistryConfig()
    };
  }

  let stored;

  try {
    stored = await readJson(configPath);
  } catch {
    // A corrupt config file falls back to defaults instead of breaking the CLI.
    return {
      path: configPath,
      ...defaultRegistryConfig()
    };
  }

  const defaults = defaultRegistryConfig();
  const registryNames = new Set((stored.registries ?? []).map((entry) => entry.name));
  const registries = [...(stored.registries ?? [])];

  for (const entry of defaults.registries) {
    if (!registryNames.has(entry.name)) {
      registries.push(entry);
    }
  }

  return {
    path: configPath,
    active: stored.active ?? "bundled",
    registries
  };
}

async function saveRegistryConfig(config, options = {}) {
  const configPath = registryConfigPath(options);
  await ensureDir(path.dirname(configPath));
  await writeJsonAtomic(configPath, {
    active: config.active,
    registries: config.registries
  });
  return configPath;
}

export async function listRegistries(options = {}) {
  return loadRegistryConfig(options);
}

export async function addRegistry(name, url, options = {}) {
  if (!name || !url) {
    throw new Error("registry add requires <name> and <url>.");
  }

  const config = await loadRegistryConfig(options);
  const entry = {
    name,
    type: /^https?:\/\//i.test(url) ? "remote" : "custom",
    url: /^https?:\/\//i.test(url) ? url : path.resolve(url),
    trusted: Boolean(options.trusted)
  };

  if (entry.type === "custom") {
    // Fail fast on local paths so a typo surfaces at add time, not search time.
    await loadRegistry(entry.url);
  }

  config.registries = config.registries.filter((registry) => registry.name !== name);
  config.registries.push(entry);
  await saveRegistryConfig(config, options);

  return {
    config,
    entry
  };
}

export async function useRegistry(name, options = {}) {
  const config = await loadRegistryConfig(options);

  if (!config.registries.some((registry) => registry.name === name)) {
    throw new Error(`Registry "${name}" is not configured. Run packsmith registry add ${name} <url>.`);
  }

  config.active = name;
  await saveRegistryConfig(config, options);

  return {
    config,
    active: name
  };
}

export async function refreshRegistries(options = {}) {
  const config = await loadRegistryConfig(options);
  const refreshed = [];
  let changed = false;

  for (const registry of config.registries) {
    if (registry.type !== "remote") {
      refreshed.push({
        name: registry.name,
        status: "available",
        path: registry.url
      });
      continue;
    }

    if (registry.name !== config.active) {
      refreshed.push({
        name: registry.name,
        status: registry.cachePath ? "cached" : "remote-not-cached",
        cachePath: registry.cachePath
      });
      continue;
    }

    try {
      // #6: all network access goes through the shared http.mjs wrapper with
      // timeout, retry, and response-size limits. allowHttp keeps internal
      // HTTP registry mirrors (and local test servers) usable.
      const catalog = await fetchJsonWithTimeout(registry.url, {
        allowHttp: true,
        timeoutMs: REGISTRY_REFRESH_TIMEOUT_MS,
        maxRetries: 1,
        maxResponseSize: REGISTRY_REFRESH_MAX_BYTES,
        headers: {
          accept: "application/json"
        }
      });

      if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.packs)) {
        throw new Error("Remote catalog must include a packs array.");
      }

      const cachePath = registryCachePath(registry.name, options);
      const cachedAt = new Date().toISOString();
      const serialized = JSON.stringify(catalog, null, 2);
      const checksum = hashText(serialized);
      const cachedCatalog = {
        ...catalog,
        packsmithRegistry: {
          name: registry.name,
          type: "remote",
          url: registry.url,
          cachedAt,
          checksum
        }
      };
      await ensureDir(path.dirname(cachePath));
      // #13/#4: cache writes are atomic so an interrupted refresh cannot
      // leave a truncated catalog behind.
      await writeJsonAtomic(cachePath, cachedCatalog);
      registry.cachePath = cachePath;
      registry.cachedAt = cachedAt;
      registry.checksum = checksum;
      changed = true;

      refreshed.push({
        name: registry.name,
        status: "cached",
        url: registry.url,
        cachePath,
        checksum,
        updatedAt: catalog.updatedAt,
        packCount: catalog.packs.length
      });
    } catch (error) {
      refreshed.push({
        name: registry.name,
        status: "error",
        url: registry.url,
        message: error.message
      });
    }
  }

  if (changed) {
    await saveRegistryConfig(config, options);
  }

  return {
    config,
    refreshed
  };
}

async function resolveConfiguredRegistry(options = {}) {
  if (options.registry) {
    return options.registry;
  }

  const config = await loadRegistryConfig(options);
  const active = config.registries.find((registry) => registry.name === config.active);

  if (!active || active.type === "bundled") {
    return DEFAULT_REGISTRY_PATH;
  }

  if (/^https?:\/\//i.test(active.url)) {
    if (active.cachePath && (await pathExists(active.cachePath))) {
      return active.cachePath;
    }

    // §4 "registry unreachable": try the remote once, and if it cannot be
    // reached degrade to the bundled catalog instead of failing the command.
    // A degraded read still succeeds (exit 0); the warning goes to stderr so a
    // piped stdout stays parseable. URL and HTTP status stay out of the human
    // line on purpose.
    try {
      const catalog = await fetchJsonWithTimeout(active.url, {
        allowHttp: true,
        timeoutMs: REGISTRY_FALLBACK_TIMEOUT_MS,
        maxRetries: 0,
        maxResponseSize: REGISTRY_REFRESH_MAX_BYTES,
        headers: { accept: "application/json" }
      });

      if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.packs)) {
        throw new Error("Remote catalog must include a packs array.");
      }

      const cachePath = registryCachePath(active.name, options);
      await ensureDir(path.dirname(cachePath));
      await writeJsonAtomic(cachePath, {
        ...catalog,
        packsmithRegistry: {
          name: active.name,
          type: "remote",
          url: active.url,
          cachedAt: new Date().toISOString(),
          checksum: hashText(JSON.stringify(catalog, null, 2))
        }
      });
      active.cachePath = cachePath;
      await saveRegistryConfig(config, options);

      return cachePath;
    } catch (error) {
      const bundled = await loadRegistry(DEFAULT_REGISTRY_PATH).catch(() => null);
      const count = bundled?.packs?.length ?? "??";
      const log = getLogger();

      if (log) {
        log.warn(
          `⚠ remote registry unreachable (network error), falling back to bundled catalog (${count} packs)\n` +
            "  fix: check connectivity, or `packsmith registry refresh` later"
        );
      }

      return DEFAULT_REGISTRY_PATH;
    }
  }

  return active.url;
}

function matchesQuery(entry, query) {
  const needle = query.toLowerCase();
  const haystack = [
    entry.id,
    entry.name,
    entry.description,
    entry.author,
    entry.category,
    entry.repository,
    ...(entry.tags ?? []),
    ...(entry.targets ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export async function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  if (/^https?:\/\//i.test(registryPath)) {
    throw new Error(
      `Remote registry catalogs must be refreshed before use: ${registryPath}. Run packsmith registry refresh or pass a local --registry catalog.`
    );
  }

  const resolvedPath = path.resolve(registryPath);

  if (!(await pathExists(resolvedPath))) {
    throw new Error(
      `Registry catalog not found: ${resolvedPath}. Restore the packaged registry/catalog.json or pass --registry <catalog>.`
    );
  }

  let cached = catalogCache.get(resolvedPath);
  let currentMtime;

  try {
    currentMtime = (await stat(resolvedPath)).mtimeMs;
  } catch {
    catalogCache.delete(resolvedPath);
    cached = undefined;
  }

  if (cached && cached.mtime === currentMtime) {
    return cached.catalog;
  }

  const raw = await readJson(resolvedPath);

  if (!Array.isArray(raw.packs)) {
    throw new Error(`Registry catalog must include a packs array: ${resolvedPath}`);
  }

  const catalog = {
    path: resolvedPath,
    schemaVersion: raw.schemaVersion ?? 1,
    updatedAt: raw.updatedAt,
    registry: raw.packsmithRegistry,
    packs: raw.packs
  };

  catalogCache.set(resolvedPath, { mtime: currentMtime, catalog });
  return catalog;
}

export async function searchRegistry(query, options = {}) {
  const catalog = await loadRegistry(await resolveConfiguredRegistry(options));
  const results = catalog.packs.filter((entry) => matchesQuery(entry, query));

  return {
    catalog,
    results
  };
}

export async function findRegistryPack(packId, options = {}) {
  const catalog = await loadRegistry(await resolveConfiguredRegistry(options));
  const entry = catalog.packs.find((pack) => pack.id === packId || pack.name === packId);

  if (!entry) {
    const suggestions = catalog.packs
      .filter((pack) => matchesQuery(pack, packId) || pack.id.includes(packId) || pack.name?.toLowerCase().includes(packId.toLowerCase()))
      .slice(0, 3)
      .map((pack) => pack.id);
    const suggestionText =
      suggestions.length > 0
        ? ` Try: ${suggestions.map((suggestion) => `packsmith show ${suggestion}`).join(" or ")}.`
        : " Try: packsmith search review.";

    throw new Error(`Pack "${packId}" was not found in registry ${catalog.path}.${suggestionText}`);
  }

  return {
    catalog,
    entry
  };
}

function assertRegistryString(entry, field, issues) {
  if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" is missing ${field}.`);
  }
}

function assertRegistryRiskLevel(entry, issues) {
  if (typeof entry.riskLevel !== "string" || !["low", "medium", "high", "blocked"].includes(entry.riskLevel)) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" riskLevel must be one of: low, medium, high, blocked.`);
  }
}

function assertRegistrySource(entry, issues) {
  const source = entry.source;

  if (typeof source === "string" && source.trim().length > 0) {
    return;
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" is missing source.`);
    return;
  }

  if (typeof source.type !== "string" || source.type.trim().length === 0) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" source.type must be a non-empty string.`);
  }

  if (["git", "github-archive"].includes(source.type)) {
    if (typeof source.repo !== "string" || source.repo.trim().length === 0) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" source.repo must be a non-empty string for ${source.type}.`);
    }

    if (typeof source.path !== "string" || source.path.trim().length === 0) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" source.path must be a non-empty string for ${source.type}.`);
    }

    if (!source.commit && !source.checksum) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" remote source must include commit or checksum metadata.`);
    }
  }

  if (source.checksum !== undefined && (typeof source.checksum !== "string" || !source.checksum.startsWith("sha256-"))) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" source.checksum must use sha256- format.`);
  }
}

function assertOptionalRegistryNumber(entry, field, issues) {
  if (entry[field] === undefined) {
    return;
  }

  if (typeof entry[field] !== "number" || !Number.isFinite(entry[field]) || entry[field] < 0) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" must include non-negative numeric ${field}.`);
  }
}

function assertRequiredRegistryNumber(entry, field, issues) {
  if (typeof entry[field] !== "number" || !Number.isFinite(entry[field]) || entry[field] < 0) {
    issues.push(`Pack "${entry.id ?? "(missing id)"}" must include non-negative numeric ${field}.`);
  }
}

function resolveSourcePath(catalogPath, source) {
  if (source && typeof source === "object" && !Array.isArray(source)) {
    return source;
  }

  // Type-mismatched catalogs must surface as validation issues, never as a
  // crash: anything that is not a non-empty string (numbers, arrays, null) is
  // handed back as-is so the caller reports it.
  if (typeof source !== "string" || source.trim().length === 0) {
    return source;
  }

  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  return path.isAbsolute(source) ? source : path.resolve(path.dirname(catalogPath), source);
}

/**
 * Validates a registry catalog.
 *
 * @param {Object} options
 * @param {string} [options.registry] - Path to catalog JSON.
 * @param {string|number} [options.qualityGate] - Minimum quality score for
 *   verified packs with a locally checkable source.
 * @param {Function} [options.validatePack] - Injected pack validator (#20):
 *   `(packDir: string) => Promise<{manifest: object, ...}>`.
 * @param {Function} [options.doctorPack] - Injected pack doctor (#20): used
 *   for the quality gate; `(packDir: string) => Promise<{score: {overall: number}, ...}>`.
 */
export async function validateRegistry(options = {}) {
  const catalog = await loadRegistry(await resolveConfiguredRegistry(options));
  const issues = [];
  const seenIds = new Set();
  const checkedPacks = [];
  const validatePackFn = typeof options.validatePack === "function" ? options.validatePack : null;
  const doctorPackFn = typeof options.doctorPack === "function" ? options.doctorPack : null;

  for (const entry of catalog.packs) {
    assertRegistryString(entry, "id", issues);
    assertRegistryString(entry, "name", issues);
    assertRegistryString(entry, "description", issues);
    assertRegistryString(entry, "version", issues);
    assertRegistryString(entry, "author", issues);
    assertRegistryString(entry, "category", issues);
    assertRegistrySource(entry, issues);
    assertRegistryString(entry, "license", issues);
    assertRegistryRiskLevel(entry, issues);
    assertRegistryString(entry, "usageExample", issues);
    if (entry.updatedAt !== undefined && (typeof entry.updatedAt !== "string" || entry.updatedAt.trim().length === 0)) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" updatedAt must be a non-empty string when present.`);
    }

    if (
      entry.tags !== undefined &&
      (!Array.isArray(entry.tags) ||
        entry.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0))
    ) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" tags must contain only non-empty strings when present.`);
    }

    assertOptionalRegistryNumber(entry, "stars", issues);
    assertOptionalRegistryNumber(entry, "installCount", issues);
    assertRequiredRegistryNumber(entry, "estimatedContextSize", issues);

    if (entry.id) {
      if (seenIds.has(entry.id)) {
        issues.push(`Duplicate registry id "${entry.id}".`);
      }

      seenIds.add(entry.id);
    }

    if (!Array.isArray(entry.targets) || entry.targets.length === 0) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" must include at least one target.`);
    } else {
      for (const target of entry.targets) {
        if (!SUPPORTED_TARGET_IDS.has(target)) {
          issues.push(`Pack "${entry.id}" references unsupported target "${target}".`);
        }
      }
    }

    // NOTE: `verified` is a catalog-author declaration, not a cryptographic
    // guarantee. See top-of-file trust model comment (#2).
    if (typeof entry.verified !== "boolean") {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" must include boolean verified metadata.`);
    }

    const sourcePath = resolveSourcePath(catalog.path, entry.source);

    if (sourcePath && typeof sourcePath === "object" && !Array.isArray(sourcePath)) {
      checkedPacks.push({
        id: entry.id,
        source: sourcePath,
        status: "remote-metadata",
        ref: sourcePath.ref,
        tag: sourcePath.tag,
        commit: sourcePath.commit,
        checksum: sourcePath.checksum,
        schemaVersion: sourcePath.schemaVersion
      });
      continue;
    }

    if (typeof sourcePath === "string" && /^https?:\/\//i.test(sourcePath)) {
      checkedPacks.push({ id: entry.id, source: sourcePath, status: "remote-skipped" });
      continue;
    }

    if (typeof sourcePath !== "string" || !(await pathExists(sourcePath))) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" source not found: ${sourcePath ?? "(missing source)"}.`);
      continue;
    }

    if (!validatePackFn) {
      checkedPacks.push({ id: entry.id, source: sourcePath, status: "skipped-no-validator" });
      continue;
    }

    try {
      const result = await validatePackFn(sourcePath);
      checkedPacks.push({ id: entry.id, source: sourcePath, status: "ok", version: result.manifest.version });

      if (entry.id && result.manifest.name !== entry.id) {
        issues.push(`Pack "${entry.id}" source manifest name is "${result.manifest.name}".`);
      }

      if (entry.version && result.manifest.version !== entry.version) {
        issues.push(`Pack "${entry.id}" source version is "${result.manifest.version}", expected "${entry.version}".`);
      }

      if (entry.verified && options.qualityGate !== undefined && doctorPackFn) {
        const gate = Number.parseInt(options.qualityGate, 10);
        const doctor = await doctorPackFn(sourcePath);

        if (Number.isFinite(gate) && doctor.score.overall < gate) {
          issues.push(`Pack "${entry.id}" quality score ${doctor.score.overall} is below gate ${gate}.`);
        }
      }
    } catch (error) {
      issues.push(`Pack "${entry.id ?? "(missing id)"}" source validation failed: ${error.message}`);
    }
  }

  return {
    catalog,
    checkedPacks,
    issues,
    valid: issues.length === 0
  };
}
