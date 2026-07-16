import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

import { TARGET_ADAPTERS } from "../../src/lib/targets.mjs";
import { loadPassport } from "./passport-client.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDirectory, "../..");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const catalogLocales = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const translationLocales = catalogLocales.slice(1);
const riskSchema = z.enum(["low", "medium", "high", "blocked"]);
const permissionSchema = z.enum(["none", "optional", "required"]);
const nonEmptyString = z.string().trim().min(1);
const slugSchema = z.string().regex(slugPattern, "must be a lowercase kebab-case slug");

const permissionsSchema = z
  .object({
    shell: permissionSchema,
    filesystem: permissionSchema,
    network: permissionSchema,
    browser: permissionSchema
  })
  .strict();

const publisherSchema = z
  .object({
    id: nonEmptyString,
    verified: z.boolean()
  })
  .strict();

const catalogPackSchema = z
  .object({
    id: slugSchema,
    name: nonEmptyString,
    description: nonEmptyString,
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, "must be semver"),
    author: nonEmptyString,
    category: nonEmptyString,
    tags: z.array(nonEmptyString),
    targets: z.array(slugSchema).min(1),
    source: nonEmptyString,
    license: nonEmptyString,
    riskLevel: riskSchema,
    estimatedContextSize: z.number().int().nonnegative(),
    usageExample: nonEmptyString,
    verified: z.boolean(),
    publisher: publisherSchema,
    repository: z.url(),
    homepage: z.url(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    stars: z.number().int().nonnegative(),
    installCount: z.number().int().nonnegative(),
    compatibilityNotes: nonEmptyString,
    permissions: permissionsSchema
  })
  .strict();

const catalogSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
    packs: z.array(catalogPackSchema)
  })
  .strict();

const i18nConfigSchema = z
  .object({
    languages: z.array(z.enum(translationLocales)).length(translationLocales.length),
    primaryLanguage: z.literal("en"),
    completionThreshold: z.number().min(0).max(1),
    requiredFields: z.array(z.enum(["name", "description"])),
    optionalFields: z.array(nonEmptyString),
    priorityLanguages: z.array(z.enum(translationLocales)),
    catalogSource: nonEmptyString
  })
  .strict();

const localizationSchema = z
  .object({
    name: nonEmptyString,
    description: nonEmptyString
  })
  .strict();

const translationsSchema = z.record(slugSchema, localizationSchema);

const previewPlanTargetSchema = z
  .object({
    target: slugSchema,
    scope: nonEmptyString,
    installDir: nonEmptyString,
    bridgeFiles: z.array(z.string()),
    warnings: z.array(z.string()),
    checksum: nonEmptyString,
    writes: z.array(nonEmptyString)
  })
  .passthrough();

const previewPlanSchema = z
  .object({
    targets: z.array(previewPlanTargetSchema),
    provenance: z
      .object({
        checksumStatus: z.enum(["calculated", "matched", "mismatch"])
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const passportSchema = z
  .object({
    score: z.object({ overall: z.number().min(0).max(100) }).passthrough(),
    risk: z
      .object({
        computed: riskSchema,
        reasons: z.array(z.string())
      })
      .passthrough(),
    context: z
      .object({
        estimatedChars: z.number().int().nonnegative(),
        tokenPressure: z.enum(["low", "medium", "high"])
      })
      .passthrough(),
    provenance: z
      .object({
        checksum: nonEmptyString,
        checksumStatus: z.enum(["calculated", "matched", "mismatch"])
      })
      .passthrough(),
    audit: z
      .object({
        status: z.literal("preview-only"),
        reason: nonEmptyString
      })
      .passthrough(),
    preview: z
      .object({
        targets: z.array(
          z
            .object({
              id: slugSchema,
              status: z.enum(["preview-ready", "not-ready"]),
              scope: z.string().optional(),
              installDir: z.string().optional(),
              bridgeFiles: z.array(z.string()).optional(),
              warnings: z.array(z.string()).optional(),
              checksum: z.string().optional(),
              checksumStatus: z.enum(["calculated", "matched", "mismatch"]).optional(),
              reason: z.string().optional(),
              plan: previewPlanSchema.optional()
            })
            .passthrough()
        )
      })
      .passthrough()
  })
  .passthrough();

const cacheSchema = z
  .object({
    schemaVersion: z.literal(1),
    fingerprint: nonEmptyString,
    outputHash: nonEmptyString,
    inputs: z.array(nonEmptyString)
  })
  .strict();

function formatSchemaIssues(error) {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
}

function parseWithSchema(schema, value, label) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(`Invalid ${label}: ${formatSchemaIssues(result.error)}`);
  }

  return result.data;
}

async function readJson(filePath, schema, label) {
  let value;

  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid ${label} JSON at ${filePath}: ${error.message}`, { cause: error });
    }

    throw error;
  }

  return parseWithSchema(schema, value, `${label} at ${filePath}`);
}

function hash(value) {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`;
}

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function normalizeRelativePath(filePath, label) {
  const normalized = toPosixPath(filePath);

  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(filePath) || normalized.startsWith("//")) {
    throw new Error(`${label} must be relative, received ${filePath}`);
  }

  return normalized;
}

export function normalizePortablePath(filePath, label = "path") {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error(`${label} must be a non-empty path.`);
  }

  let normalized = toPosixPath(filePath);

  if (/^file:/i.test(normalized)) {
    throw new Error(`${label} contains a non-portable file URL: ${filePath}`);
  }

  if (normalized.split("/").includes("..")) {
    throw new Error(`${label} contains non-portable parent traversal: ${filePath}`);
  }

  const markers = [
    { index: normalized.lastIndexOf("/home/"), replacement: "<home>/", length: "/home/".length },
    { index: normalized.lastIndexOf("/project/"), replacement: "<project>/", length: "/project/".length }
  ].sort((left, right) => right.index - left.index);
  const marker = markers[0];

  if (marker.index >= 0) {
    normalized = `${marker.replacement}${normalized.slice(marker.index + marker.length)}`;
  }

  if (
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith("//")
  ) {
    throw new Error(`${label} contains a non-portable absolute path: ${filePath}`);
  }

  return normalized;
}

function assertPortableStrings(value, label = "repository data") {
  if (typeof value === "string") {
    if (/^file:/i.test(value)) {
      throw new Error(`${label} contains a non-portable file URL: ${value}`);
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      return;
    }

    const normalized = toPosixPath(value);
    const absolutePath = /(?:^|[\s("'`])(?:[A-Za-z]:\/|\/\/|\/(?=[^/\s]))/;

    if (absolutePath.test(normalized)) {
      throw new Error(`${label} contains a non-portable absolute path: ${value}`);
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPortableStrings(item, `${label}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertPortableStrings(item, `${label}.${key}`);
    }
  }
}

async function collectFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function fingerprintRepository(repoRoot) {
  const fixedFiles = [
    path.join(repoRoot, "registry", "catalog.json"),
    path.join(repoRoot, "src", "cli.mjs"),
    path.join(repoRoot, "src", "lib", "targets.mjs"),
    path.join(repoRoot, "src", "lib", "pack.mjs"),
    path.join(repoRoot, "src", "lib", "registry.mjs"),
    path.join(repoRoot, "site", "scripts", "generate-repository-data.mjs"),
    path.join(repoRoot, "site", "scripts", "passport-client.mjs")
  ];
  const files = [
    ...fixedFiles,
    ...(await collectFiles(path.join(repoRoot, "i18n"))),
    ...(await collectFiles(path.join(repoRoot, "official-packs")))
  ];
  const uniqueFiles = [...new Set(files.map((filePath) => path.resolve(filePath)))].sort((left, right) =>
    toPosixPath(path.relative(repoRoot, left)).localeCompare(toPosixPath(path.relative(repoRoot, right)))
  );
  const digest = createHash("sha256");

  for (const filePath of uniqueFiles) {
    digest.update(toPosixPath(path.relative(repoRoot, filePath)));
    digest.update("\0");
    digest.update(await readFile(filePath));
    digest.update("\0");
  }

  return {
    fingerprint: `sha256-${digest.digest("hex")}`,
    inputs: uniqueFiles.map((filePath) => toPosixPath(path.relative(repoRoot, filePath)))
  };
}

async function readValidCache(outputPath, fingerprintPath, fingerprint, inputs) {
  try {
    const [metadataText, outputText] = await Promise.all([
      readFile(fingerprintPath, "utf8"),
      readFile(outputPath, "utf8")
    ]);
    const metadata = parseWithSchema(cacheSchema, JSON.parse(metadataText), "repository data fingerprint cache");
    const outputHash = hash(outputText);

    if (
      metadata.fingerprint !== fingerprint ||
      metadata.outputHash !== outputHash ||
      JSON.stringify(metadata.inputs) !== JSON.stringify(inputs)
    ) {
      return null;
    }

    return {
      data: JSON.parse(outputText),
      outputHash
    };
  } catch {
    return null;
  }
}

function validateUniqueValues(values, label) {
  const seen = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }

    seen.add(value);
  }
}

function validateRepositoryInputs(catalog, i18nConfig, translations, supportedTargetIds) {
  validateUniqueValues(catalog.packs.map((pack) => pack.id), "Pack ID");
  validateUniqueValues(i18nConfig.languages, "i18n language");

  const configuredLocales = new Set(i18nConfig.languages);
  for (const locale of translationLocales) {
    if (!configuredLocales.has(locale)) {
      throw new Error(`Missing i18n language in config: ${locale}`);
    }
  }

  if (!i18nConfig.requiredFields.includes("name") || !i18nConfig.requiredFields.includes("description")) {
    throw new Error('i18n.requiredFields must include both "name" and "description".');
  }

  const supportedTargets = new Set(supportedTargetIds);
  const packIds = new Set(catalog.packs.map((pack) => pack.id));

  for (const pack of catalog.packs) {
    validateUniqueValues(pack.targets, `target in Pack "${pack.id}"`);

    for (const targetId of pack.targets) {
      if (!supportedTargets.has(targetId)) {
        throw new Error(`Pack "${pack.id}" declares unknown or unsupported target "${targetId}".`);
      }
    }

    for (const locale of translationLocales) {
      if (!translations[locale][pack.id]) {
        throw new Error(`Missing ${locale} translation for Pack "${pack.id}".`);
      }
    }
  }

  for (const locale of translationLocales) {
    for (const translatedPackId of Object.keys(translations[locale])) {
      if (!packIds.has(translatedPackId)) {
        throw new Error(`Unknown Pack ID "${translatedPackId}" in ${locale} translations.`);
      }
    }
  }
}

function buildRuntimeTargets(supportedAdapters) {
  return supportedAdapters.map((adapter) => {
    const defaultScope = adapter.defaultScope ?? adapter.scopes[0];
    const installSubdirs = {};

    for (const scope of adapter.scopes) {
      const installSubdir = adapter.installSubdirs?.[scope] ?? (scope === defaultScope ? adapter.installSubdir : undefined);

      if (installSubdir) {
        installSubdirs[scope] = normalizeRelativePath(installSubdir, `${adapter.id}.${scope} install subdirectory`);
      }
    }

    return {
      id: adapter.id,
      name: adapter.name,
      scopes: [...adapter.scopes],
      defaultScope,
      installSubdirs,
      skillDirectoryFormat: adapter.skillDirectoryFormat,
      bridgeFiles: [...adapter.bridgeFiles],
      compatibilityWarnings: [...adapter.compatibilityWarnings]
    };
  });
}

function emptyPreview(targetId, status, reason) {
  const preview = {
    targetId,
    status,
    writes: [],
    bridgeFiles: [],
    warnings: []
  };

  if (reason !== undefined) {
    preview.reason = reason;
  }

  return preview;
}

function buildTargetPreviews(pack, passport, supportedAdapters) {
  const declaredTargets = new Set(pack.targets);
  const passportTargets = new Map(passport.preview.targets.map((target) => [target.id, target]));
  const previews = {};

  for (const adapter of supportedAdapters) {
    if (!declaredTargets.has(adapter.id)) {
      previews[adapter.id] = emptyPreview(adapter.id, "not-declared");
      continue;
    }

    const target = passportTargets.get(adapter.id);
    if (!target || target.status !== "preview-ready") {
      const reason = target?.reason ?? "The CLI did not return a preview for this declared target.";
      assertPortableStrings(reason, `${pack.id}.${adapter.id}.reason`);
      previews[adapter.id] = emptyPreview(adapter.id, "not-ready", reason);
      continue;
    }

    const plan = target.plan;
    const planTargets = plan?.targets ?? [];
    const planTarget = planTargets.find((candidate) => candidate?.target === adapter.id);

    if (!planTarget || !Array.isArray(planTarget.writes)) {
      previews[adapter.id] = emptyPreview(adapter.id, "not-ready", "The CLI preview omitted its target write plan.");
      continue;
    }

    const installPath = planTarget.installDir ?? target.installDir;
    const checksum = planTarget.checksum ?? target.checksum;
    const checksumStatus = target.checksumStatus ?? plan?.provenance?.checksumStatus;

    if (!installPath || !checksum || !checksumStatus) {
      previews[adapter.id] = emptyPreview(adapter.id, "not-ready", "The CLI preview omitted required target metadata.");
      continue;
    }

    previews[adapter.id] = {
      targetId: adapter.id,
      status: "preview-ready",
      scope: planTarget.scope,
      installPathTemplate: normalizePortablePath(installPath, `${pack.id}.${adapter.id}.installPathTemplate`),
      writes: planTarget.writes.map((writePath, index) =>
        normalizePortablePath(writePath, `${pack.id}.${adapter.id}.writes[${index}]`)
      ),
      checksum,
      checksumStatus,
      bridgeFiles: [...(planTarget.bridgeFiles ?? target.bridgeFiles ?? [])],
      warnings: [...(planTarget.warnings ?? target.warnings ?? [])]
    };
  }

  return previews;
}

function buildLocalizations(pack, translations) {
  const localizations = {
    en: {
      name: pack.name,
      description: pack.description
    }
  };

  for (const locale of translationLocales) {
    localizations[locale] = {
      name: translations[locale][pack.id].name,
      description: translations[locale][pack.id].description
    };
  }

  return localizations;
}

function buildSitePack(pack, rawPassport, translations, supportedAdapters) {
  const passport = parseWithSchema(passportSchema, rawPassport, `Passport for Pack "${pack.id}"`);

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    author: pack.author,
    category: pack.category,
    tags: [...pack.tags],
    license: pack.license,
    repository: pack.repository,
    homepage: pack.homepage,
    updatedAt: pack.updatedAt,
    compatibilityNotes: pack.compatibilityNotes,
    targetIds: [...pack.targets],
    permissions: { ...pack.permissions },
    declaredRisk: pack.riskLevel,
    estimatedContextSize: pack.estimatedContextSize,
    verified: pack.verified,
    publisher: { ...pack.publisher },
    localizations: buildLocalizations(pack, translations),
    passport: {
      computedRisk: passport.risk.computed,
      riskReasons: [...passport.risk.reasons],
      qualityScore: passport.score.overall,
      checksum: passport.provenance.checksum,
      checksumStatus: passport.provenance.checksumStatus,
      context: {
        estimatedChars: passport.context.estimatedChars,
        tokenPressure: passport.context.tokenPressure
      },
      audit: {
        status: passport.audit.status,
        reason: passport.audit.reason
      }
    },
    previews: buildTargetPreviews(pack, passport, supportedAdapters)
  };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function loadRepositoryInputs(repoRoot) {
  const catalogPath = path.join(repoRoot, "registry", "catalog.json");
  const i18nConfigPath = path.join(repoRoot, "i18n", "config.json");
  const [catalog, i18nConfig] = await Promise.all([
    readJson(catalogPath, catalogSchema, "catalog"),
    readJson(i18nConfigPath, i18nConfigSchema, "i18n config")
  ]);
  const translations = {};

  await Promise.all(
    translationLocales.map(async (locale) => {
      const translationPath = path.join(repoRoot, "i18n", locale, "catalog-descriptions.json");
      translations[locale] = await readJson(translationPath, translationsSchema, `${locale} translations`);
    })
  );

  return { catalog, i18nConfig, translations };
}

export async function generateRepositoryData(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const outputPath = path.resolve(options.outputPath ?? path.join(repoRoot, "site", "src", "generated", "repository-data.json"));
  const fingerprintPath = path.resolve(
    options.fingerprintPath ?? path.join(repoRoot, "site", ".cache", "repository-data-fingerprint.json")
  );
  const supportedAdapters = TARGET_ADAPTERS.filter((adapter) => adapter.status === "supported");
  const supportedTargetIds = supportedAdapters.map((adapter) => adapter.id);
  const { fingerprint, inputs } = await fingerprintRepository(repoRoot);
  const cached = await readValidCache(outputPath, fingerprintPath, fingerprint, inputs);

  if (cached) {
    return {
      cacheHit: true,
      fingerprint,
      outputHash: cached.outputHash,
      outputPath,
      data: cached.data
    };
  }

  const { catalog, i18nConfig, translations } = await loadRepositoryInputs(repoRoot);
  validateRepositoryInputs(catalog, i18nConfig, translations, supportedTargetIds);

  const rawPassports = await mapWithConcurrency(catalog.packs, 2, (pack) => loadPassport(pack.id));
  const packs = catalog.packs
    .map((pack, index) => buildSitePack(pack, rawPassports[index], translations, supportedAdapters))
    .sort((left, right) => left.id.localeCompare(right.id));
  const data = {
    schemaVersion: catalog.schemaVersion,
    catalogUpdatedAt: catalog.updatedAt,
    supportedTargetIds,
    targets: buildRuntimeTargets(supportedAdapters),
    packs
  };

  assertPortableStrings(data);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  const outputHash = hash(serialized);
  const fingerprintMetadata = `${JSON.stringify({ schemaVersion: 1, fingerprint, outputHash, inputs }, null, 2)}\n`;

  await Promise.all([mkdir(path.dirname(outputPath), { recursive: true }), mkdir(path.dirname(fingerprintPath), { recursive: true })]);
  await writeFile(outputPath, serialized, "utf8");
  await writeFile(fingerprintPath, fingerprintMetadata, "utf8");

  return {
    cacheHit: false,
    fingerprint,
    outputHash,
    outputPath,
    data
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  generateRepositoryData()
    .then((result) => {
      const action = result.cacheHit ? "Repository data cache hit" : "Generated repository data";
      console.log(`${action}: ${result.outputPath} (${result.outputHash})`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
