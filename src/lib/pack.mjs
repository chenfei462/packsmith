import fs, { rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";

// Windows reserved device names (case-insensitive), including variants with extensions like CON.txt
const WINDOWS_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
]);

function isWindowsReservedDeviceName(name) {
  const dotIndex = name.lastIndexOf(".");
  const baseName = dotIndex === -1 ? name.toUpperCase() : name.slice(0, dotIndex).toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(baseName);
}

function hasTrailingDotOrSpace(name) {
  return name.length > 0 && (name.endsWith(".") || name.endsWith(" "));
}

import {
  containsAdsColon,
  copyDirectory,
  copyFileOrDirectory,
  countDirectoryFiles,
  directorySize,
  ensureDir,
  listDirectoryFiles,
  pathExists,
  readJson,
  removePath,
  writeJson,
  writeJsonAtomic,
  withStateLock,
  writeText
} from "./fs-utils.mjs";
// Lazy import to avoid circular dependency with registry.mjs
// findRegistryPack and validateRegistry accept an optional validatePack callback
// import { findRegistryPack } from "./registry.mjs";
import {
  defaultInstallRoot,
  defaultStateDir,
  formatSupportedTargets,
  getSupportedTargetAdapters,
  getTargetAdapter,
  SUPPORTED_TARGET_IDS,
  TARGET_ADAPTERS,
  userHomeDir
} from "./targets.mjs";
import { fetchJsonWithTimeout, fetchBytesWithTimeout, validateGitHubFetchUrl } from "./http.mjs";
import { getLogger, PacksmithError, createPacksmithError } from "./log.mjs";
import { findTyposquattingMatches } from "./typosquatting.mjs";
import { normalizeFrontmatter, parseFrontmatterDoc, splitFrontmatter } from "../core/skill-parser.mjs";

const KNOWN_POLICY_FIELDS = new Set([
  "requireVerified",
  "requiredVerified",
  "allowedPacks",
  "blockedPacks",
  "allowedRegistries",
  "allowedPublishers",
  "allowedRequiredPermissions",
  "allowedPermissions",
  "maxRisk",
  "allowedTargets",
  "maxContextSize"
]);
const POLICY_STRING_LIST_FIELDS = [
  "allowedPacks",
  "blockedPacks",
  "allowedRegistries",
  "allowedPublishers",
  "allowedRequiredPermissions",
  "allowedPermissions",
  "allowedTargets"
];
const KNOWN_PERMISSION_NAMES = new Set(["shell", "filesystem", "network", "browser"]);
const DEFAULT_ALLOWED_REQUIRED_PERMISSIONS = ["filesystem"];
const RISK_ORDER = ["low", "medium", "high", "blocked"];
// Unpacked-content caps for remote github-archive installs (security-input.md
// §1 DoS row): DEFAULT_MAX_RESPONSE_SIZE in http.mjs caps a single HTTP
// response, not what a source unpacks to disk in total. Installers can raise
// or lower both caps per call via options.maxUnpackedBytes / maxUnpackedFiles.
const DEFAULT_MAX_UNPACKED_TOTAL_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_UNPACKED_FILE_COUNT = 2000;

function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

// Recursively lstat the directory tree and reject any symbolic link
async function assertNoSymlinks(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    // lstat to check for symlinks without following them
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic link not allowed in source directory: ${entryPath}`);
    }
    if (stats.isDirectory()) {
      await assertNoSymlinks(entryPath);
    }
  }
}

function assertSafeManifestName(value) {
  assertString(value, "manifest.name");

  if (
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.basename(value) !== value ||
    path.win32.basename(value) !== value ||
    path.posix.parse(value).root ||
    path.win32.parse(value).root
  ) {
    throw new Error('manifest.name must be a simple directory name without path separators, absolute paths, "." or "..".');
  }

  // Reject NTFS alternate data stream syntax (e.g., "evil.txt:stream")
  if (containsAdsColon(value)) {
    throw new Error('manifest.name must not contain NTFS alternate data stream separators (:).');
  }

  // Reject Windows reserved device names (CON, PRN, NUL, COM1-9, LPT1-9, case-insensitive, with or without extension)
  const basename = path.win32.basename(value);
  if (isWindowsReservedDeviceName(basename)) {
    throw new Error(`manifest.name must not be a Windows reserved device name (${Array.from(WINDOWS_RESERVED_NAMES).join(", ")}) or variant.`);
  }

  // Reject trailing dots or spaces (problematic on some filesystems)
  if (hasTrailingDotOrSpace(basename)) {
    throw new Error('manifest.name must not have trailing dots or spaces.');
  }
}

function assertSafeRelativeAssetPath(value, label) {
  assertString(value, label);

  if (value !== value.trim() || value.includes("\0") || value.includes("\\")) {
    throw new Error(`${label} must be a safe relative path using forward slashes.`);
  }

  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-z]:/i.test(value)) {
    throw new Error(`${label} must be a safe relative path, not an absolute path.`);
  }

  const normalized = path.posix.normalize(value);
  const parts = value.split("/");

  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a safe relative path that stays inside the pack directory.`);
  }

  // Validate each path segment for Windows-specific hazards
  // Check each component for NTFS alternate data stream (e.g., "evil.txt:stream")
  for (const segment of parts) {
    if (containsAdsColon(segment)) {
      throw new Error(`${label} segment "${segment}" must not contain NTFS alternate data stream separators (:).`);
    }

    // Check each segment for Windows reserved device names (CON, PRN, NUL, COM1-9, LPT1-9, case-insensitive, with or without extension)
    if (isWindowsReservedDeviceName(segment)) {
      throw new Error(`${label} segment "${segment}" must not be a Windows reserved device name (${Array.from(WINDOWS_RESERVED_NAMES).join(", ")}) or variant.`);
    }

    // Reject trailing dots or spaces in segment names
    if (hasTrailingDotOrSpace(segment)) {
      throw new Error(`${label} segment "${segment}" must not have trailing dots or spaces.`);
    }
  }
}

function resolvePackAssetPath(packDir, relativePath, label) {
  assertSafeRelativeAssetPath(relativePath, label);

  const resolvedPackDir = path.resolve(packDir);
  const resolvedPath = path.resolve(resolvedPackDir, ...relativePath.split("/"));
  const relativeToPack = path.relative(resolvedPackDir, resolvedPath);

  if (!relativeToPack || relativeToPack === ".." || relativeToPack.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPack)) {
    throw new Error(`${label} must stay inside the pack directory.`);
  }

  return resolvedPath;
}

function resolveTargetAssetPath(targetRoot, relativePath, label) {
  assertSafeRelativeAssetPath(relativePath, label);

  const resolvedTargetRoot = path.resolve(targetRoot);
  const resolvedPath = path.resolve(resolvedTargetRoot, ...relativePath.split("/"));
  const relativeToTarget = path.relative(resolvedTargetRoot, resolvedPath);

  if (!relativeToTarget || relativeToTarget === ".." || relativeToTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToTarget)) {
    throw new Error(`${label} must stay inside the target bundle directory.`);
  }

  return resolvedPath;
}

function resolveManifestNamedDirectory(baseDir, manifestName) {
  assertSafeManifestName(manifestName);

  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(path.join(resolvedBase, manifestName));
  const relativePath = path.relative(resolvedBase, resolvedPath);

  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error("manifest.name would write outside the target directory.");
  }

  return resolvedPath;
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function containsPath(parentPath, childPath) {
  const parent = comparablePath(parentPath);
  const child = comparablePath(childPath);
  const relativePath = path.relative(parent, child);

  return !relativePath || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

function pathsOverlap(leftPath, rightPath) {
  return containsPath(leftPath, rightPath) || containsPath(rightPath, leftPath);
}

function assertBuildOutputDoesNotOverlapSource(outputRoot, packDir, manifest) {
  if (containsPath(outputRoot, packDir)) {
    throw new Error(`Build output directory must not overwrite the source pack: ${outputRoot}`);
  }

  for (const skill of manifest.skills) {
    const skillDir = resolvePackAssetPath(packDir, skill.path, `skill "${skill.id}" path`);

    if (pathsOverlap(outputRoot, skillDir)) {
      throw new Error(`Build output directory must not overlap source skill "${skill.id}": ${outputRoot}`);
    }
  }

  for (const prompt of manifest.prompts) {
    const promptPath = resolvePackAssetPath(packDir, prompt.path, `prompt "${prompt.id}" path`);

    if (containsPath(outputRoot, promptPath)) {
      throw new Error(`Build output directory must not overwrite source prompt "${prompt.id}": ${outputRoot}`);
    }
  }
}

function assertInstallDestinationDoesNotOverlapSource(installDir, sourceDir) {
  if (pathsOverlap(installDir, sourceDir)) {
    throw new Error(`Install destination must not overlap the source bundle or source pack: ${installDir}`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
}

function assertOptionalArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function ensureUniqueIds(items, label) {
  const seen = new Set();

  for (const item of items) {
    assertString(item.id, `${label}.id`);

    if (seen.has(item.id)) {
      throw new Error(`Duplicate ${label} id "${item.id}".`);
    }

    seen.add(item.id);
  }
}

// ---------------------------------------------------------------------------
// Manifest v2 normalization boundary (M12, optional opt-in source format).
// `schemaVersion: 2` declares `skills` as safe relative directory-path
// strings; each Skill's id and description are derived from its own
// SKILL.md frontmatter and normalized into the same internal
// {id, path, description} object shape v1 uses, so the builder, inspector,
// validator and doctor keep one downstream contract and built bundles stay
// installer-compatible. v1 (missing schemaVersion or explicit 1) passes
// through untouched. See docs/manifest-v2.md.
// ---------------------------------------------------------------------------
const KNOWN_RELIABILITY_KEYS = new Set(["runs", "minRecall", "minPrecision"]);

function manifestSchemaVersion(manifest) {
  const version = manifest?.schemaVersion;
  if (version === undefined || version === 1) {
    return { version: 1 };
  }
  if (version === 2) {
    return { version: 2 };
  }
  // Deliberately no echo of the raw value: it is unvetted manifest content.
  return { error: "unsupported schemaVersion (expected 1, or omitted, or 2)." };
}

/** Resolve one directory path to its real location and require it to stay
 * inside the pack's REAL boundary (the realpath of the pack root). Returns
 * the real path, or null with a collected issue. A final symlink/junction
 * component is allowed only when its resolution stays inside the pack; the
 * authoritative containment gate for SKILL.md bytes is the opened-handle
 * verification in readVerifiedSkillFrontmatter. */
async function realpathInsidePack(realPackDir, targetPath, issuePrefix, issues) {
  let stats;
  try {
    stats = await lstat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      issues.push(`${issuePrefix} does not exist inside the pack directory.`);
    } else {
      issues.push(`${issuePrefix} cannot be inspected (${error.code ?? "stat fault"}).`);
    }
    return null;
  }
  if (!stats.isDirectory() && !stats.isSymbolicLink()) {
    issues.push(`${issuePrefix} is not a directory.`);
    return null;
  }
  let realPath;
  try {
    realPath = await fs.realpath(targetPath);
  } catch (error) {
    issues.push(`${issuePrefix} cannot be resolved (${error.code ?? "resolve fault"}).`);
    return null;
  }
  if (!containsPath(realPackDir, realPath)) {
    issues.push(`${issuePrefix} resolves outside the pack directory (symlink or junction escape refused).`);
    return null;
  }
  return realPath;
}

/**
 * Open SKILL.md, verify the OPENED file's identity and containment, and read
 * the frontmatter bytes from that same handle. Verification order:
 * open → fstat → realpath → containment → identity agreement — so a symlink
 * or junction swap of the skill directory (before or after the directory
 * checks) is refused WITHOUT reading any bytes: every refusal path happens
 * before the read. Identity agreement means the opened handle's (dev, ino)
 * must still be the file the verified path points at now; a swap in between
 * fails closed. Frontmatter parsing reuses the existing pure parser helpers,
 * so error reporting stays status-name-only (never raw YAML content). A
 * close fault on the verified read path fails closed as well (M10 lesson:
 * success-path close errors are never swallowed). Returns the validated
 * `{ name, description }`, or null with collected issues.
 */
async function readVerifiedSkillFrontmatter(realPackDir, skillFilePath, issuePrefix, issues) {
  let handle;
  try {
    handle = await fs.open(skillFilePath, "r");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      issues.push(`${issuePrefix} must include SKILL.md.`);
    } else if (error.code === "EISDIR") {
      issues.push(`${issuePrefix} SKILL.md is not a file.`);
    } else {
      issues.push(`${issuePrefix} SKILL.md cannot be opened (${error.code ?? "open fault"}).`);
    }
    return null;
  }

  let result = null;
  try {
    let handleStats;
    try {
      handleStats = await handle.stat();
    } catch (error) {
      issues.push(`${issuePrefix} SKILL.md cannot be inspected (${error.code ?? "stat fault"}).`);
      return null;
    }
    if (!handleStats.isFile()) {
      issues.push(`${issuePrefix} SKILL.md is not a file.`);
      return null;
    }

    let realFilePath;
    try {
      realFilePath = await fs.realpath(skillFilePath);
    } catch (error) {
      if (error.code === "ENOTEMPTY" || error.code === "ELOOP") {
        issues.push(`${issuePrefix} SKILL.md was swapped while being verified (redirected directory refused).`);
      } else {
        issues.push(`${issuePrefix} SKILL.md cannot be resolved (${error.code ?? "resolve fault"}).`);
      }
      return null;
    }
    if (!containsPath(realPackDir, realFilePath)) {
      issues.push(`${issuePrefix} SKILL.md resolves outside the pack directory (symlink or junction escape refused).`);
      return null;
    }

    let pathStats;
    try {
      pathStats = await lstat(realFilePath);
    } catch {
      issues.push(`${issuePrefix} SKILL.md was swapped while being verified (identity mismatch refused).`);
      return null;
    }
    if (pathStats.dev !== handleStats.dev || pathStats.ino !== handleStats.ino) {
      issues.push(`${issuePrefix} SKILL.md was swapped while being verified (identity mismatch refused).`);
      return null;
    }

    let raw;
    try {
      raw = await handle.readFile({ encoding: "utf8" });
    } catch (error) {
      issues.push(`${issuePrefix} SKILL.md cannot be read (${error.code ?? "read fault"}).`);
      return null;
    }

    const { frontmatterText, hasBlock } = splitFrontmatter(raw);
    if (!hasBlock) {
      issues.push(`${issuePrefix} SKILL.md has no usable frontmatter (missing-frontmatter).`);
      return null;
    }
    const { value, error } = parseFrontmatterDoc(frontmatterText);
    if (error) {
      // Sanitized: the parser keeps raw YAML error content local; only the
      // stable status name reaches the report.
      issues.push(`${issuePrefix} SKILL.md has no usable frontmatter (invalid-yaml).`);
      return null;
    }
    if (value === null || value === undefined) {
      issues.push(`${issuePrefix} SKILL.md has no usable frontmatter (empty-frontmatter).`);
      return null;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      issues.push(`${issuePrefix} SKILL.md has no usable frontmatter (frontmatter-not-mapping).`);
      return null;
    }
    const { name, description } = normalizeFrontmatter(value);
    if (typeof name !== "string" || name.trim().length === 0) {
      issues.push(`${issuePrefix} SKILL.md frontmatter is missing a usable name.`);
      return null;
    }
    if (typeof description !== "string" || description.trim().length === 0) {
      issues.push(`${issuePrefix} SKILL.md frontmatter is missing a usable description.`);
      return null;
    }
    result = { name, description };
  } finally {
    try {
      await handle.close();
    } catch (error) {
      issues.push(`${issuePrefix} SKILL.md handle failed to close (${error.code ?? "close fault"}).`);
      result = null;
    }
  }
  return result;
}

/**
 * The single v1/v2 source-manifest boundary (M12). Returns
 * `{ manifest, issues }`: empty `issues` means usable. v1 manifests pass
 * through untouched; v2 manifests are validated (skills as safe relative
 * directory paths, SKILL.md frontmatter as the authority for id/description,
 * duplicate paths and derived ids, optional reliability metadata) and
 * normalized to the internal object shape. Fail-fast callers throw the first
 * issue; collected validation appends every issue. SKILL.md bytes are read
 * only through an opened file handle whose identity (fstat) and realpath
 * containment are verified after opening, so a symlink or junction —
 * including one swapped in after the directory checks — can never make this
 * boundary read outside the pack. The boundary never writes to disk and
 * never mutates its input.
 */
export async function normalizeSourceManifest(manifest, packDir) {
  const schema = manifestSchemaVersion(manifest);
  if (schema.error) {
    return { manifest: null, issues: [`packsmith.json: ${schema.error}`] };
  }
  if (schema.version === 1) {
    return { manifest, issues: [] };
  }

  const issues = [];
  const absolutePackDir = path.resolve(packDir);
  let realPackDir;
  try {
    realPackDir = await fs.realpath(absolutePackDir);
  } catch (error) {
    return { manifest: null, issues: [`packsmith.json: cannot resolve the pack directory (${error.code ?? "resolve fault"}).`] };
  }

  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    issues.push("packsmith.json: manifest.skills must be a non-empty array of skill directory path strings.");
    return { manifest: null, issues };
  }

  if (manifest.prompts !== undefined && !Array.isArray(manifest.prompts)) {
    issues.push("packsmith.json: manifest.prompts must be an array.");
  }

  // Optional reliability metadata is validated and preserved as pack metadata
  // only. It deliberately does NOT change `packsmith ci` verdicts, scoring or
  // any runner in M11/M12; enforcing it is a later, explicit change
  // (docs/manifest-v2.md).
  let reliability;
  const reliabilityValue = manifest.reliability;
  if (reliabilityValue !== undefined) {
    if (reliabilityValue === null || typeof reliabilityValue !== "object" || Array.isArray(reliabilityValue)) {
      issues.push("packsmith.json: manifest.reliability must be an object.");
    } else {
      const unknownKeys = Object.keys(reliabilityValue).filter((key) => !KNOWN_RELIABILITY_KEYS.has(key));
      if (unknownKeys.length > 0) {
        issues.push(`packsmith.json: manifest.reliability has unknown key(s): ${unknownKeys.join(", ")}.`);
      }
      if (reliabilityValue.runs !== undefined && (!Number.isSafeInteger(reliabilityValue.runs) || reliabilityValue.runs < 1 || reliabilityValue.runs > 20)) {
        issues.push("packsmith.json: manifest.reliability.runs must be an integer from 1 to 20.");
      }
      for (const key of ["minRecall", "minPrecision"]) {
        const bound = reliabilityValue[key];
        if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound) || bound < 0 || bound > 1)) {
          issues.push(`packsmith.json: manifest.reliability.${key} must be a number between 0 and 1.`);
        }
      }
      reliability = reliabilityValue;
    }
  }

  const seenPaths = new Set();
  const seenIds = new Set();
  const skills = [];

  for (const entry of manifest.skills) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push("packsmith.json: manifest.skills entries must be non-empty relative directory path strings.");
      continue;
    }
    try {
      assertSafeRelativeAssetPath(entry, "manifest.skills entry");
    } catch (error) {
      issues.push(`packsmith.json: ${error.message}`);
      continue;
    }
    if (seenPaths.has(entry)) {
      issues.push(`packsmith.json: duplicate skill path "${entry}".`);
      continue;
    }
    seenPaths.add(entry);

    const issuePrefix = `packsmith.json: skill path "${entry}"`;
    let absoluteSkillDir;
    try {
      absoluteSkillDir = resolvePackAssetPath(absolutePackDir, entry, "manifest.skills entry");
    } catch (error) {
      issues.push(`packsmith.json: ${error.message}`);
      continue;
    }
    const realSkillDir = await realpathInsidePack(realPackDir, absoluteSkillDir, issuePrefix, issues);
    if (realSkillDir === null) continue;

    // SKILL.md frontmatter is authoritative for v2 Skill id and description.
    // The bytes are read ONLY through a handle whose identity and containment
    // were verified after opening — never by re-traversing the directory
    // path, which a racing junction swap could repoint outside the pack
    // between verification and read.
    const frontmatter = await readVerifiedSkillFrontmatter(realPackDir, path.join(realSkillDir, "SKILL.md"), issuePrefix, issues);
    if (frontmatter === null) continue;
    const { name, description } = frontmatter;
    if (seenIds.has(name)) {
      issues.push(`packsmith.json: duplicate skill id "${name}" derived from SKILL.md frontmatter.`);
      continue;
    }
    seenIds.add(name);
    skills.push({ id: name, path: entry, description });
  }

  if (issues.length > 0) {
    return { manifest: null, issues };
  }

  const normalized = {
    ...manifest,
    skills,
    prompts: Array.isArray(manifest.prompts) ? manifest.prompts : []
  };
  if (reliability !== undefined) {
    normalized.reliability = reliability;
  }
  return { manifest: normalized, issues };
}

async function loadManifest(packDir) {
  const manifestPath = path.join(packDir, "packsmith.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const rawManifest = await readJson(manifestPath);
  const normalized = await normalizeSourceManifest(rawManifest, packDir);
  if (normalized.issues.length > 0) {
    throw new Error(normalized.issues[0]);
  }
  const manifest = normalized.manifest;

  assertSafeManifestName(manifest.name);
  assertString(manifest.description, "manifest.description");
  assertString(manifest.version, "manifest.version");
  assertArray(manifest.targets, "manifest.targets");
  assertArray(manifest.skills, "manifest.skills");
  assertOptionalArray(manifest.prompts, "manifest.prompts");

  for (const target of manifest.targets) {
    if (!SUPPORTED_TARGET_IDS.has(target)) {
      throw new Error(`Unsupported target "${target}". Supported targets: ${formatSupportedTargets()}.`);
    }
  }

  ensureUniqueIds(manifest.skills, "skill");
  ensureUniqueIds(manifest.prompts, "prompt");

  for (const skill of manifest.skills) {
    assertSafeRelativeAssetPath(skill.path, `skill "${skill.id}" path`);
    assertString(skill.description, `skill "${skill.id}" description`);
  }

  for (const prompt of manifest.prompts) {
    assertSafeRelativeAssetPath(prompt.path, `prompt "${prompt.id}" path`);
    assertString(prompt.description, `prompt "${prompt.id}" description`);
  }

  return { manifestPath, manifest };
}

async function readDirectoryTextChars(dirPath) {
  let total = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      total += await readDirectoryTextChars(entryPath);
    } else {
      const content = await readFile(entryPath, "utf8");
      total += content.length;
    }
  }

  return total;
}

async function validateAssets(packDir, manifest) {
  const skillSummaries = [];
  const promptSummaries = [];

  for (const skill of manifest.skills) {
    const absoluteSkillDir = resolvePackAssetPath(packDir, skill.path, `skill "${skill.id}" path`);
    const skillEntryPath = path.join(absoluteSkillDir, "SKILL.md");

    if (!(await pathExists(absoluteSkillDir))) {
      throw new Error(`Missing skill directory for "${skill.id}": ${absoluteSkillDir}`);
    }

    if (!(await pathExists(skillEntryPath))) {
      throw new Error(`Skill "${skill.id}" must include SKILL.md: ${skillEntryPath}`);
    }

    const bytes = await directorySize(absoluteSkillDir);
    const fileCount = await countDirectoryFiles(absoluteSkillDir);
    const contextChars = await readDirectoryTextChars(absoluteSkillDir);

    skillSummaries.push({
      id: skill.id,
      path: skill.path,
      bytes,
      fileCount,
      contextChars
    });
  }

  for (const prompt of manifest.prompts) {
    const absolutePromptPath = resolvePackAssetPath(packDir, prompt.path, `prompt "${prompt.id}" path`);

    if (!(await pathExists(absolutePromptPath))) {
      throw new Error(`Missing prompt file for "${prompt.id}": ${absolutePromptPath}`);
    }

    const content = await readFile(absolutePromptPath, "utf8");

    promptSummaries.push({
      id: prompt.id,
      path: prompt.path,
      bytes: Buffer.byteLength(content, "utf8"),
      contextChars: content.length
    });
  }

  return { skillSummaries, promptSummaries };
}

function buildCatalog(manifest, skillSummaries, promptSummaries) {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    targets: manifest.targets,
    skills: skillSummaries,
    prompts: promptSummaries,
    estimatedContextChars:
      skillSummaries.reduce((sum, skill) => sum + skill.contextChars, 0) +
      promptSummaries.reduce((sum, prompt) => sum + prompt.contextChars, 0)
  };
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function buildCodexAgentsFile(manifest) {
  const skillList = manifest.skills
    .map((skill) => `- \`${skill.id}\`: ${skill.description}`)
    .join("\n");

  return `# ${manifest.name} Codex Bundle

This bundle was generated by Packsmith.

Use these bundled skills when relevant:

${skillList}
`;
}

function buildTargetReadme(target, manifest) {
  const installHints = {
    "claude-code":
      "Copy the bundled `skills/` directory into your Claude Code skills location, for example under `.claude/skills/<pack-name>/`.",
    codex:
      "Keep the bundled `skills/` directory with your repo and use the generated `AGENTS.md` as the bridge document for Codex-oriented workflows.",
    "github-copilot":
      "Install this directory under `.github/skills/<pack-name>/`. `SKILL.md` is the Copilot-facing bridge for the copied Packsmith assets.",
    opencode:
      "Install this directory under `.opencode/skills/<pack-name>/`. `PACKSMITH.md` explains the included skills and prompts for OpenCode users.",
    cursor:
      "Install this directory under `.cursor/rules/packsmith/<pack-name>/`. The generated `.mdc` rule points Cursor at the copied Packsmith assets.",
    trae:
      "Install this directory under `.trae/skills/<pack-name>/`, `.traecli/skills/<pack-name>/`, or `~/.trae-cn/skills/<pack-name>/`. `SKILL.md` is the TRAE-facing bridge for the copied Packsmith assets."
  };
  const installHint = installHints[target] ?? "Copy this bundle into the matching runtime directory.";

  return `# ${manifest.name} for ${target}

Generated by Packsmith.

## Included

- ${manifest.skills.length} skill(s)
- ${manifest.prompts.length} prompt(s)

## Install

${installHint}
`;
}

function buildOpenCodeBridgeFile(manifest) {
  const skills = manifest.skills.map((skill) => `- ${skill.id}: ${skill.description}`).join("\n");
  const prompts = manifest.prompts.map((prompt) => `- ${prompt.id}: ${prompt.description}`).join("\n");

  return `# ${manifest.name} OpenCode Pack

Generated by Packsmith.

Use this pack when one of these reusable workflows is relevant.

## Skills

${skills}

## Prompts

${prompts}
`;
}

function buildCursorRuleFile(manifest) {
  const skills = manifest.skills.map((skill) => `- ${skill.id}: ${skill.description}`).join("\n");
  const prompts = manifest.prompts.map((prompt) => `- ${prompt.id}: ${prompt.description}`).join("\n");

  return `---
description: ${manifest.description}
alwaysApply: false
---

# ${manifest.name}

This Cursor rule was generated by Packsmith. Use it when the current task matches one of the copied pack workflows.

## Skills

${skills}

## Prompts

${prompts}

Packsmith assets are copied beside this rule under \`skills/\` and \`prompts/\`.
`;
}

function buildGitHubCopilotSkillFile(manifest) {
  const skills = manifest.skills.map((skill) => `- ${skill.id}: ${skill.description}`).join("\n");
  const prompts = manifest.prompts.map((prompt) => `- ${prompt.id}: ${prompt.description}`).join("\n");
  const permissions = Object.entries(manifest.permissions ?? {})
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n");

  return `---
name: ${manifest.name}
description: ${manifest.description}
---

# ${manifest.name}

Use this GitHub Copilot agent skill when the task matches the pack description or the user names this Packsmith pack.

## Included Skills

${skills}

## Prompts

${prompts || "- No prompts declared."}

## Permissions

${permissions || "- No permissions declared."}

## Output Contract

Follow the bundled Packsmith skill instructions under \`skills/\` and return the output format requested by the selected skill.
`;
}

function buildTraeSkillFile(manifest) {
  const skills = manifest.skills.map((skill) => `- ${skill.id}: ${skill.description}`).join("\n");
  const prompts = manifest.prompts.map((prompt) => `- ${prompt.id}: ${prompt.description}`).join("\n");
  const permissions = Object.entries(manifest.permissions ?? {})
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n");

  return `---
name: ${manifest.name}
description: ${manifest.description}
---

# ${manifest.name}

Use this TRAE Skill directory when the task matches this Packsmith pack or the user names this workflow.

## Included Skills

${skills}

## Prompts

${prompts || "- No prompts declared."}

## Permissions

${permissions || "- No permissions declared."}

## Output Contract

Follow the copied Packsmith instructions under \`skills/\`, use prompts from \`prompts/\` when relevant, and return the output format requested by the selected skill.
`;
}

function buildPackManifest(packName) {
  return {
    name: packName,
    description: `Reusable skills for ${packName}.`,
    version: "0.1.0",
    targets: ["claude-code", "codex"],
    skills: [
      {
        id: "starter-skill",
        path: "skills/starter-skill",
        description: "Starter workflow for your first Packsmith skill."
      }
    ],
    prompts: [
      {
        id: "starter-prompt",
        path: "prompts/starter-prompt.md",
        description: "Starter prompt for launching a Packsmith pack."
      }
    ]
  };
}

async function emitTargetBundle(packDir, targetRoot, target, manifest) {
  if (!SUPPORTED_TARGET_IDS.has(target)) {
    return;
  }

  await removePath(targetRoot);
  await ensureDir(targetRoot);

  for (const skill of manifest.skills) {
    const source = resolvePackAssetPath(packDir, skill.path, `skill "${skill.id}" path`);
    const targetDir = resolveTargetAssetPath(targetRoot, skill.path, `skill "${skill.id}" path`);
    await copyDirectory(source, targetDir);
  }

  for (const prompt of manifest.prompts) {
    const source = resolvePackAssetPath(packDir, prompt.path, `prompt "${prompt.id}" path`);
    const targetFile = resolveTargetAssetPath(targetRoot, prompt.path, `prompt "${prompt.id}" path`);
    const promptContent = await readFile(source, "utf8");
    await writeText(targetFile, promptContent);
  }

  await writeText(path.join(targetRoot, "README.md"), buildTargetReadme(target, manifest));

  if (target === "codex") {
    await writeText(path.join(targetRoot, "AGENTS.md"), buildCodexAgentsFile(manifest));
  }

  if (target === "github-copilot") {
    await writeText(path.join(targetRoot, "SKILL.md"), buildGitHubCopilotSkillFile(manifest));
  }

  if (target === "opencode") {
    await writeText(path.join(targetRoot, "PACKSMITH.md"), buildOpenCodeBridgeFile(manifest));
  }

  if (target === "cursor") {
    await writeText(path.join(targetRoot, `${manifest.name}.mdc`), buildCursorRuleFile(manifest));
  }

  if (target === "trae") {
    await writeText(path.join(targetRoot, "SKILL.md"), buildTraeSkillFile(manifest));
  }

  await writeJson(path.join(targetRoot, "bundle.json"), {
    target,
    pack: manifest.name,
    version: manifest.version,
    skills: manifest.skills.map((skill) => ({
      id: skill.id,
      path: toPosixPath(path.join(skill.path, "SKILL.md"))
    })),
    prompts: manifest.prompts.map((prompt) => ({
      id: prompt.id,
      path: toPosixPath(prompt.path)
    }))
  });
}

/**
 * Collect every validation problem in a pack instead of failing on the first
 * one, so `packsmith validate` can report "N errors" with one line each
 * (design-input §4, ERR-validate).
 *
 * Deliberately additive: `loadManifest`/`validateAssets` keep their
 * fail-fast behavior for build/inspect, where the first error is enough.
 * Paths are reported relative to the pack directory for readability.
 */
async function collectValidationIssues(packDir) {
  const absolutePackDir = path.resolve(packDir);
  const manifestPath = path.join(absolutePackDir, "packsmith.json");
  const issues = [];
  const relative = (absolute) => {
    const rel = path.relative(absolutePackDir, absolute);
    return rel && !rel.startsWith("..") ? toPosixPath(rel) : toPosixPath(absolute);
  };

  if (!(await pathExists(manifestPath))) {
    return { manifestPath, manifest: null, issues: ["packsmith.json: missing manifest"] };
  }

  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    return { manifestPath, manifest: null, issues: [`packsmith.json: ${error.message}`] };
  }

  const attempt = (label, fn) => {
    try {
      fn();
    } catch (error) {
      issues.push(label ? `${label}: ${error.message}` : error.message);
    }
  };

  attempt("packsmith.json", () => assertSafeManifestName(manifest.name));
  attempt("packsmith.json", () => assertString(manifest.description, "manifest.description"));
  attempt("packsmith.json", () => assertString(manifest.version, "manifest.version"));
  attempt("packsmith.json", () => assertArray(manifest.targets, "manifest.targets"));
  attempt("packsmith.json", () => assertArray(manifest.skills, "manifest.skills"));
  attempt("packsmith.json", () => assertOptionalArray(manifest.prompts, "manifest.prompts"));

  for (const target of Array.isArray(manifest.targets) ? manifest.targets : []) {
    if (!SUPPORTED_TARGET_IDS.has(target)) {
      issues.push(`packsmith.json: unsupported target "${target}". Supported targets: ${formatSupportedTargets()}.`);
    }
  }

  // Manifest v2 (M12): v1 passes through unchanged; v2 runs the shared
  // normalization boundary and collects every issue it reports. When the v2
  // manifest is clean, the object-level checks below run against the
  // normalized manifest; when it has issues they are already collected here,
  // so the object-entry loops are skipped instead of reporting noise.
  const schema = manifestSchemaVersion(manifest);
  let effective = null;
  if (schema.error) {
    issues.push(`packsmith.json: ${schema.error}`);
  } else if (schema.version === 2) {
    const normalized = await normalizeSourceManifest(manifest, absolutePackDir);
    issues.push(...normalized.issues);
    if (normalized.issues.length === 0) {
      effective = normalized.manifest;
    }
  } else {
    effective = manifest;
  }

  if (effective !== null) {
    attempt("packsmith.json", () => ensureUniqueIds(effective.skills ?? [], "skill"));
    attempt("packsmith.json", () => ensureUniqueIds(effective.prompts ?? [], "prompt"));

    for (const skill of Array.isArray(effective.skills) ? effective.skills : []) {
      const label = `skill "${skill?.id ?? "(missing id)"}" (${skill?.path ?? "missing path"})`;
      attempt(label, () => assertSafeRelativeAssetPath(skill?.path, "path"));

      let absoluteSkillDir = null;
      try {
        absoluteSkillDir = resolvePackAssetPath(absolutePackDir, skill.path, "path");
      } catch {
        continue; // Path itself is unsafe; already reported above.
      }

      if (!(await pathExists(absoluteSkillDir))) {
        issues.push(`${label}: missing directory ${relative(absoluteSkillDir)}`);
        continue;
      }

      const skillEntryPath = path.join(absoluteSkillDir, "SKILL.md");

      if (!(await pathExists(skillEntryPath))) {
        issues.push(`${label}: must include SKILL.md`);
      }

      attempt(label, () => assertString(skill?.description, "description"));
    }

    for (const prompt of Array.isArray(effective.prompts) ? effective.prompts : []) {
      const label = `prompt "${prompt?.id ?? "(missing id)"}" (${prompt?.path ?? "missing path"})`;
      attempt(label, () => assertSafeRelativeAssetPath(prompt?.path, "path"));

      let absolutePromptPath = null;
      try {
        absolutePromptPath = resolvePackAssetPath(absolutePackDir, prompt.path, "path");
      } catch {
        continue; // Path itself is unsafe; already reported above.
      }

      if (!(await pathExists(absolutePromptPath))) {
        issues.push(`${label}: referenced file not found (${relative(absolutePromptPath)})`);
      }

      attempt(label, () => assertString(prompt?.description, "description"));
    }
  }

  return { manifestPath, manifest, issues };
}

export async function validatePack(packDir) {
  const absolutePackDir = path.resolve(packDir);
  const collected = await collectValidationIssues(absolutePackDir);

  if (collected.issues.length > 0) {
    throw createPacksmithError(
      "validate_fail",
      { count: collected.issues.length, errors: collected.issues },
      path.basename(absolutePackDir)
    );
  }

  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);

  return {
    manifest,
    packDir: absolutePackDir,
    skillCount: skillSummaries.length,
    promptCount: promptSummaries.length
  };
}

export async function inspectPack(packDir) {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);

  return {
    packDir: absolutePackDir,
    name: catalog.name,
    version: catalog.version,
    targets: catalog.targets,
    targetCount: catalog.targets.length,
    skillCount: catalog.skills.length,
    promptCount: catalog.prompts.length,
    estimatedContextChars: catalog.estimatedContextChars,
    skills: catalog.skills
  };
}

export async function buildPack(packDir, outDir = "dist") {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const outputBase = path.isAbsolute(outDir) ? outDir : path.join(absolutePackDir, outDir);
  const outputRoot = resolveManifestNamedDirectory(outputBase, manifest.name);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);

  assertBuildOutputDoesNotOverlapSource(outputRoot, absolutePackDir, manifest);
  await removePath(outputRoot);
  await ensureDir(outputRoot);
  await writeJson(path.join(outputRoot, "manifest.json"), manifest);
  await writeJson(path.join(outputRoot, "catalog.json"), catalog);

  const buildableTargets = manifest.targets.filter((target) => SUPPORTED_TARGET_IDS.has(target));

  for (const target of buildableTargets) {
    const targetRoot = path.join(outputRoot, target);
    await emitTargetBundle(absolutePackDir, targetRoot, target, manifest);
  }

  return {
    manifest,
    outputRoot,
    targetsBuilt: buildableTargets,
    targetsPlanned: manifest.targets.filter((target) => !SUPPORTED_TARGET_IDS.has(target))
  };
}

export async function initPack(targetDir) {
  const absoluteTargetDir = path.resolve(targetDir);
  const packName = path.basename(absoluteTargetDir);
  const manifest = buildPackManifest(packName);
  const skillDir = path.join(absoluteTargetDir, "skills", "starter-skill");
  const promptPath = path.join(absoluteTargetDir, "prompts", "starter-prompt.md");

  await ensureDir(skillDir);
  await ensureDir(path.dirname(promptPath));
  await writeJson(path.join(absoluteTargetDir, "packsmith.json"), manifest);
  await writeText(
    path.join(skillDir, "SKILL.md"),
    `---
name: starter-skill
description: Starter Packsmith skill for ${packName}.
---

# Starter Skill

Use this skill as the first workflow in your new pack.

## Workflow

1. Define the user problem.
2. Collect the primary evidence.
3. End with one concrete recommendation.
`
  );
  await writeText(
    promptPath,
    `# Starter Prompt

You are shaping the first workflow for ${packName}.

Return:

- user
- problem
- evidence
- recommendation
`
  );

  return {
    packDir: absoluteTargetDir,
    manifest
  };
}

function isBuiltBundleDir(dirPath) {
  return pathExists(path.join(dirPath, "manifest.json"));
}

function isSourcePackDir(dirPath) {
  return pathExists(path.join(dirPath, "packsmith.json"));
}

function validateInstallTarget(target) {
  if (!target || !SUPPORTED_TARGET_IDS.has(target)) {
    throw new Error(`Install target must be one of: ${Array.from(SUPPORTED_TARGET_IDS).join(", ")}.`);
  }
}

function normalizeChecksum(value) {
  return `sha256-${value}`;
}

async function hashDirectory(dirPath) {
  // Reject symbolic links before hashing - links could point outside the directory
  await assertNoSymlinks(dirPath);

  const hash = createHash("sha256");
  const files = await listDirectoryFiles(dirPath);

  for (const relativePath of files) {
    const absolutePath = path.join(dirPath, relativePath);
    const content = await readFile(absolutePath);
    hash.update(relativePath.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return normalizeChecksum(hash.digest("hex"));
}

async function scanDirectoryAssets(dirPath) {
  // Reject symbolic links before scanning
  await assertNoSymlinks(dirPath);

  const files = await listDirectoryFiles(dirPath);
  let hasScripts = false;
  let hasBinaries = false;
  let hasExecutables = false;
  const largeFiles = [];

  for (const relativePath of files) {
    const absolutePath = path.join(dirPath, relativePath);
    const details = await lstat(absolutePath);
    const ext = path.extname(relativePath).toLowerCase();

    if ([".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".js", ".mjs", ".cjs", ".py", ".rb"].includes(ext)) {
      hasScripts = true;
    }

    if ([".exe", ".dll", ".so", ".dylib", ".bin"].includes(ext)) {
      hasBinaries = true;
    }

    if ((details.mode & 0o111) !== 0) {
      hasExecutables = true;
    }

    if (details.size > 100000) {
      largeFiles.push(relativePath);
    }
  }

  return {
    fileCount: files.length,
    hasScripts,
    hasBinaries,
    hasExecutables,
    largeFiles
  };
}

function inferRiskLevel(manifest, registryEntry, assets, { scriptRequiresHighRisk = false } = {}) {
  const permissions = manifest.permissions ?? {};
  const inferred =
    permissions.shell === "required" ||
    permissions.network === "required" ||
    permissions.browser === "required" ||
    assets.hasBinaries ||
    assets.hasExecutables ||
    (scriptRequiresHighRisk && assets.hasScripts)
      ? "high"
      : assets.hasScripts || permissions.network === "optional" || permissions.browser === "optional"
        ? "medium"
        : "low";

  return highestRiskLevel(registryEntry?.riskLevel, manifest.context?.riskLevel, inferred);
}

function riskIndex(level) {
  const index = RISK_ORDER.indexOf(level);
  return index === -1 ? 0 : index;
}

function normalizeRiskLevel(level) {
  return RISK_ORDER.includes(level) ? level : null;
}

function highestRiskLevel(...levels) {
  let highest = "low";

  for (const level of levels) {
    const normalized = normalizeRiskLevel(level);

    if (normalized && riskIndex(normalized) > riskIndex(highest)) {
      highest = normalized;
    }
  }

  return highest;
}

function allowsRisk(actualRisk, allowedRisk = "medium") {
  const normalizedActual = normalizeRiskLevel(actualRisk);
  const normalizedAllowed = normalizeRiskLevel(String(allowedRisk).toLowerCase().trim());

  if (!normalizedActual || !normalizedAllowed) {
    return false;
  }

  return riskIndex(normalizedActual) <= riskIndex(normalizedAllowed);
}

function normalizePackName(packName) {
  return process.platform === "win32" || process.platform === "darwin" ? packName.toLowerCase() : packName;
}

async function loadLockfile(stateDir) {
  const lockPath = path.join(stateDir, "packsmith.lock");

  if (!(await pathExists(lockPath))) {
    return {
      lockfileVersion: 1,
      installed: []
    };
  }

  const lockfile = await readJson(lockPath);
  lockfile.installed ??= [];
  return lockfile;
}

async function saveLockfile(stateDir, lockfile) {
  lockfile.generatedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(stateDir, "packsmith.lock"), lockfile);
}

function receiptFileName(packName, target) {
  // Validate packName and target against Windows-specific path hazards
  if (containsAdsColon(packName) || containsAdsColon(target)) {
    throw new Error("receipt file name must not contain NTFS alternate data stream separators (:).");
  }

  if (isWindowsReservedDeviceName(packName) || isWindowsReservedDeviceName(target)) {
    throw new Error(`receipt file name must not use Windows reserved device names (${Array.from(WINDOWS_RESERVED_NAMES).join(", ")}) or variant.`);
  }

  if (hasTrailingDotOrSpace(packName) || hasTrailingDotOrSpace(target)) {
    throw new Error("receipt file name must not have trailing dots or spaces.");
  }

  return `${packName}.${target}.json`;
}

async function writeInstallReceipt(stateDir, receipt) {
  await writeJson(path.join(stateDir, "receipts", receiptFileName(receipt.pack, receipt.target)), receipt);
}

async function removeInstallReceipt(stateDir, packName, target) {
  await removePath(path.join(stateDir, "receipts", receiptFileName(packName, target)));
}

async function readReceipts(stateDir) {
  const receiptsDir = path.join(stateDir, "receipts");

  if (!(await pathExists(receiptsDir))) {
    return [];
  }

  const files = await listDirectoryFiles(receiptsDir);
  const receipts = [];

  for (const file of files.filter((entry) => entry.endsWith(".json"))) {
    receipts.push(await readJson(path.join(receiptsDir, file)));
  }

  return receipts.sort((left, right) => `${left.pack}:${left.target}`.localeCompare(`${right.pack}:${right.target}`));
}

function updateLockEntry(lockfile, entry) {
  const normalizedEntry = { ...entry, pack: normalizePackName(entry.pack) };
  lockfile.installed = lockfile.installed.filter(
    (installed) => installed.pack !== normalizedEntry.pack || installed.target !== normalizedEntry.target
  );
  lockfile.installed.push(normalizedEntry);
  lockfile.installed.sort((left, right) => `${left.pack}:${left.target}`.localeCompare(`${right.pack}:${right.target}`));
}

function removeLockEntries(lockfile, packName) {
  const normalizedPackName = normalizePackName(packName);
  lockfile.installed = lockfile.installed.filter((entry) => entry.pack !== normalizedPackName);
}

function compareVersion(left, right) {
  // Build metadata (+build.1) is stripped first: semver precedence ignores it,
  // so 1.0.0-alpha+build.1 == 1.0.0-alpha and 1.0.0+b1 == 1.0.0+b2.
  const leftNorm = String(left).trim().split("+")[0];
  const rightNorm = String(right).trim().split("+")[0];

  // Split into version core and prerelease at the first '-'
  const leftDash = leftNorm.indexOf('-');
  const rightDash = rightNorm.indexOf('-');
  const leftCore = leftDash === -1 ? leftNorm : leftNorm.slice(0, leftDash);
  const rightCore = rightDash === -1 ? rightNorm : rightNorm.slice(0, rightDash);
  const leftPre = leftDash === -1 ? [] : leftNorm.slice(leftDash + 1).split(/[.\-]/).filter(Boolean);
  const rightPre = rightDash === -1 ? [] : rightNorm.slice(rightDash + 1).split(/[.\-]/).filter(Boolean);

  // Parse version core parts (major.minor.patch), default missing parts to 0
  const leftParts = leftCore.split('.').map((p) => { const n = Number.parseInt(p, 10); return Number.isFinite(n) ? n : 0; });
  const rightParts = rightCore.split('.').map((p) => { const n = Number.parseInt(p, 10); return Number.isFinite(n) ? n : 0; });
  while (leftParts.length < 3) leftParts.push(0);
  while (rightParts.length < 3) rightParts.push(0);

  for (let i = 0; i < 3; i++) {
    if (leftParts[i] > rightParts[i]) return 1;
    if (leftParts[i] < rightParts[i]) return -1;
  }

  // Prerelease logic: no prerelease > has prerelease (release > prerelease)
  if (leftPre.length === 0 && rightPre.length > 0) return 1;
  if (leftPre.length > 0 && rightPre.length === 0) return -1;
  if (leftPre.length === 0 && rightPre.length === 0) return 0;

  // Both have prerelease: compare segment by segment
  const len = Math.max(leftPre.length, rightPre.length);
  for (let i = 0; i < len; i++) {
    const l = leftPre[i];
    const r = rightPre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;

    const lNum = /^\d+$/.test(l) ? Number.parseInt(l, 10) : null;
    const rNum = /^\d+$/.test(r) ? Number.parseInt(r, 10) : null;

    if (lNum !== null && rNum !== null) {
      if (lNum !== rNum) return lNum < rNum ? -1 : 1;
    } else if (lNum !== null) {
      return -1;
    } else if (rNum !== null) {
      return 1;
    } else {
      if (l < r) return -1;
      if (l > r) return 1;
    }
  }

  return 0;
}

function registryPublisher(registryEntry) {
  return registryEntry?.publisher?.id ?? registryEntry?.author;
}

/**
 * Reads the `verified` flag from a registry entry.
 *
 * IMPORTANT: `verified` is a catalog-author declaration, NOT a cryptographic
 * guarantee. Because it lives alongside `riskLevel` and `checksum` in the same
 * untrusted catalog file, a malicious or MITM'd catalog can forge all three
 * simultaneously. Consumers should treat `verified:true` as "the catalog
 * author claims this pack is verified" — not as independent proof of integrity.
 * Real integrity assurance comes from checksum validation against an externally
 * sourced (or signed) catalog.
 */
function registryVerified(registryEntry) {
  return Boolean(registryEntry?.publisher?.verified ?? registryEntry?.verified);
}

function registryChecksum(registryEntry) {
  if (typeof registryEntry?.checksum === "string") {
    return registryEntry.checksum;
  }

  return null;
}

async function checkUpdateAvailability(receipt) {
  if (!receipt.registry || /^https?:\/\//i.test(receipt.registry) || !(await pathExists(receipt.registry))) {
    return {
      status: receipt.registry ? "unavailable" : "not checked"
    };
  }

  try {
    const catalog = await readJson(receipt.registry);
    const entry = Array.isArray(catalog.packs)
      ? catalog.packs.find((pack) => pack.id === receipt.pack || pack.name === receipt.pack)
      : null;

    if (!entry?.version) {
      return {
        status: "not found"
      };
    }

    if (compareVersion(entry.version, receipt.version) > 0) {
      return {
        status: "available",
        version: entry.version
      };
    }

    return {
      status: "current",
      version: entry.version
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error.message
    };
  }
}

function resolveStoredSourcePath(entry) {
  if (entry.sourceCachePath && !/^https?:\/\//i.test(entry.sourceCachePath)) {
    return path.resolve(entry.sourceCachePath);
  }

  if (!entry.source || /^https?:\/\//i.test(entry.source)) {
    return null;
  }

  if (path.isAbsolute(entry.source)) {
    return path.resolve(entry.source);
  }

  if (entry.registry) {
    return path.resolve(path.dirname(entry.registry), entry.source);
  }

  return path.resolve(entry.source);
}

function sourceRef(source) {
  return source.ref ?? source.tag ?? source.commit ?? "main";
}

function sourceDisplayName(source) {
  if (typeof source === "string") {
    return source;
  }

  if (!source || typeof source !== "object") {
    return "(unknown)";
  }

  if (source.type === "github-archive") {
    return `github:${source.repo}/${source.path ?? ""}@${sourceRef(source)}`;
  }

  return `${source.type ?? "remote"}:${source.repo ?? source.url ?? "(unknown)"}`;
}

function safeCacheSegment(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "source";
}

function encodePathForUrl(value) {
  return String(value)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchJson(url, options = {}) {
  return fetchJsonWithTimeout(url, {
    headers: {
      accept: "application/vnd.github+json, application/json"
    },
    ...options
  });
}

async function fetchBytes(url, options = {}) {
  // fetchBytesWithTimeout resolves to the body bytes (it throws on non-2xx
  // responses internally), so no separate ok/status check is needed here.
  return fetchBytesWithTimeout(url, options);
}

function relativeGitHubContentPath(entryPath, sourcePath) {
  const normalizedEntry = String(entryPath).replace(/\\/g, "/");
  const normalizedSource = String(sourcePath ?? "").replace(/\\/g, "/").replace(/\/+$/g, "");

  if (normalizedSource && normalizedEntry.startsWith(`${normalizedSource}/`)) {
    return normalizedEntry.slice(normalizedSource.length + 1);
  }

  return normalizedEntry;
}

function resolveUnpackedLimits(options = {}) {
  return {
    maxTotalBytes: options.maxUnpackedBytes ?? DEFAULT_MAX_UNPACKED_TOTAL_BYTES,
    maxFileCount: options.maxUnpackedFiles ?? DEFAULT_MAX_UNPACKED_FILE_COUNT
  };
}

function assertUnpackedWithinLimits(sourceLabel, state, extraBytes = 0, extraFiles = 0) {
  const { maxTotalBytes, maxFileCount } = state.limits;
  const totalBytes = (state.totalBytes ?? 0) + extraBytes;
  const fileCount = (state.writtenFiles ?? 0) + extraFiles;

  if (totalBytes > maxTotalBytes) {
    throw new Error(
      `Unpacked GitHub source ${sourceLabel} exceeds the maximum total unpacked size: ` +
        `${totalBytes} bytes > ${maxTotalBytes} bytes. Install refused. ` +
        "Adjust with the maxUnpackedBytes install option if this source is trusted."
    );
  }

  if (fileCount > maxFileCount) {
    throw new Error(
      `Unpacked GitHub source ${sourceLabel} exceeds the maximum file count: ` +
        `${fileCount} files > ${maxFileCount}. Install refused. ` +
        "Adjust with the maxUnpackedFiles install option if this source is trusted."
    );
  }
}

async function downloadGitHubContents(source, destinationDir, currentPath = source.path, state = {}) {
  const log = getLogger();
  const apiBaseUrl = (source.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/g, "");
  state.limits ??= resolveUnpackedLimits();

  // #1: the catalog fully controls apiBaseUrl, so it is checked against the
  // GitHub host allowlist (operator-extendable via PACKSMITH_ALLOWED_FETCH_HOSTS)
  // before any request is made.
  validateGitHubFetchUrl(apiBaseUrl);

  const encodedPath = encodePathForUrl(currentPath ?? "");
  const url = `${apiBaseUrl}/repos/${source.repo}/contents/${encodedPath}?ref=${encodeURIComponent(sourceRef(source))}`;
  const entries = await fetchJson(url);
  const list = Array.isArray(entries) ? entries : [entries];

  // Count total files in this directory for progress tracking
  const filesInDir = list.filter((e) => e.type === "file").length;
  if (filesInDir > 0 && log) {
    state.fileCount = (state.fileCount ?? 0) + filesInDir;
  }

  let downloaded = 0;

  for (const entry of list) {
    if (entry.type === "dir") {
      await downloadGitHubContents(source, destinationDir, entry.path, state);
      continue;
    }

    if (entry.type !== "file") {
      continue;
    }

    if (!entry.download_url) {
      throw new Error(`GitHub content file is missing download_url: ${entry.path}`);
    }

    const relativePath = relativeGitHubContentPath(entry.path, source.path);
    const resolvedRoot = path.resolve(destinationDir);
    const resolvedPath = path.resolve(resolvedRoot, relativePath);
    const relativeToRoot = path.relative(resolvedRoot, resolvedPath);

    // Path containment is checked before any host validation or fetch so a
    // malicious entry can never smuggle an out-of-tree write past the checks
    // that matter most.
    if (!relativeToRoot || relativeToRoot === ".." || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
      throw new Error(`GitHub content path escapes the download directory: ${entry.path}`);
    }

    // #1: download_url hosts are allowlisted exactly like apiBaseUrl.
    validateGitHubFetchUrl(entry.download_url);

    // Unpacked-size caps (security-input.md §1 DoS): a server may declare a
    // small `size`, so the declared size is only a cheap pre-check — the
    // authoritative enforcement happens on the bytes actually downloaded.
    const declaredSize = typeof entry.size === "number" && Number.isFinite(entry.size) ? entry.size : null;

    if (declaredSize !== null) {
      assertUnpackedWithinLimits(sourceDisplayName(source), state, declaredSize, 1);
    } else {
      assertUnpackedWithinLimits(sourceDisplayName(source), state, 0, 1);
    }

    if (log) {
      downloaded += 1;
      log.info(`Downloading ${downloaded}/${state.fileCount}: ${entry.path}`);
    }

    const bytes = await fetchBytes(entry.download_url);
    state.totalBytes = (state.totalBytes ?? 0) + bytes.length;
    state.writtenFiles = (state.writtenFiles ?? 0) + 1;
    assertUnpackedWithinLimits(sourceDisplayName(source), state);

    await writeText(resolvedPath, bytes);
  }
}

async function resolveGitHubArchiveSource(packId, source, options = {}) {
  if (typeof source.repo !== "string" || source.repo.trim().length === 0) {
    throw new Error(`GitHub source for "${packId}" must include repo.`);
  }

  if (typeof source.path !== "string" || source.path.trim().length === 0) {
    throw new Error(`GitHub source for "${packId}" must include path.`);
  }

  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  const cacheRoot = path.join(
    stateDir,
    "source-cache",
    safeCacheSegment(`${source.repo}-${source.path}-${sourceRef(source)}-${source.checksum ?? source.commit ?? ""}`)
  );
  const cacheMarkerPath = path.join(cacheRoot, ".packsmith-cache-ok.json");
  const state = { limits: resolveUnpackedLimits(options) };

  // #14: a completed, checksum-verified download is reused until the catalog
  // declares a different checksum, instead of re-fetching the whole tree on
  // every preview/install/refresh.
  if (await pathExists(cacheMarkerPath)) {
    const marker = await readJson(cacheMarkerPath).catch(() => null);

    if (marker?.checksum && (!source.checksum || marker.checksum === source.checksum)) {
      // Re-check cached totals against the *current* limits: a source cached
      // under older (larger) caps must not bypass a lowered policy. Markers
      // written before the caps existed carry no totals and stay reusable.
      if (typeof marker.totalBytes === "number" || typeof marker.fileCount === "number") {
        assertUnpackedWithinLimits(sourceDisplayName(source), { limits: state.limits, totalBytes: marker.totalBytes ?? 0, writtenFiles: marker.fileCount ?? 0 });
      }

      return {
        cacheRoot,
        label: sourceDisplayName(source),
        cached: true
      };
    }
  }

  await removePath(cacheRoot);
  await ensureDir(cacheRoot);
  await downloadGitHubContents(source, cacheRoot, source.path, state);

  const calculatedChecksum = await hashDirectory(cacheRoot);

  if (source.checksum) {
    if (calculatedChecksum !== source.checksum) {
      await removePath(cacheRoot);
      throw new Error(
        `Checksum mismatch for GitHub source "${sourceDisplayName(source)}". Registry expected ${source.checksum}, but Packsmith calculated ${calculatedChecksum}.`
      );
    }
  }

  // Completion marker: presence plus matching checksum enables reuse above.
  await writeJsonAtomic(cacheMarkerPath, {
    checksum: calculatedChecksum,
    downloadedAt: new Date().toISOString(),
    totalBytes: state.totalBytes ?? 0,
    fileCount: state.writtenFiles ?? 0
  });

  return {
    cacheRoot,
    label: sourceDisplayName(source)
  };
}

async function resolveInstallSource(input, options = {}) {
  const absoluteInput = path.resolve(input);

  if (await isBuiltBundleDir(absoluteInput)) {
    return {
      type: "built",
      bundleDir: absoluteInput,
      source: options.source ?? absoluteInput,
      sourceDir: absoluteInput,
      registryEntry: options.registryEntry,
      cleanup: async () => {}
    };
  }

  if (await isSourcePackDir(absoluteInput)) {
    const buildRoot =
      options.outDir ??
      path.join(options.stateDir ?? defaultStateDir(), "build-cache", `${path.basename(absoluteInput)}-${process.pid}-${randomUUID()}`);
    const built = await buildPack(absoluteInput, buildRoot);
    return {
      type: "source",
      bundleDir: built.outputRoot,
      source: options.source ?? absoluteInput,
      sourceDir: absoluteInput,
      registryEntry: options.registryEntry,
      cleanup: options.outDir ? async () => {} : async () => removePath(buildRoot)
    };
  }

  const { findRegistryPack } = await import("./registry.mjs");
  const registryResult = await findRegistryPack(input, { registry: options.registry });
  const source = registryResult.entry.source;

  if (!source) {
    throw new Error(`Registry pack "${input}" does not include a source path or URL.`);
  }

  if (source && typeof source === "object" && !Array.isArray(source)) {
    if (source.type !== "github-archive") {
      throw new Error(
        `Remote source type "${source.type ?? "unknown"}" is not installable yet for "${input}". Use github-archive metadata with checksum or a local source path.`
      );
    }

    const fetched = await resolveGitHubArchiveSource(input, source, options);
    const resolved = await resolveInstallSource(fetched.cacheRoot, {
      ...options,
      source: fetched.label,
      registryEntry: registryResult.entry
    });

    return {
      ...resolved,
      registryEntry: registryResult.entry,
      registryPath: registryResult.catalog.path,
      catalog: registryResult.catalog,
      remoteRegistry: registryResult.catalog.registry?.type === "remote" ? registryResult.catalog.registry : null,
      sourceCachePath: fetched.cacheRoot
    };
  }

  if (/^https?:\/\//i.test(source)) {
    throw new Error(
      `HTTP archive source for "${input}" is not installable yet. Use source.type "github-archive" with checksum metadata or a local source path.`
    );
  }

  const sourcePath = path.isAbsolute(source) ? source : path.resolve(path.dirname(registryResult.catalog.path), source);
  const resolved = await resolveInstallSource(sourcePath, {
    ...options,
    source,
    registryEntry: registryResult.entry
  });

  return {
    ...resolved,
    registryEntry: registryResult.entry,
    registryPath: registryResult.catalog.path,
    catalog: registryResult.catalog,
    remoteRegistry: registryResult.catalog.registry?.type === "remote" ? registryResult.catalog.registry : null
  };
}

async function detectTargets(manifest, options = {}) {
  if (options.target) {
    return [options.target];
  }

  const homeDir = options.homeDir ?? userHomeDir();
  const supportedManifestTargets = manifest.targets.filter((target) => SUPPORTED_TARGET_IDS.has(target));
  const detected = [];

  for (const adapter of getSupportedTargetAdapters()) {
    if (!supportedManifestTargets.includes(adapter.id)) {
      continue;
    }

    const installRoot = defaultInstallRoot(adapter.id, { homeDir, cwd: options.cwd, scope: options.scope });

    if (await pathExists(installRoot)) {
      detected.push({ adapter, installRoot });
    }
  }

  if (detected.length > 0) {
    return detected.map((target) => target.adapter.id);
  }

  // No agent runtime detected and no --target given: fall back only to an
  // adapter whose install layout is actually confirmed. Falling back to a
  // "planned" adapter would write into a directory convention Packsmith has
  // not verified, which a trust-first installer must not do silently.
  const confirmedFallback = manifest.targets.filter((target) => getTargetAdapter(target)?.status === "supported");

  if (confirmedFallback.length > 0) {
    return confirmedFallback.slice(0, 1);
  }

  // Nothing installable: let installPack raise the §4 "no installable target"
  // template instead of guessing a destination.
  return [];
}

async function plannedWrites(targetSourceDir, installDir) {
  const files = await listDirectoryFiles(targetSourceDir);
  return [
    ...files.map((filePath) => path.join(installDir, filePath)),
    path.join(installDir, "manifest.json"),
    path.join(installDir, "catalog.json")
  ].sort();
}

async function createInstallPlan(source, targetIds, options = {}) {
  const manifest = await readJson(path.join(source.bundleDir, "manifest.json"));
  assertSafeManifestName(manifest.name);
  const targetPlans = [];
  const skipped = [];
  const assets = await scanDirectoryAssets(source.bundleDir);
  const targetChecksums = [];

  for (const target of manifest.targets) {
    if (!SUPPORTED_TARGET_IDS.has(target)) {
      skipped.push(createSkippedTarget(target, "adapter planned"));
    }
  }

  for (const target of targetIds) {
    validateInstallTarget(target);

    const adapter = getTargetAdapter(target);
    const targetSourceDir = path.join(source.bundleDir, target);

    if (!(await pathExists(targetSourceDir))) {
      throw new Error(`Missing built target directory: ${targetSourceDir}`);
    }

    const destinationRoot = path.resolve(
      options.dest ?? defaultInstallRoot(target, { homeDir: options.homeDir, cwd: options.cwd, scope: options.scope })
    );
    const installDir = resolveManifestNamedDirectory(destinationRoot, manifest.name);
    const checksum = await hashDirectory(targetSourceDir);
    targetChecksums.push(checksum);
    targetPlans.push({
      target,
      name: adapter?.name ?? target,
      status: adapter?.status ?? "unknown",
      scope: options.scope ?? adapter?.defaultScope ?? adapter?.scopes?.[0] ?? "personal",
      installDir,
      bridgeFiles: adapter?.bridgeFiles ?? [],
      warnings: adapter?.compatibilityWarnings ?? [],
      checksum,
      writes: await plannedWrites(targetSourceDir, installDir)
    });
  }

  const riskLevel = inferRiskLevel(manifest, source.registryEntry, assets);
  const provenanceChecksum = targetChecksums.length === 1 ? targetChecksums[0] : await hashDirectory(source.bundleDir);
  const declaredChecksum = registryChecksum(source.registryEntry);

  return {
    pack: {
      id: manifest.name,
      name: source.registryEntry?.name ?? manifest.name,
      version: manifest.version,
      description: manifest.description,
      category: source.registryEntry?.category ?? manifest.category ?? "uncategorized",
      tags: source.registryEntry?.tags ?? manifest.tags ?? []
    },
    runtime: targetPlans.map((target) => target.target),
    targets: targetPlans,
    skipped,
    permissions: manifest.permissions ?? {},
    risk: {
      level: riskLevel,
      reasons: [
        ...(source.registryEntry?.riskLevel ? [`registry declares ${source.registryEntry.riskLevel} risk`] : []),
        ...(assets.hasScripts ? ["pack contains script-like files"] : []),
        ...(assets.hasBinaries ? ["pack contains binary files"] : []),
        ...(assets.hasExecutables ? ["pack contains executable files"] : []),
        ...permissionWarnings(manifest.permissions)
      ]
    },
    context: {
      estimatedChars: source.registryEntry?.estimatedContextSize ?? manifest.context?.estimatedChars ?? 0,
      tokenPressure: estimateTokenPressure(source.registryEntry?.estimatedContextSize ?? manifest.context?.estimatedChars ?? 0)
    },
    provenance: {
      source: source.registryEntry?.source ?? source.source ?? source.bundleDir,
      registry: source.registryPath,
      registryUrl: source.remoteRegistry?.url,
      checksum: declaredChecksum ?? provenanceChecksum,
      sourceChecksum: source.registryEntry?.source?.checksum,
      calculatedChecksum: provenanceChecksum,
      checksumStatus: declaredChecksum ? (declaredChecksum === provenanceChecksum ? "matched" : "mismatch") : "calculated",
      publisher: registryPublisher(source.registryEntry) ?? "(local)",
      verified: registryVerified(source.registryEntry),
      ref: source.registryEntry?.ref ?? source.registryEntry?.source?.ref,
      tag: source.registryEntry?.tag ?? source.registryEntry?.source?.tag,
      commit: source.registryEntry?.commit ?? source.registryEntry?.source?.commit,
      schemaVersion: source.catalog?.schemaVersion ?? source.registryEntry?.schemaVersion
    },
    source: source.registryEntry?.source ?? source.source ?? source.bundleDir,
    assets,
    remoteRegistry: source.remoteRegistry
  };
}

function createSkippedTarget(target, reason) {
  const adapter = getTargetAdapter(target);

  return {
    target,
    name: adapter?.name ?? target,
    status: "skipped",
    reason
  };
}

async function installOneTarget(source, target, options = {}) {
  validateInstallTarget(target);

  const manifestPath = path.join(source.bundleDir, "manifest.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`Missing built manifest: ${manifestPath}`);
  }

  const manifest = await readJson(manifestPath);
  assertSafeManifestName(manifest.name);
  const targetSourceDir = path.join(source.bundleDir, target);

  if (!(await pathExists(targetSourceDir))) {
    throw new Error(`Missing built target directory: ${targetSourceDir}`);
  }

  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  const destinationRoot = path.resolve(
    options.dest ?? defaultInstallRoot(target, { homeDir: options.homeDir, cwd: options.cwd, scope: options.scope })
  );
  const installDir = resolveManifestNamedDirectory(destinationRoot, manifest.name);
  const sourceChecksum = await hashDirectory(targetSourceDir);
  const expectedChecksum = options.expectedChecksum;

  // Fix #12 (TOCTOU): verify the source checksum hasn't changed between plan and install phases.
  // If the source was mutated after planning, reject the install to prevent a trust boundary bypass.
  // See code-review-packsmith-2026-09-25.md #12.
  if (expectedChecksum && sourceChecksum !== expectedChecksum) {
    throw new Error(
      `Checksum changed between planning and installing pack "${manifest.name}" for target "${target}": planned ${expectedChecksum}, actual ${sourceChecksum}.`
    );
  }

  const installedAt = new Date().toISOString();
  const sourceLabel = source.registryEntry?.source ?? source.source ?? source.bundleDir;

  if (options.dryRun) {
    return {
      manifest,
      target,
      installDir,
      checksum: sourceChecksum,
      sourceChecksum,
      dryRun: true
    };
  }

  if (source.sourceDir) {
    assertInstallDestinationDoesNotOverlapSource(installDir, source.sourceDir);
  }

  const stagingDir = path.join(destinationRoot, `.staging-${randomUUID()}`);
  let backupDir = null;
  let receiptWritten = false;
  let installCommitted = false;

  try {
    await copyDirectory(targetSourceDir, stagingDir);
    await copyFileOrDirectory(path.join(source.bundleDir, "manifest.json"), path.join(stagingDir, "manifest.json"));
    await copyFileOrDirectory(path.join(source.bundleDir, "catalog.json"), path.join(stagingDir, "catalog.json"));

    // Recorded checksum covers the installed tree (source target dir plus
    // manifest.json/catalog.json), matching what audit recomputes later.
    // Note it intentionally differs from sourceChecksum, which covers the
    // target source dir alone and is verified against the plan above (#12).
    const checksum = await hashDirectory(stagingDir);

    if (await pathExists(installDir)) {
      backupDir = path.join(destinationRoot, `.bak-${manifest.name}-${randomUUID()}`);
      await fs.rename(installDir, backupDir);
    }

    await fs.rename(stagingDir, installDir);
    installCommitted = true;

    const receipt = {
      pack: manifest.name,
      version: manifest.version,
      target,
      installedAt,
      installDir,
      source: sourceLabel,
      sourceCachePath: source.sourceCachePath,
      registry: source.registryPath,
      registryUrl: source.remoteRegistry?.url,
      publisher: registryPublisher(source.registryEntry),
      verified: registryVerified(source.registryEntry),
      riskLevel: inferRiskLevel(manifest, source.registryEntry, await scanDirectoryAssets(source.bundleDir)),
      checksum,
      sourceChecksum,
      targetChecksum: sourceChecksum,
      permissions: manifest.permissions ?? {},
      files: await listDirectoryFiles(installDir)
    };
    const lockEntry = {
      pack: manifest.name,
      version: manifest.version,
      target,
      installDir,
      source: sourceLabel,
      sourceCachePath: source.sourceCachePath,
      registry: source.registryPath,
      registryUrl: source.remoteRegistry?.url,
      publisher: registryPublisher(source.registryEntry),
      verified: receipt.verified,
      riskLevel: receipt.riskLevel,
      checksum,
      sourceChecksum,
      targetChecksum: sourceChecksum,
      resolved: source.registryEntry?.commit ?? source.registryEntry?.source?.commit ?? source.registryEntry?.source?.resolved,
      ref: source.registryEntry?.ref ?? source.registryEntry?.source?.ref,
      pinned: Boolean(options.pin),
      installedAt
    };

    // Wrap lockfile read-modify-write with state lock for atomicity
    await withStateLock(stateDir, async () => {
      const lockfile = await loadLockfile(stateDir);
      updateLockEntry(lockfile, lockEntry);
      await writeInstallReceipt(stateDir, receipt);
      receiptWritten = true;
      await saveLockfile(stateDir, lockfile);
    });

    return {
      manifest,
      target,
      installDir,
      checksum,
      receipt
    };
  } catch (error) {
    if (installCommitted) {
      try {
        await removePath(installDir);
      } catch (cleanupError) {
        // Preserve the original failure; a cleanup failure is already non-fatal.
        console.error(`Warning: failed to remove incomplete install "${installDir}": ${cleanupError.message}`);
      }

      if (backupDir) {
        try {
          await fs.rename(backupDir, installDir);
        } catch (restoreError) {
          throw new Error(
            `${error.message} Failed to restore the previous install "${installDir}": ${restoreError.message}`
          );
        }
      }
    } else if (stagingDir) {
      try {
        await removePath(stagingDir);
      } catch (cleanupError) {
        console.error(`Warning: failed to remove staging directory "${stagingDir}": ${cleanupError.message}`);
      }
    }

    if (receiptWritten) {
      try {
        await removeInstallReceipt(stateDir, manifest.name, target);
      } catch (cleanupError) {
        console.error(`Warning: failed to remove receipt for incomplete install "${manifest.name}": ${cleanupError.message}`);
      }
    }

    throw error;
  }
}

export async function installBundle(bundleDir, options = {}) {
  const absoluteBundleDir = path.resolve(bundleDir);
  const manifestPath = path.join(absoluteBundleDir, "manifest.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`Missing built manifest: ${manifestPath}`);
  }

  const manifest = await readJson(manifestPath);
  assertSafeManifestName(manifest.name);
  const target = options.target ?? manifest.targets?.[0];

  validateInstallTarget(target);

  const targetSourceDir = path.join(absoluteBundleDir, target);

  if (!(await pathExists(targetSourceDir))) {
    throw new Error(`Missing built target directory: ${targetSourceDir}`);
  }

  const destinationRoot = path.resolve(options.dest ?? path.join(absoluteBundleDir, "installed"));
  const installDir = resolveManifestNamedDirectory(destinationRoot, manifest.name);

  assertInstallDestinationDoesNotOverlapSource(installDir, absoluteBundleDir);
  await removePath(installDir);
  await copyDirectory(targetSourceDir, installDir);
  await copyFileOrDirectory(path.join(absoluteBundleDir, "manifest.json"), path.join(installDir, "manifest.json"));
  await copyFileOrDirectory(path.join(absoluteBundleDir, "catalog.json"), path.join(installDir, "catalog.json"));

  return {
    manifest,
    target,
    installDir
  };
}

// ---------------------------------------------------------------------------
// State cache hygiene (#14): build-cache and source-cache used to grow without
// bound (144 orphan directories were measured in ~/.packsmith/build-cache).
// Entries now age out via TTL and a per-directory cap, swept best-effort at
// install time, so a crashed install leaves an orphan that expires instead of
// living forever.
// ---------------------------------------------------------------------------
const BUILD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BUILD_CACHE_MAX_ENTRIES = 64;
const SOURCE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_CACHE_MAX_ENTRIES = 16;

async function sweepCacheDir(dirPath, { ttlMs, maxEntries }) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // A missing cache directory is the common, healthy case.
  }

  const survivors = [];
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    try {
      const { mtimeMs } = await fs.stat(fullPath);

      if (now - mtimeMs > ttlMs) {
        await removePath(fullPath).catch((error) => {
          console.error(`Warning: failed to remove expired cache entry "${fullPath}": ${error.message}`);
        });
      } else {
        survivors.push({ fullPath, mtimeMs });
      }
    } catch {
      // Unreadable entry: leave it for the next sweep.
    }
  }

  if (survivors.length > maxEntries) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const stale of survivors.slice(0, survivors.length - maxEntries)) {
      await removePath(stale.fullPath).catch((error) => {
        console.error(`Warning: failed to remove excess cache entry "${stale.fullPath}": ${error.message}`);
      });
    }
  }
}

/**
 * Best-effort sweep of the build-cache and source-cache directories (#14).
 * Never throws: a failed sweep must not fail the install that triggered it.
 */
export async function gcStateCaches(stateDir) {
  const root = path.resolve(stateDir ?? defaultStateDir());
  await sweepCacheDir(path.join(root, "build-cache"), {
    ttlMs: BUILD_CACHE_TTL_MS,
    maxEntries: BUILD_CACHE_MAX_ENTRIES
  });
  await sweepCacheDir(path.join(root, "source-cache"), {
    ttlMs: SOURCE_CACHE_TTL_MS,
    maxEntries: SOURCE_CACHE_MAX_ENTRIES
  });
}

// Known pack names for the typosquatting advisory: every pack id in the active
// catalog (options.registry or the bundled official catalog) plus every pack
// recorded in the lockfile. Both sources are best-effort — a missing catalog or
// lockfile must never block an install, so failures degrade to a smaller list.
async function collectKnownPackNames(options = {}) {
  const knownNames = new Set();

  try {
    const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
    const lockfile = await loadLockfile(stateDir);

    for (const entry of lockfile.installed ?? []) {
      if (typeof entry?.pack === "string" && entry.pack.length > 0) {
        knownNames.add(entry.pack);
      }
    }
  } catch (error) {
    getLogger()?.info?.(`Typosquatting check: installed pack list unavailable (${error.message}).`);
  }

  try {
    const { loadRegistry, DEFAULT_REGISTRY_PATH } = await import("./registry.mjs");
    const catalog = await loadRegistry(options.registry ?? DEFAULT_REGISTRY_PATH);

    for (const pack of catalog.packs ?? []) {
      if (typeof pack?.id === "string" && pack.id.length > 0) {
        knownNames.add(pack.id);
      }
    }
  } catch (error) {
    getLogger()?.info?.(`Typosquatting check: catalog unavailable (${error.message}).`);
  }

  return knownNames;
}

async function detectTyposquattingWarnings(packName, options = {}) {
  try {
    return findTyposquattingMatches(packName, await collectKnownPackNames(options));
  } catch (error) {
    getLogger()?.info?.(`Typosquatting check skipped (${error.message}).`);
    return [];
  }
}

export async function installPack(input, options = {}) {
  const source = await resolveInstallSource(input, options);

  // Policy loading uses the module-level loadPolicy(), which validates and
  // normalizes (defaults allowedRequiredPermissions to ["filesystem"]). The
  // previous local copy returned raw JSON, so a minimal policy like
  // {"maxRisk":"high"} crashed install with "cannot read properties of
  // undefined (reading 'includes')" during policy evaluation.

  const evaluateInstallPolicy = (plan, policy) => {
    if (!policy) return [];
    const issues = [];

    // Check allowedPacks
    if (policy.allowedPacks && !policy.allowedPacks.includes(plan.pack.id)) {
      issues.push(`Pack "${plan.pack.id}" is not in allowedPacks.`);
    }

    // Check blockedPacks
    const blockedPacks = policy.blockedPacks ?? [];
    if (blockedPacks.includes(plan.pack.id)) {
      issues.push(`Pack "${plan.pack.id}" is blocked by policy.`);
    }

    // Check requireVerified
    if (policy.requireVerified && !plan.provenance.verified) {
      issues.push(`Policy requires unverified pack "${plan.pack.id}" to come from a verified registry entry.`);
    }

    // Check allowedRegistries
    if (policy.allowedRegistries) {
      const registryPath = plan.provenance.registry ? path.resolve(plan.provenance.registry) : null;
      const registryUrl = plan.provenance.registryUrl ?? null;
      const registryAllowed =
        (registryPath && policy.allowedRegistries.includes(registryPath)) ||
        (registryUrl && policy.allowedRegistries.includes(registryUrl));

      if (!registryAllowed) {
        issues.push(`Pack "${plan.pack.id}" registry is not allowed: ${registryUrl ?? registryPath ?? "(none)"}.`);
      }
    }

    // Check allowedPublishers
    if (policy.allowedPublishers) {
      const publisher = plan.provenance.publisher ?? "(unknown)";
      if (!policy.allowedPublishers.includes(publisher)) {
        issues.push(`Pack "${plan.pack.id}" publisher "${publisher}" is not allowed.`);
      }
    }

    // Check allowedTargets for each target in the plan
    if (policy.allowedTargets) {
      for (const target of plan.targets) {
        if (!policy.allowedTargets.includes(target.target)) {
          issues.push(`Pack "${plan.pack.id}" target "${target.target}" is not allowed.`);
        }
      }
    }

    // Check maxRisk
    if (plan.risk.level && policy.maxRisk && !allowsRisk(plan.risk.level, policy.maxRisk)) {
      issues.push(`Pack "${plan.pack.id}" risk ${plan.risk.level} exceeds policy maxRisk ${policy.maxRisk}.`);
    }

    // Check maxContextSize (security-input.md §3 item 2, context poisoning):
    // plan.context.estimatedChars is the registry-declared or manifest-declared
    // estimate that preview shows; exceeding the policy ceiling blocks install.
    if (
      policy.maxContextSize !== null &&
      policy.maxContextSize !== undefined &&
      typeof plan.context?.estimatedChars === "number" &&
      plan.context.estimatedChars > policy.maxContextSize
    ) {
      issues.push(
        `Pack "${plan.pack.id}" context size ${plan.context.estimatedChars} chars exceeds policy maxContextSize ${policy.maxContextSize}.`
      );
    }

    // Check permissions
    for (const [permission, value] of Object.entries(plan.permissions ?? {})) {
      if (value === "required" && !policy.allowedRequiredPermissions.includes(permission)) {
        issues.push(
          `Pack "${plan.pack.id}" permission ${permission}: required is not allowed. Allowed required permissions: ${formatPolicyPermissionList(
            policy.allowedRequiredPermissions
          )}.`
        );
      }
    }

    return issues;
  };

  const log = getLogger();
  if (log) log.info(`Install starting: ${source.registryEntry?.name ?? input}@${source.registryEntry?.version ?? "unknown"} (${input})`);

  try {
    const manifest = await readJson(path.join(source.bundleDir, "manifest.json"));
    assertSafeManifestName(manifest.name);
    const detectedTargetIds = await detectTargets(manifest, options);
    const targetIds =
      detectedTargetIds.length > 1 && typeof options.selectTargets === "function"
        ? await options.selectTargets(detectedTargetIds, manifest)
        : detectedTargetIds;

    if (targetIds.length === 0) {
      // §4 "no installable target": name the runtimes that were checked and
      // came up empty, so the fix line's --target suggestion is actionable.
      const checkedNames = getSupportedTargetAdapters()
        .filter((adapter) => manifest.targets.includes(adapter.id))
        .map((adapter) => adapter.name);
      throw createPacksmithError("target_missing", {
        detected:
          options.target ?? (checkedNames.length > 0
            ? `none of ${checkedNames.join(", ")} directories exist`
            : "none of the supported agent directories exist")
      }, manifest.name);
    }

    const plan = await createInstallPlan(source, targetIds, options);

    // Typosquatting advisory (security-input.md §3 item 6): warn when the pack
    // name is within 2 edits of an installed pack or a catalog pack id. The
    // check is attached to the plan so preview, install plan, and --json output
    // all surface it; it never blocks by itself.
    plan.typosquatting = await detectTyposquattingWarnings(plan.pack.id, options);

    if (options.dryRun || options.planOnly) {
      return {
        manifest,
        dryRun: true,
        plan,
        installed: plan.targets.map((target) => ({
          manifest,
          target: target.target,
          installDir: target.installDir,
          checksum: target.checksum,
          sourceChecksum: target.checksum,
          dryRun: true
        })),
        skipped: plan.skipped,
        source: source.source,
        registryEntry: source.registryEntry
      };
    }

    if (plan.provenance.checksumStatus === "mismatch") {
      const expected = plan.provenance.checksum;
      const actual = plan.provenance.calculatedChecksum;
      throw createPacksmithError("checksum_drift", { pack: manifest.name, expected, actual }, manifest.name);
    }

    const policy = await loadPolicy(options.policy);
    const policyIssues = evaluateInstallPolicy(plan, policy);

    if (policyIssues.length > 0) {
      throw new Error(`Policy blocked install for "${manifest.name}": ${policyIssues.join(" ")}`);
    }

    if (plan.remoteRegistry && !options.yes && !policy) {
      if (typeof options.confirmInstall === "function") {
        const confirmed = await options.confirmInstall(plan);
        if (!confirmed) {
          throw new Error(`Install cancelled for "${manifest.name}". Re-run with --yes or pass --policy after reviewing the plan.`);
        }
      } else {
        throw new Error(`Remote registry install for "${manifest.name}" requires confirmation. Preview the plan, then re-run with --yes or pass --policy <file>.`);
      }
    }

    if (plan.risk.level === "blocked") {
      throw createPacksmithError("risk_denied", { pack: manifest.name, risk: plan.risk.level, reasons: plan.risk.reasons }, manifest.name);
    }

    if (!allowsRisk(plan.risk.level, options.allowRisk ?? "medium")) {
      throw createPacksmithError("risk_denied", {
        pack: manifest.name,
        risk: plan.risk.level,
        reasons: plan.risk.reasons
      }, manifest.name);
    }

    if (plan.assets.hasScripts && !options.allowScripts) {
      if (!allowsRisk("medium", options.allowRisk ?? "medium")) {
        throw createPacksmithError("risk_denied", {
          pack: manifest.name,
          risk: "medium",
          reasons: ["pack contains script-like files and requires at least --allow-risk medium to install"]
        }, manifest.name);
      }
    }

    // Full install
    const installed = [];
    const skipped = [];

    for (const target of manifest.targets) {
      if (!SUPPORTED_TARGET_IDS.has(target)) {
        skipped.push(createSkippedTarget(target, "adapter planned"));
      }
    }

    for (const target of targetIds) {
      const targetPlan = plan.targets.find((candidate) => candidate.target === target);
      installed.push(await installOneTarget(source, target, { ...options, expectedChecksum: targetPlan?.checksum }));
    }

    return {
      manifest,
      dryRun: Boolean(options.dryRun),
      plan,
      installed,
      skipped,
      source: source.source,
      registryEntry: source.registryEntry
    };

  } catch (error) {
    // PacksmithError: structured ERR-* error, let it propagate for cli.mjs main catch to render
    if (error instanceof PacksmithError) {
      throw error;
    }
    throw error;
  }
}

export async function previewInstallPlan(input, options = {}) {
  const result = await installPack(input, { ...options, dryRun: true, planOnly: true });
  return result.plan;
}

export async function listInstalledPacks(options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  const lockfile = await loadLockfile(stateDir);

  return {
    stateDir,
    installed: lockfile.installed
  };
}

export async function removeInstalledPack(packName, options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  
  return await withStateLock(stateDir, async () => {
    const lockfile = await loadLockfile(stateDir);
    const matches = lockfile.installed.filter((entry) => entry.pack === packName);
    
    if (matches.length === 0) {
      throw new Error(`Pack "${packName}" is not installed.`);
    }
    
    for (const entry of matches) {
      await removePath(entry.installDir);
      await removeInstallReceipt(stateDir, entry.pack, entry.target);
    }
    
    removeLockEntries(lockfile, packName);
    await saveLockfile(stateDir, lockfile);
    
    return {
      pack: packName,
      removed: matches
    };
  });
}

export async function pinInstalledPack(packName, options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  
  return await withStateLock(stateDir, async () => {
    const lockfile = await loadLockfile(stateDir);
    const matches = lockfile.installed.filter((entry) => entry.pack === packName);

    if (matches.length === 0) {
      throw new Error(`Pack "${packName}" is not installed.`);
    }

    for (const entry of lockfile.installed) {
      if (entry.pack === packName) {
        entry.pinned = true;
        entry.pinnedAt = new Date().toISOString();
      }
    }

    await saveLockfile(stateDir, lockfile);

    return {
      stateDir,
      pack: packName,
      pinned: matches
    };
  });
}

export async function updateInstalledPacks(packName, options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  
  return await withStateLock(stateDir, async () => {
    const lockfile = await loadLockfile(stateDir);
    const matches = lockfile.installed.filter((entry) => !packName || entry.pack === packName);
    const updated = [];

    if (matches.length === 0) {
      return { updated };
    }

    for (const entry of matches) {
      if (entry.pinned) {
        updated.push({
          pack: entry.pack,
          target: entry.target,
          status: "pinned, skipped"
        });
        continue;
      }

      const sourcePath = resolveStoredSourcePath(entry);

      if (sourcePath && (await pathExists(sourcePath))) {
        try {
          const result = await installPack(sourcePath, {
            ...options,
            target: entry.target,
            dest: path.dirname(entry.installDir),
            stateDir,
            allowRisk: highestRiskLevel(entry.riskLevel, options.allowRisk ?? "medium")
          });
          updated.push({
            pack: entry.pack,
            target: entry.target,
            status: result.installed[0]?.checksum === entry.checksum ? "already current" : "updated"
          });
        } catch (error) {
          updated.push({
            pack: entry.pack,
            target: entry.target,
            status: `error: ${error.message}`
          });
        }
      } else {
        updated.push({
          pack: entry.pack,
          target: entry.target,
          status: "source unavailable"
        });
      }
    }

    return { updated };
  });
}

export async function syncInstalledPacks(options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  
  return await withStateLock(stateDir, async () => {
    const lockfile = await loadLockfile(stateDir);
    const synced = [];

    for (const entry of lockfile.installed) {
      const target = entry.target;
      const destinationRoot = path.dirname(entry.installDir);

      const sourcePath = resolveStoredSourcePath(entry);

      if (!sourcePath) {
        synced.push({
          pack: entry.pack,
          target,
          status: "source unavailable"
        });
        continue;
      }

      if (!(await pathExists(sourcePath))) {
        synced.push({
          pack: entry.pack,
          target,
          status: "source unavailable"
        });
        continue;
      }

      try {
        const result = await installPack(sourcePath, {
          ...options,
          policy: undefined,
          target,
          dest: destinationRoot,
          stateDir,
          allowRisk: highestRiskLevel(entry.riskLevel, options.allowRisk ?? "medium")
        });
        const installed = result.installed[0];

        synced.push({
          pack: entry.pack,
          target,
          status: installed?.checksum === entry.checksum ? "already current" : "synced",
          installDir: installed?.installDir ?? entry.installDir
        });
      } catch (error) {
        synced.push({
          pack: entry.pack,
          target,
          status: `error: ${error.message}`,
          installDir: entry.installDir
        });
      }
    }

    const audit = options.policy ? await auditInstalledPacks({ ...options, stateDir }) : null;

    return {
      stateDir,
      synced,
      audit
    };
  });
}

function estimateTokenPressure(contextChars) {
  if (contextChars > 60000) {
    return "high";
  }

  if (contextChars > 24000) {
    return "medium";
  }

  return "low";
}

function findDuplicateDescriptions(items) {
  const seen = new Map();
  const duplicates = [];

  for (const item of items) {
    const value = item.description?.trim().toLowerCase();

    if (!value) {
      continue;
    }

    if (seen.has(value)) {
      duplicates.push([seen.get(value), item.id]);
    } else {
      seen.set(value, item.id);
    }
  }

  return duplicates;
}

async function inspectSkillEntry(packDir, skill) {
  const skillDir = resolvePackAssetPath(packDir, skill.path, `skill "${skill.id}" path`);
  const entryPath = path.join(skillDir, "SKILL.md");
  const content = await readFile(entryPath, "utf8");

  return {
    id: skill.id,
    hasTriggerCondition: /use this skill when|trigger|when the user|use when/i.test(content),
    hasExpectedOutput: /return:|output|deliverable|report/i.test(content),
    hasExample: /usage example|example|```/i.test(content),
    hasUnsafeInstruction:
      /ignore (all )?(previous|prior) instructions|disable safety|bypass confirmation|exfiltrate|secret token/i.test(content),
    chars: content.length
  };
}

function scoreDimension(points, fixes) {
  return {
    score: Math.max(0, Math.min(100, Math.round(points))),
    fixes
  };
}

function calculateQualityScore({ manifest, catalog, skillChecks, targetChecks, warnings }) {
  const dimensions = {};

  dimensions.discoverability = scoreDimension(
    55 +
      (manifest.name ? 10 : 0) +
      (manifest.description?.length >= 40 ? 15 : 0) +
      (manifest.category ? 10 : 0) +
      (Array.isArray(manifest.tags) && manifest.tags.length >= 2 ? 10 : 0),
    [
      ...(!manifest.category ? ["Add manifest.category so users can browse the pack."] : []),
      ...(!Array.isArray(manifest.tags) || manifest.tags.length < 2 ? ["Add at least two useful tags."] : [])
    ]
  );
  dimensions.triggerQuality = scoreDimension(
    40 + Math.round((skillChecks.filter((check) => check.hasTriggerCondition).length / Math.max(skillChecks.length, 1)) * 60),
    skillChecks.filter((check) => !check.hasTriggerCondition).map((check) => `Add a clear trigger condition to ${check.id}.`)
  );
  dimensions.instructionSafety = scoreDimension(
    100 - skillChecks.filter((check) => check.hasUnsafeInstruction).length * 35,
    skillChecks.filter((check) => check.hasUnsafeInstruction).map((check) => `Remove unsafe instruction patterns from ${check.id}.`)
  );
  dimensions.outputContract = scoreDimension(
    40 + Math.round((skillChecks.filter((check) => check.hasExpectedOutput).length / Math.max(skillChecks.length, 1)) * 60),
    skillChecks.filter((check) => !check.hasExpectedOutput).map((check) => `Define expected output for ${check.id}.`)
  );
  dimensions.contextEfficiency = scoreDimension(
    catalog.estimatedContextChars > 60000 ? 45 : catalog.estimatedContextChars > 24000 ? 75 : 95,
    catalog.estimatedContextChars > 24000 ? ["Split or shorten long instructions to reduce context pressure."] : []
  );
  dimensions.portability = scoreDimension(
    Math.round((targetChecks.filter((target) => target.status === "ok").length / Math.max(targetChecks.length, 1)) * 100),
    targetChecks.filter((target) => target.status !== "ok").map((target) => `Clarify support for ${target.name}.`)
  );
  dimensions.assetHygiene = scoreDimension(
    manifest.permissions ? 90 : 70,
    manifest.permissions ? [] : ["Declare pack permissions in packsmith.json."]
  );
  dimensions.testability = scoreDimension(
    skillChecks.some((check) => check.hasExample) || manifest.examples ? 90 : 70,
    skillChecks.some((check) => check.hasExample) || manifest.examples ? [] : ["Add one usage example or fixture."]
  );
  dimensions.maintenance = scoreDimension(
    60 + (manifest.version ? 10 : 0) + (manifest.license ? 10 : 0) + (manifest.repository ? 10 : 0) + (manifest.targetSupport ? 10 : 0),
    [
      ...(!manifest.license ? ["Add a license field."] : []),
      ...(!manifest.repository ? ["Add a repository or homepage field."] : [])
    ]
  );

  const values = Object.values(dimensions).map((dimension) => dimension.score);
  const overall = Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));

  return {
    overall,
    dimensions,
    fixes: [
      ...warnings,
      ...Object.values(dimensions).flatMap((dimension) => dimension.fixes)
    ]
  };
}

export async function doctorPack(packDir) {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);
  const warnings = [];
  const recommendations = [];
  const skillChecks = [];

  for (const skill of manifest.skills) {
    const check = await inspectSkillEntry(absolutePackDir, skill);
    skillChecks.push(check);

    if (!check.hasTriggerCondition) {
      warnings.push(`Skill "${skill.id}" is missing a clear trigger condition.`);
    }

    if (!check.hasExpectedOutput) {
      warnings.push(`Skill "${skill.id}" does not describe an expected output format.`);
    }
  }

  if (!manifest.description || manifest.description.length < 20) {
    warnings.push("Manifest description is short; add a clearer outcome-focused description.");
  }

  if (!manifest.permissions) {
    warnings.push("Manifest has no permissions metadata.");
  }

  for (const [first, second] of findDuplicateDescriptions([...manifest.skills, ...manifest.prompts])) {
    warnings.push(`Duplicate description appears in "${first}" and "${second}".`);
  }

  const targetChecks = manifest.targets.map((target) => {
    const adapter = getTargetAdapter(target);

    if (!adapter) {
      return {
        target,
        name: target,
        status: "unsupported",
        message: "No adapter metadata exists."
      };
    }

    if (adapter.status !== "supported") {
      warnings.push(`${adapter.name} adapter is planned but not yet installable.`);
      return {
        target,
        name: adapter.name,
        status: "planned",
        message: `${adapter.name}: adapter planned`
      };
    }

    return {
      target,
      name: adapter.name,
      status: "ok",
      message: `${adapter.name}: OK`
    };
  });

  if (catalog.estimatedContextChars > 24000) {
    recommendations.push("Split long skills or prompts to reduce context pressure.");
  }

  if (warnings.length === 0) {
    recommendations.push("No blocking issues found.");
  } else {
    recommendations.push("Fix warnings before publishing this pack.");
  }

  const supportedTargets = targetChecks.filter((target) => target.status === "ok").length;
  const portabilityScore = Math.round((supportedTargets / Math.max(targetChecks.length, 1)) * 100);
  const score = calculateQualityScore({ manifest, catalog, skillChecks, targetChecks, warnings });

  return {
    packDir: absolutePackDir,
    name: manifest.name,
    version: manifest.version,
    context: {
      totalChars: catalog.estimatedContextChars,
      tokenPressure: estimateTokenPressure(catalog.estimatedContextChars),
      skills: skillSummaries,
      prompts: promptSummaries
    },
    quality: {
      warnings,
      skillChecks,
      score
    },
    score,
    portability: {
      score: portabilityScore,
      targets: targetChecks
    },
    recommendations
  };
}

function permissionWarnings(permissions = {}) {
  return Object.entries(permissions)
    .filter(([name, value]) => value === "required" || ((name === "network" || name === "browser") && value === "optional"))
    .map(([name, value]) => `${name}: ${value}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolvePolicyRegistryPath(registryPath, policyPath) {
  if (/^https?:\/\//i.test(registryPath)) {
    return registryPath;
  }

  return path.isAbsolute(registryPath) ? path.resolve(registryPath) : path.resolve(path.dirname(policyPath), registryPath);
}

function normalizePolicy(policy, policyPath) {
  const normalizeList = (field) => (Array.isArray(policy[field]) ? policy[field].map((value) => value.trim()) : null);
  const allowedPermissions = normalizeList("allowedPermissions");
  const allowedRequiredPermissions =
    normalizeList("allowedRequiredPermissions") ?? allowedPermissions ?? DEFAULT_ALLOWED_REQUIRED_PERMISSIONS;

  return {
    path: policyPath,
    requireVerified: policy.requireVerified ?? policy.requiredVerified ?? false,
    allowedPacks: normalizeList("allowedPacks"),
    blockedPacks: normalizeList("blockedPacks") ?? [],
    allowedRegistries: Array.isArray(policy.allowedRegistries)
      ? policy.allowedRegistries.map((registryPath) => resolvePolicyRegistryPath(registryPath.trim(), policyPath))
      : null,
    allowedPublishers: normalizeList("allowedPublishers"),
    allowedRequiredPermissions,
    allowedPermissions,
    maxRisk: policy.maxRisk ?? "high",
    allowedTargets: normalizeList("allowedTargets"),
    maxContextSize: policy.maxContextSize ?? null
  };
}

function formatPolicyPermissionList(permissions) {
  return permissions.length > 0 ? permissions.join(", ") : "none";
}

async function collectPolicyIssues(policy, policyPath, options = {}) {
  const issues = [];

  if (!isPlainObject(policy)) {
    return ["Policy file must contain a JSON object."];
  }

  for (const field of Object.keys(policy)) {
    if (!KNOWN_POLICY_FIELDS.has(field)) {
      issues.push(`Unknown policy field "${field}".`);
    }
  }

  if (policy.requireVerified !== undefined && typeof policy.requireVerified !== "boolean") {
    issues.push("requireVerified must be a boolean.");
  }

  if (policy.requiredVerified !== undefined && typeof policy.requiredVerified !== "boolean") {
    issues.push("requiredVerified must be a boolean.");
  }

  if (policy.maxRisk !== undefined && !RISK_ORDER.includes(policy.maxRisk)) {
    issues.push(`maxRisk must be one of: ${RISK_ORDER.join(", ")}.`);
  }

  if (
    policy.maxContextSize !== undefined &&
    (typeof policy.maxContextSize !== "number" || !Number.isFinite(policy.maxContextSize) || policy.maxContextSize <= 0)
  ) {
    issues.push("maxContextSize must be a positive finite number of characters.");
  }

  for (const field of POLICY_STRING_LIST_FIELDS) {
    if (policy[field] === undefined) {
      continue;
    }

    if (!Array.isArray(policy[field])) {
      issues.push(`${field} must be an array.`);
      continue;
    }

    if (policy[field].some((value) => typeof value !== "string" || value.trim().length === 0)) {
      issues.push(`${field} must contain only strings.`);
    }
  }

  if (Array.isArray(policy.allowedRequiredPermissions)) {
    for (const permission of policy.allowedRequiredPermissions) {
      if (typeof permission === "string" && permission.trim().length > 0 && !KNOWN_PERMISSION_NAMES.has(permission)) {
        issues.push(
          `Unknown permission "${permission}" in allowedRequiredPermissions. Supported permissions: ${Array.from(
            KNOWN_PERMISSION_NAMES
          ).join(", ")}.`
        );
      }
    }
  }

  if (Array.isArray(policy.allowedPermissions)) {
    for (const permission of policy.allowedPermissions) {
      if (typeof permission === "string" && permission.trim().length > 0 && !KNOWN_PERMISSION_NAMES.has(permission)) {
        issues.push(
          `Unknown permission "${permission}" in allowedPermissions. Supported permissions: ${Array.from(KNOWN_PERMISSION_NAMES).join(", ")}.`
        );
      }
    }
  }

  if (Array.isArray(policy.allowedTargets)) {
    for (const target of policy.allowedTargets) {
      if (typeof target === "string" && target.trim().length > 0 && !SUPPORTED_TARGET_IDS.has(target)) {
        issues.push(`Unknown target "${target}" in allowedTargets. Supported targets: ${formatSupportedTargets()}.`);
      }
    }
  }

  if (options.checkRegistryFiles && Array.isArray(policy.allowedRegistries)) {
    for (const registryPath of policy.allowedRegistries) {
      if (typeof registryPath !== "string" || registryPath.trim().length === 0) {
        continue;
      }

      if (/^https?:\/\//i.test(registryPath)) {
        continue;
      }

      const resolvedRegistryPath = resolvePolicyRegistryPath(registryPath.trim(), policyPath);

      if (!(await pathExists(resolvedRegistryPath))) {
        issues.push(`allowedRegistries entry not found: ${resolvedRegistryPath}.`);
      }
    }
  }

  return issues;
}

export async function validatePolicy(policyPath) {
  const absolutePolicyPath = path.resolve(policyPath ?? "");
  const issues = [];

  if (!policyPath) {
    issues.push("Policy file path is required.");
    return {
      path: absolutePolicyPath,
      policy: null,
      issues,
      valid: false
    };
  }

  if (!(await pathExists(absolutePolicyPath))) {
    issues.push(`Policy file not found: ${absolutePolicyPath}.`);
    return {
      path: absolutePolicyPath,
      policy: null,
      issues,
      valid: false
    };
  }

  let policy;

  try {
    policy = await readJson(absolutePolicyPath);
  } catch (error) {
    issues.push(`Policy file is not valid JSON: ${error.message}`);
    return {
      path: absolutePolicyPath,
      policy: null,
      issues,
      valid: false
    };
  }

  issues.push(...(await collectPolicyIssues(policy, absolutePolicyPath, { checkRegistryFiles: true })));

  return {
    path: absolutePolicyPath,
    policy: issues.length === 0 ? normalizePolicy(policy, absolutePolicyPath) : null,
    issues,
    valid: issues.length === 0
  };
}

async function loadPolicy(policyPath) {
  if (!policyPath) {
    return null;
  }

  const absolutePolicyPath = path.resolve(policyPath);

  if (!(await pathExists(absolutePolicyPath))) {
    throw new Error(`Policy file not found: ${absolutePolicyPath}`);
  }

  const policy = await readJson(absolutePolicyPath);
  const issues = await collectPolicyIssues(policy, absolutePolicyPath);

  if (issues.length > 0) {
    throw new Error(`Invalid policy file: ${issues.join(" ")}`);
  }

  return normalizePolicy(policy, absolutePolicyPath);
}

function evaluatePolicy(receipt, policy) {
  if (!policy) {
    return [];
  }

  const issues = [];

  if (policy.allowedPacks && !policy.allowedPacks.includes(receipt.pack)) {
    issues.push(`Pack "${receipt.pack}" is not in allowedPacks.`);
  }

  if (policy.blockedPacks.includes(receipt.pack)) {
    issues.push(`Pack "${receipt.pack}" is blocked by policy.`);
  }

  if (policy.requireVerified && !receipt.verified) {
    issues.push(`Policy requires unverified pack "${receipt.pack}" to come from a verified registry entry.`);
  }

  if (policy.allowedRegistries) {
    const registryPath = receipt.registry ? path.resolve(receipt.registry) : null;
    const registryUrl = receipt.registryUrl ?? null;
    const registryAllowed =
      (registryPath && policy.allowedRegistries.includes(registryPath)) ||
      (registryUrl && policy.allowedRegistries.includes(registryUrl));

    if (!registryAllowed) {
      issues.push(`Pack "${receipt.pack}" registry is not allowed: ${registryUrl ?? registryPath ?? "(none)"}.`);
    }
  }

  if (policy.allowedPublishers) {
    const publisher = receipt.publisher ?? "(unknown)";

    if (!policy.allowedPublishers.includes(publisher)) {
      issues.push(`Pack "${receipt.pack}" publisher "${publisher}" is not allowed.`);
    }
  }

  if (policy.allowedTargets && !policy.allowedTargets.includes(receipt.target)) {
    issues.push(`Pack "${receipt.pack}" target "${receipt.target}" is not allowed.`);
  }

  if (receipt.riskLevel && policy.maxRisk && !allowsRisk(receipt.riskLevel, policy.maxRisk)) {
    issues.push(`Pack "${receipt.pack}" risk ${receipt.riskLevel} exceeds policy maxRisk ${policy.maxRisk}.`);
  }

  // Context-poisoning gate (security-input.md §3 item 2): report an issue when
  // the estimated context size exceeds the policy ceiling. `contextChars` is
  // attached by auditInstalledPacks (from the installed catalog.json) and by
  // policyReceiptForPlan (from the install plan); receipts without a known
  // context size are not evaluated against this field.
  if (
    policy.maxContextSize !== null &&
    policy.maxContextSize !== undefined &&
    typeof receipt.contextChars === "number" &&
    receipt.contextChars > policy.maxContextSize
  ) {
    issues.push(
      `Pack "${receipt.pack}" context size ${receipt.contextChars} chars exceeds policy maxContextSize ${policy.maxContextSize}.`
    );
  }

  for (const [permission, value] of Object.entries(receipt.permissions ?? {})) {
    if (value === "required" && !policy.allowedRequiredPermissions.includes(permission)) {
      issues.push(
        `Pack "${receipt.pack}" permission ${permission}: required is not allowed. Allowed required permissions: ${formatPolicyPermissionList(
          policy.allowedRequiredPermissions
        )}.`
      );
    }
  }

  return issues;
}

// Reads the estimated context size recorded in an installed pack's catalog.json
// (written by buildCatalog at build time) so the audit path can enforce
// maxContextSize without trusting a mutable receipt field.
async function readInstalledContextChars(installDir) {
  try {
    const catalog = await readJson(path.join(installDir, "catalog.json"));
    return typeof catalog?.estimatedContextChars === "number" ? catalog.estimatedContextChars : null;
  } catch {
    // Advisory field: an unreadable catalog must not break the rest of audit.
    return null;
  }
}

function policyReceiptForPlan(plan, target) {
  return {
    pack: plan.pack.id,
    version: plan.pack.version,
    target: target.target,
    installDir: target.installDir,
    source: plan.source,
    registry: plan.provenance.registry,
    registryUrl: plan.provenance.registryUrl,
    publisher: plan.provenance.publisher === "(local)" ? null : plan.provenance.publisher,
    verified: plan.provenance.verified,
    riskLevel: plan.risk.level,
    permissions: plan.permissions,
    contextChars: typeof plan.context?.estimatedChars === "number" ? plan.context.estimatedChars : null
  };
}

function evaluateInstallPolicy(plan, policy) {
  if (!policy) {
    return [];
  }

  return plan.targets.flatMap((target) => evaluatePolicy(policyReceiptForPlan(plan, target), policy));
}

export async function auditInstalledPacks(options = {}) {
  const stateDir = path.resolve(options.stateDir ?? defaultStateDir());
  const receipts = await readReceipts(stateDir);
  const lockfile = await loadLockfile(stateDir);
  const policy = await loadPolicy(options.policy);
  const results = [];

  for (const receipt of receipts) {
    const installedExists = await pathExists(receipt.installDir);
    const currentChecksum = installedExists ? await hashDirectory(receipt.installDir) : null;
    const lockEntry = lockfile.installed.find(
      (entry) => entry.pack === receipt.pack && entry.target === receipt.target
    );
    const issues = [];

    if (!installedExists) {
      issues.push("install directory missing");
    } else if (currentChecksum !== receipt.checksum) {
      issues.push("checksum mismatch");
    }

    if (!lockEntry) {
      issues.push("missing lockfile entry");
    }

    if (lockEntry?.sourceChecksum && receipt.sourceChecksum && lockEntry.sourceChecksum !== receipt.sourceChecksum) {
      issues.push("source checksum mismatch");
    }

    const contextChars = installedExists ? await readInstalledContextChars(receipt.installDir) : null;
    const policyIssues = evaluatePolicy({ ...receipt, contextChars }, policy);
    const update = await checkUpdateAvailability(receipt);

    results.push({
      pack: receipt.pack,
      version: receipt.version,
      target: receipt.target,
      installDir: receipt.installDir,
      source: receipt.source,
      registry: receipt.registry,
      registryUrl: receipt.registryUrl,
      publisher: receipt.publisher,
      verified: receipt.verified,
      expectedChecksum: receipt.checksum,
      currentChecksum,
      contextChars,
      permissions: receipt.permissions ?? {},
      permissionWarnings: permissionWarnings(receipt.permissions),
      update,
      policyIssues,
      issues,
      status: issues.length === 0 && policyIssues.length === 0 ? "ok" : "warning"
    });
  }

  return {
    stateDir,
    policy,
    results
  };
}

export async function preparePublish(packDir, options = {}) {
  const absolutePackDir = path.resolve(packDir ?? "");

  if (!packDir) {
    throw new Error("Missing <pack-dir> argument for publish.");
  }

  const validation = await validatePack(absolutePackDir);
  const doctor = await doctorPack(absolutePackDir);
  const packSize = await directorySize(absolutePackDir);
  const registryEntry = {
    id: validation.manifest.name,
    name: validation.manifest.name
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" "),
    description: validation.manifest.description,
    version: validation.manifest.version,
    author: options.author ?? "packsmith",
    category: options.category ?? validation.manifest.category ?? "community",
    tags: options.tags ?? validation.manifest.tags ?? ["community"],
    targets: validation.manifest.targets,
    source: options.source ?? absolutePackDir,
    license: options.license ?? validation.manifest.license ?? "MIT",
    riskLevel: highestRiskLevel(
      options.riskLevel,
      inferRiskLevel(validation.manifest, null, await scanDirectoryAssets(absolutePackDir)),
      doctor.quality.warnings.length > 0 ? "medium" : "low"
    ),
    estimatedContextSize: options.estimatedContextSize ?? doctor.context.totalChars,
    usageExample: options.usageExample ?? `packsmith install ${validation.manifest.name}`,
    verified: false,
    updatedAt: new Date().toISOString(),
    stars: 0,
    installCount: 0
  };

  return {
    packDir: absolutePackDir,
    manifest: validation.manifest,
    doctor,
    packSize,
    dryRun: Boolean(options.dryRun),
    registryEntry
  };
}

// Exported for unit tests of the semver comparison used by `update` (#43).
export { compareVersion };
export { TARGET_ADAPTERS };
