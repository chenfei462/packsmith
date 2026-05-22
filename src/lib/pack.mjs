import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { access, mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import {
  copyDirectory,
  copyFileOrDirectory,
  countDirectoryFiles,
  directorySize,
  ensureDir,
  pathExists,
  readJson,
  removePath,
  writeJson,
  writeText
} from "./fs-utils.mjs";

const SUPPORTED_TARGETS = new Set(["claude-code", "codex"]);
const SUPPORTED_INSTALL_SCOPES = new Set(["project", "user"]);
const OVERSIZED_PACK_CONTEXT_THRESHOLD = 8000;
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

function createActionableError(code, message, fix, command, options = {}) {
  const error = new Error(message);
  error.code = code;
  error.fix = fix;
  error.command = command;

  if (options.cause) {
    error.cause = options.cause;
  }

  return error;
}

function throwActionableError(code, message, fix, command, options = {}) {
  throw createActionableError(code, message, fix, command, options);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throwActionableError(
      "PSM002",
      `${label} must be a non-empty string.`,
      "Add the missing manifest field or make it a non-empty string.",
      "packsmith inspect <pack-dir>"
    );
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throwActionableError(
      "PSM002",
      `${label} must be a non-empty array.`,
      "Add the missing manifest array or include at least one entry.",
      "packsmith inspect <pack-dir>"
    );
  }
}

function ensureUniqueIds(items, label) {
  const seen = new Set();

  for (const item of items) {
    assertString(item.id, `${label}.id`);

    if (seen.has(item.id)) {
      throwActionableError(
        "PSM004",
        `Duplicate ${label} id "${item.id}".`,
        "Give each skill and prompt a unique id in packsmith.json.",
        "packsmith inspect <pack-dir>"
      );
    }

    seen.add(item.id);
  }
}

function parseSkillFrontmatter(skillMarkdown, skillId) {
  const frontmatterMatch = skillMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!frontmatterMatch) {
    throwActionableError(
      "PSM007",
      `Skill "${skillId}" must start with YAML frontmatter in SKILL.md.`,
      "Add YAML frontmatter with name and description at the top of SKILL.md.",
      "packsmith validate <pack-dir>"
    );
  }

  const frontmatter = {};
  const lines = frontmatterMatch[1].split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = value;
  }

  if (typeof frontmatter.name !== "string" || frontmatter.name.length === 0) {
    throwActionableError(
      "PSM007",
      `Skill "${skillId}" frontmatter must include a non-empty name.`,
      "Add a non-empty name field to the SKILL.md frontmatter.",
      "packsmith validate <pack-dir>"
    );
  }

  if (typeof frontmatter.description !== "string" || frontmatter.description.length === 0) {
    throwActionableError(
      "PSM007",
      `Skill "${skillId}" frontmatter must include a non-empty description.`,
      "Add a non-empty description field to the SKILL.md frontmatter.",
      "packsmith validate <pack-dir>"
    );
  }

  if (!SKILL_NAME_PATTERN.test(frontmatter.name)) {
    throwActionableError(
      "PSM008",
      `Skill "${skillId}" frontmatter name must use lowercase letters, numbers, and hyphens.`,
      "Rename the skill frontmatter name to kebab-case, for example starter-skill.",
      "packsmith validate <pack-dir>"
    );
  }

  return frontmatter;
}

function extractSkillBody(skillMarkdown) {
  return skillMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

async function loadManifest(packDir) {
  const manifestPath = path.join(packDir, "packsmith.json");

  if (!(await pathExists(manifestPath))) {
    throwActionableError(
      "PSM001",
      `Missing manifest: ${manifestPath}`,
      "Create a packsmith.json manifest at the pack root.",
      "packsmith init <pack-dir>"
    );
  }

  const manifest = await readJson(manifestPath);
  assertString(manifest.name, "manifest.name");
  assertString(manifest.description, "manifest.description");
  assertString(manifest.version, "manifest.version");
  assertArray(manifest.targets, "manifest.targets");
  assertArray(manifest.skills, "manifest.skills");

  for (const target of manifest.targets) {
    if (!SUPPORTED_TARGETS.has(target)) {
      throwActionableError(
        "PSM003",
        `Unsupported target "${target}". Supported targets: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`,
        "Use one of the supported targets in packsmith.json.",
        "packsmith inspect <pack-dir>"
      );
    }
  }

  manifest.prompts ??= [];

  if (!Array.isArray(manifest.prompts)) {
    throwActionableError(
      "PSM002",
      "manifest.prompts must be an array when present.",
      "Change manifest.prompts to an array, or remove it when the pack has no prompts.",
      "packsmith inspect <pack-dir>"
    );
  }

  ensureUniqueIds(manifest.skills, "skill");
  ensureUniqueIds(manifest.prompts, "prompt");

  for (const skill of manifest.skills) {
    assertString(skill.path, `skill "${skill.id}" path`);
    assertString(skill.description, `skill "${skill.id}" description`);
  }

  for (const prompt of manifest.prompts) {
    assertString(prompt.path, `prompt "${prompt.id}" path`);
    assertString(prompt.description, `prompt "${prompt.id}" description`);
  }

  return { manifestPath, manifest };
}

async function validateAssets(packDir, manifest) {
  const skillSummaries = [];
  const promptSummaries = [];
  const promptBasenames = new Map();

  for (const skill of manifest.skills) {
    const absoluteSkillDir = path.join(packDir, skill.path);
    const skillEntryPath = path.join(absoluteSkillDir, "SKILL.md");

    if (!(await pathExists(absoluteSkillDir))) {
      throwActionableError(
        "PSM005",
        `Missing skill directory for "${skill.id}": ${absoluteSkillDir}`,
        "Create the skill directory or update the skill path in packsmith.json.",
        "packsmith validate <pack-dir>"
      );
    }

    if (!(await pathExists(skillEntryPath))) {
      throwActionableError(
        "PSM006",
        `Skill "${skill.id}" must include SKILL.md: ${skillEntryPath}`,
        "Create SKILL.md inside the skill directory.",
        "packsmith validate <pack-dir>"
      );
    }

    const bytes = await directorySize(absoluteSkillDir);
    const fileCount = await countDirectoryFiles(absoluteSkillDir);
    const skillMarkdown = await readFile(skillEntryPath, "utf8");
    const frontmatter = parseSkillFrontmatter(skillMarkdown, skill.id);

    skillSummaries.push({
      id: skill.id,
      path: skill.path,
      bytes,
      fileCount,
      contextChars: skillMarkdown.length,
      content: extractSkillBody(skillMarkdown),
      frontmatter
    });
  }

  for (const prompt of manifest.prompts) {
    const absolutePromptPath = path.join(packDir, prompt.path);
    const promptBasename = path.basename(prompt.path);

    if (!(await pathExists(absolutePromptPath))) {
      throwActionableError(
        "PSM009",
        `Missing prompt file for "${prompt.id}": ${absolutePromptPath}`,
        "Create the prompt file or update the prompt path in packsmith.json.",
        "packsmith validate <pack-dir>"
      );
    }

    const existingPrompt = promptBasenames.get(promptBasename);

    if (existingPrompt && existingPrompt !== prompt.id) {
      throwActionableError(
        "PSM010",
        `Duplicate prompt output basename "${promptBasename}" for prompts "${existingPrompt}" and "${prompt.id}".`,
        "Rename one prompt file so built bundles do not overwrite prompt output.",
        "packsmith inspect <pack-dir>"
      );
    }

    promptBasenames.set(promptBasename, prompt.id);

    const content = await readFile(absolutePromptPath, "utf8");

    promptSummaries.push({
      id: prompt.id,
      path: prompt.path,
      bytes: Buffer.byteLength(content, "utf8"),
      contextChars: content.length,
      content
    });
  }

  return { skillSummaries, promptSummaries };
}

async function loadScopedInstalledPacks(scopedInstall) {
  const metadataParent = path.dirname(scopedInstall.metadataRoot);

  if (!(await pathExists(metadataParent))) {
    return [];
  }

  const entries = await readdir(metadataParent, { withFileTypes: true });
  const installed = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const metadataDir = path.join(metadataParent, entry.name);
    const bundlePath = path.join(metadataDir, "bundle.json");
    const manifestPath = path.join(metadataDir, "manifest.json");

    if (!(await pathExists(bundlePath)) || !(await pathExists(manifestPath))) {
      continue;
    }

    installed.push({
      metadataDir,
      bundle: await readJson(bundlePath),
      manifest: await readJson(manifestPath),
      installLock: (await pathExists(path.join(metadataDir, "install-lock.json")))
        ? await readJson(path.join(metadataDir, "install-lock.json"))
        : null
    });
  }

  return installed;
}

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return `sha256-${crypto.createHash("sha256").update(content).digest("base64")}`;
}

function buildInstallSource(bundleDir, bundleRoot, cleanupRoot) {
  return {
    type: cleanupRoot ? "source-pack" : "built-bundle",
    path: path.resolve(bundleDir),
    bundleRoot
  };
}

async function buildInstallLock({ manifest, target, scope, source, metadataRoot, skillsRoot, targetBundle, previousVersion }) {
  const files = [];

  for (const skill of targetBundle.skills ?? []) {
    const skillDirName = path.basename(path.dirname(skill.path));
    const skillEntryPath = path.join(skillsRoot, skillDirName, "SKILL.md");
    files.push({
      kind: "skill",
      id: skill.id,
      path: skillEntryPath,
      integrity: await hashFile(skillEntryPath)
    });
  }

  for (const prompt of targetBundle.prompts ?? []) {
    const promptPath = path.join(metadataRoot, prompt.path);
    files.push({
      kind: "prompt",
      id: prompt.id,
      path: promptPath,
      integrity: await hashFile(promptPath)
    });
  }

  return {
    name: manifest.name,
    version: manifest.version,
    lockedVersion: manifest.version,
    previousVersion: previousVersion ?? null,
    target,
    scope,
    source,
    installedAt: new Date().toISOString(),
    files
  };
}

function buildCatalog(manifest, skillSummaries, promptSummaries) {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    targets: manifest.targets,
    skills: skillSummaries.map(summarizeSkill),
    prompts: promptSummaries.map(summarizePrompt),
    estimatedContextChars:
      skillSummaries.reduce((sum, skill) => sum + skill.contextChars, 0) +
      promptSummaries.reduce((sum, prompt) => sum + prompt.contextChars, 0)
  };
}

function normalizeContent(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function summarizeSkill(skill) {
  return {
    id: skill.id,
    path: skill.path,
    bytes: skill.bytes,
    fileCount: skill.fileCount,
    contextChars: skill.contextChars
  };
}

function summarizePrompt(prompt) {
  return {
    id: prompt.id,
    path: prompt.path,
    bytes: prompt.bytes,
    contextChars: prompt.contextChars
  };
}

function buildDuplicateSummary(catalog, duplicateGroups) {
  const duplicateContextChars = duplicateGroups.reduce(
    (sum, group) => sum + group.repeatedChars * Math.max(0, group.assets.length - 1),
    0
  );
  const duplicateContextRatio = catalog.estimatedContextChars > 0 ? duplicateContextChars / catalog.estimatedContextChars : 0;
  const largestDuplicateGroup = duplicateGroups.length > 0 ? { ...duplicateGroups[0], assets: [...duplicateGroups[0].assets] } : null;

  return {
    duplicateContextChars,
    duplicateContextRatio,
    largestDuplicateGroup
  };
}

function buildDiagnostics(catalog, skillSummaries, promptSummaries) {
  const duplicateMap = new Map();
  const duplicateGroups = [];
  const diagnostics = [];

  for (const skill of skillSummaries) {
    const key = normalizeContent(skill.content);

    if (!key) {
      continue;
    }

    const current = duplicateMap.get(key) ?? [];
    current.push(`skill:${skill.id}`);
    duplicateMap.set(key, current);
  }

  for (const prompt of promptSummaries) {
    const key = normalizeContent(prompt.content);

    if (!key) {
      continue;
    }

    const current = duplicateMap.get(key) ?? [];
    current.push(`prompt:${prompt.id}`);
    duplicateMap.set(key, current);
  }

  for (const [content, assets] of duplicateMap.entries()) {
    if (assets.length < 2) {
      continue;
    }

    duplicateGroups.push({
      assets,
      repeatedChars: content.length
    });
  }

  duplicateGroups.sort((left, right) => right.repeatedChars - left.repeatedChars);

  if (duplicateGroups.length > 0) {
    diagnostics.push({
      code: "duplicate-content",
      severity: "warning",
      message: `Found ${duplicateGroups.length} repeated content group(s) across skills and prompts.`,
      fix: "Move repeated guidance into one skill or prompt and reference it instead of duplicating the same body.",
      command: "packsmith inspect <pack-dir>",
      groups: duplicateGroups.map((group) => ({
        assets: group.assets,
        repeatedChars: group.repeatedChars
      }))
    });
  }

  if (catalog.estimatedContextChars >= OVERSIZED_PACK_CONTEXT_THRESHOLD) {
    const thresholdChars = OVERSIZED_PACK_CONTEXT_THRESHOLD;
    const overageChars = catalog.estimatedContextChars - thresholdChars;

    diagnostics.push({
      code: "oversized-pack",
      severity: "warning",
      thresholdChars,
      overageChars,
      fix: "Split the pack into narrower skills or move large reference material outside the loaded skill body.",
      command: "packsmith inspect <pack-dir>",
      message:
        overageChars > 0
          ? `Estimated context ${catalog.estimatedContextChars} chars exceeds the ${thresholdChars}-char warning threshold by ${overageChars} chars.`
          : `Estimated context ${catalog.estimatedContextChars} chars reaches the ${thresholdChars}-char warning threshold.`
    });
  }

  return { diagnostics, duplicateGroups };
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveHomeDir(options = {}) {
  const envHome =
    process.env.HOME ??
    process.env.USERPROFILE ??
    (process.env.HOMEDRIVE && process.env.HOMEPATH ? path.join(process.env.HOMEDRIVE, process.env.HOMEPATH) : null);

  return path.resolve(options.homeDir ?? envHome ?? os.homedir());
}

function resolveWorkingDir(options = {}) {
  return path.resolve(options.cwd ?? process.cwd());
}

async function statIfExists(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function ensureWritableDirectory(targetPath, label, fix = "Create the directory, fix permissions, or choose a different destination.") {
  const details = await statIfExists(targetPath);

  if (details) {
    if (!details.isDirectory()) {
      throwActionableError(
        "PSM021",
        `${label} must be a directory: ${targetPath}`,
        fix,
        "packsmith install <pack-or-built-dir> --target <name> --dest <dir>"
      );
    }

    try {
      await access(targetPath, fsConstants.W_OK);
    } catch {
      throwActionableError(
        "PSM021",
        `${label} is not writable: ${targetPath}`,
        fix,
        "packsmith install <pack-or-built-dir> --target <name> --dest <dir>"
      );
    }

    return { existed: true };
  }

  try {
    await ensureDir(targetPath);
  } catch (error) {
    const reason = error?.message ? ` Reason: ${error.message}` : "";
    throwActionableError(
      "PSM021",
      `${label} is not writable or cannot be created: ${targetPath}.${reason} ${fix}`,
      fix,
      "packsmith install <pack-or-built-dir> --target <name> --dest <dir>",
      { cause: error }
    );
  }

  return { existed: false };
}

async function inspectDirectoryState(targetPath, label) {
  const details = await statIfExists(targetPath);

  if (!details) {
    return {
      label,
      path: targetPath,
      exists: false,
      kind: "missing",
      writable: false,
      message: `${label} does not exist yet: ${targetPath}`,
      code: "PSM024",
      fix: "Run packsmith install for this scope, or create the directory before retrying.",
      command: "packsmith install <pack-or-built-dir> --target claude-code --scope user"
    };
  }

  if (!details.isDirectory()) {
    return {
      label,
      path: targetPath,
      exists: true,
      kind: "file",
      writable: false,
      message: `${label} must be a directory, but found a file: ${targetPath}`,
      code: "PSM024",
      fix: "Move or remove the file, then retry the command.",
      command: "packsmith doctor --target claude-code --scope user"
    };
  }

  try {
    await access(targetPath, fsConstants.W_OK);

    return {
      label,
      path: targetPath,
      exists: true,
      kind: "directory",
      writable: true,
      message: `${label} is present and writable: ${targetPath}`,
      code: null,
      fix: null,
      command: null
    };
  } catch {
    return {
      label,
      path: targetPath,
      exists: true,
      kind: "directory",
      writable: false,
      message: `${label} is not writable: ${targetPath}`,
      code: "PSM024",
      fix: "Fix directory permissions or choose a different install scope.",
      command: "packsmith doctor --target claude-code --scope user"
    };
  }
}

function resolveScopedInstallPaths(target, manifest, options = {}) {
  const scope = options.scope;

  if (!scope) {
    return null;
  }

  if (!SUPPORTED_INSTALL_SCOPES.has(scope)) {
    throwActionableError(
      "PSM020",
      `Install scope must be one of: ${Array.from(SUPPORTED_INSTALL_SCOPES).join(", ")}.`,
      "Use --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  if (target !== "claude-code") {
    throwActionableError(
      "PSM020",
      `Scoped install is only supported for claude-code. Received target "${target}".`,
      "Use --scope only with --target claude-code, or use --dest for custom installs.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const baseDir =
    scope === "user" ? path.join(resolveHomeDir(options), ".claude") : path.join(resolveWorkingDir(options), ".claude");

  return {
    scope,
    skillsRoot: path.join(baseDir, "skills"),
    metadataRoot: path.join(baseDir, "packsmith", manifest.name)
  };
}

function listBundleSkillDirNames(bundle) {
  return (bundle.skills ?? []).map((skill) => path.basename(path.dirname(skill.path)));
}

async function inspectInstalledBundleIntegrity(scopedInstall, bundle, installLock = null) {
  const missingSkills = [];
  const missingPrompts = [];
  const driftedSkills = [];
  const driftedPrompts = [];

  for (const skill of bundle.skills ?? []) {
    const skillDirName = path.basename(path.dirname(skill.path));

    if (!(await pathExists(path.join(scopedInstall.skillsRoot, skillDirName)))) {
      missingSkills.push(skill.id);
    }
  }

  for (const prompt of bundle.prompts ?? []) {
    const promptPath = path.join(scopedInstall.metadataRoot, prompt.path);

    if (!(await pathExists(promptPath))) {
      missingPrompts.push(prompt.id);
    }
  }

  if (installLock?.files) {
    for (const file of installLock.files) {
      if (!(await pathExists(file.path))) {
        continue;
      }

      const actualIntegrity = await hashFile(file.path);

      if (actualIntegrity === file.integrity) {
        continue;
      }

      if (file.kind === "skill") {
        driftedSkills.push(file.id);
      }

      if (file.kind === "prompt") {
        driftedPrompts.push(file.id);
      }
    }
  }

  const missing = missingSkills.length > 0 || missingPrompts.length > 0;
  const drifted = driftedSkills.length > 0 || driftedPrompts.length > 0;

  return {
    ok: !missing && !drifted,
    missingSkills,
    missingPrompts,
    driftedSkills,
    driftedPrompts,
    code: missing ? "PSM023" : drifted ? "PSM025" : null,
    status: missing ? "broken" : drifted ? "drifted" : "ok",
    fix:
      !missing && !drifted
        ? null
        : drifted
          ? "Run upgrade or reinstall the pack to replace drifted managed files with the locked source version."
          : "Reinstall the pack to restore missing managed skill or prompt files.",
    command:
      !missing && !drifted
        ? null
        : drifted
          ? "packsmith upgrade <pack-or-built-dir> --target claude-code --scope user"
          : "packsmith install <pack-or-built-dir> --target claude-code --scope user"
  };
}

async function listUnmanagedSkillDirectories(scopedInstall, installedBundles) {
  const skillsRootState = await statIfExists(scopedInstall.skillsRoot);

  if (!skillsRootState?.isDirectory()) {
    return [];
  }

  const entries = await readdir(scopedInstall.skillsRoot, { withFileTypes: true });
  const managedSkillDirNames = new Set(
    installedBundles.flatMap((bundle) => (bundle.skillIds ?? []).map((skillId) => skillId))
  );

  return entries
    .filter((entry) => entry.isDirectory() && !managedSkillDirNames.has(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
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
  const installHint =
    target === "claude-code"
      ? "Copy the bundled `skills/` directory into your Claude Code skills location, for example under `.claude/skills/<pack-name>/`."
      : "Keep the bundled `skills/` directory with your repo and use the generated `AGENTS.md` as the bridge document for Codex-oriented workflows.";

  return `# ${manifest.name} for ${target}

Generated by Packsmith.

## Included

- ${manifest.skills.length} skill(s)
- ${manifest.prompts.length} prompt(s)

## Install

${installHint}
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
  await ensureDir(targetRoot);

  for (const skill of manifest.skills) {
    const source = path.join(packDir, skill.path);
    const targetDir = path.join(targetRoot, "skills", skill.id);
    await copyDirectory(source, targetDir);
  }

  for (const prompt of manifest.prompts) {
    const source = path.join(packDir, prompt.path);
    const targetFile = path.join(targetRoot, "prompts", path.basename(prompt.path));
    const promptContent = await readFile(source, "utf8");
    await writeText(targetFile, promptContent);
  }

  await writeText(path.join(targetRoot, "README.md"), buildTargetReadme(target, manifest));

  if (target === "codex") {
    await writeText(path.join(targetRoot, "AGENTS.md"), buildCodexAgentsFile(manifest));
  }

  await writeJson(path.join(targetRoot, "bundle.json"), {
    target,
    pack: manifest.name,
    version: manifest.version,
    generatedAt: new Date().toISOString(),
    skills: manifest.skills.map((skill) => ({
      id: skill.id,
      path: toPosixPath(path.join("skills", skill.id, "SKILL.md"))
    })),
    prompts: manifest.prompts.map((prompt) => ({
      id: prompt.id,
      path: toPosixPath(path.join("prompts", path.basename(prompt.path)))
    }))
  });
}

export async function validatePack(packDir, options = {}) {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);
  const { diagnostics } = buildDiagnostics(catalog, skillSummaries, promptSummaries);

  if (options.strict && diagnostics.length > 0) {
    const codes = diagnostics.map((diagnostic) => diagnostic.code).join(", ");
    throwActionableError(
      "PSM011",
      `Strict validation failed: ${codes}.`,
      "Run inspect to review diagnostics, then remove duplicated or oversized context before retrying strict validation.",
      "packsmith inspect <pack-dir>"
    );
  }

  return {
    manifest,
    packDir: absolutePackDir,
    skillCount: skillSummaries.length,
    promptCount: promptSummaries.length,
    diagnostics
  };
}

export async function inspectPack(packDir) {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);
  const { diagnostics, duplicateGroups } = buildDiagnostics(catalog, skillSummaries, promptSummaries);
  const { duplicateContextChars, duplicateContextRatio, largestDuplicateGroup } = buildDuplicateSummary(catalog, duplicateGroups);

  return {
    packDir: absolutePackDir,
    name: catalog.name,
    version: catalog.version,
    targets: catalog.targets,
    skillCount: catalog.skills.length,
    promptCount: catalog.prompts.length,
    estimatedContextChars: catalog.estimatedContextChars,
    duplicateContextChars,
    duplicateContextRatio,
    largestDuplicateGroup,
    skills: skillSummaries.map(summarizeSkill),
    prompts: promptSummaries.map(summarizePrompt),
    diagnostics,
    duplicateGroups
  };
}

export async function buildPack(packDir, outDir = "dist") {
  const absolutePackDir = path.resolve(packDir);
  const { manifest } = await loadManifest(absolutePackDir);
  const { skillSummaries, promptSummaries } = await validateAssets(absolutePackDir, manifest);
  const outputBaseDir = path.isAbsolute(outDir) ? outDir : path.join(absolutePackDir, outDir);
  const outputRoot = path.join(outputBaseDir, manifest.name);
  const catalog = buildCatalog(manifest, skillSummaries, promptSummaries);

  await ensureDir(outputRoot);
  await writeJson(path.join(outputRoot, "manifest.json"), manifest);
  await writeJson(path.join(outputRoot, "catalog.json"), catalog);

  for (const target of manifest.targets) {
    const targetRoot = path.join(outputRoot, target);
    await emitTargetBundle(absolutePackDir, targetRoot, target, manifest);
  }

  return {
    manifest,
    outputRoot,
    targetsBuilt: manifest.targets
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

async function resolveInstallBundleSource(bundleDir) {
  const absoluteInputDir = path.resolve(bundleDir);
  const builtManifestPath = path.join(absoluteInputDir, "manifest.json");

  if (await pathExists(builtManifestPath)) {
    return {
      bundleRoot: absoluteInputDir,
      cleanupRoot: null
    };
  }

  const sourceManifestPath = path.join(absoluteInputDir, "packsmith.json");

  if (!(await pathExists(sourceManifestPath))) {
    throwActionableError(
      "PSM001",
      `Expected either a built bundle (manifest.json) or a source pack (packsmith.json): ${absoluteInputDir}`,
      "Pass a source pack directory with packsmith.json or a built bundle directory with manifest.json.",
      "packsmith build <pack-dir>"
    );
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-build-"));
  const built = await buildPack(absoluteInputDir, tempRoot);

  return {
    bundleRoot: built.outputRoot,
    cleanupRoot: tempRoot
  };
}

export async function installBundle(bundleDir, options = {}) {
  const { bundleRoot, cleanupRoot } = await resolveInstallBundleSource(bundleDir);

  try {
    const manifestPath = path.join(bundleRoot, "manifest.json");
    const manifest = await readJson(manifestPath);
    const target = options.target ?? manifest.targets?.[0];

    if (!target || !SUPPORTED_TARGETS.has(target)) {
      throwActionableError(
        "PSM020",
        `Install target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`,
        "Use --target claude-code or --target codex.",
        "packsmith install <pack-or-built-dir> --target <name> --dest <dir>"
      );
    }

    const targetSourceDir = path.join(bundleRoot, target);

    if (!(await pathExists(targetSourceDir))) {
      throwActionableError(
        "PSM020",
        `Missing built target directory: ${targetSourceDir}`,
        "Rebuild the pack for the requested target before installing.",
        "packsmith build <pack-dir>"
      );
    }

    if (options.dest && options.scope) {
      throwActionableError(
        "PSM020",
        "Use either --dest or --scope for install, not both.",
        "Choose --scope for Claude Code known paths or --dest for an explicit destination.",
        "packsmith install <pack-or-built-dir> --target <name> --dest <dir>"
      );
    }

    const scopedInstall = resolveScopedInstallPaths(target, manifest, options);

    if (scopedInstall) {
      const targetBundle = await readJson(path.join(targetSourceDir, "bundle.json"));
      const installedPacks = await loadScopedInstalledPacks(scopedInstall);
      const installedPack = installedPacks.find(({ manifest: installedManifest }) => installedManifest.name === manifest.name);
      const previousVersion = installedPack?.manifest?.version ?? null;
      const skillsRootState = await ensureWritableDirectory(
        scopedInstall.skillsRoot,
        `Claude Code ${scopedInstall.scope} scope skills root`,
        "Create the Claude Code skills directory, fix permissions, or choose a different --scope."
      );

      for (const skill of targetBundle.skills ?? []) {
        const skillDirName = path.basename(path.dirname(skill.path));
        const conflictingPack = installedPacks.find(({ manifest: installedManifest, bundle: installedBundle }) => {
          if (installedManifest.name === manifest.name) {
            return false;
          }

          return (installedBundle.skills ?? []).some((installedSkill) => path.basename(path.dirname(installedSkill.path)) === skillDirName);
        });

        if (conflictingPack) {
          throwActionableError(
            "PSM022",
            `Claude Code skill "${skillDirName}" is already owned by pack "${conflictingPack.manifest.name}" in ${scopedInstall.scope} scope.`,
            "Rename the skill id or uninstall the pack that owns the existing skill directory.",
            `packsmith list --target claude-code --scope ${scopedInstall.scope}`
          );
        }
      }

      if (installedPack) {
        const currentSkillDirNames = new Set(listBundleSkillDirNames(installedPack.bundle));
        const nextSkillDirNames = new Set(listBundleSkillDirNames(targetBundle));

        for (const skillDirName of currentSkillDirNames) {
          if (!nextSkillDirNames.has(skillDirName)) {
            await removePath(path.join(scopedInstall.skillsRoot, skillDirName));
          }
        }

        await removePath(scopedInstall.metadataRoot);
      }

      for (const skill of targetBundle.skills ?? []) {
        const sourceSkillDir = path.join(targetSourceDir, path.dirname(skill.path));
        const targetSkillDir = path.join(scopedInstall.skillsRoot, path.basename(path.dirname(skill.path)));
        await removePath(targetSkillDir);
        await copyDirectory(sourceSkillDir, targetSkillDir);
      }

      await ensureDir(scopedInstall.metadataRoot);
      await copyFileOrDirectory(path.join(targetSourceDir, "README.md"), path.join(scopedInstall.metadataRoot, "README.md"));
      await copyFileOrDirectory(path.join(targetSourceDir, "bundle.json"), path.join(scopedInstall.metadataRoot, "bundle.json"));
      await copyFileOrDirectory(path.join(bundleRoot, "manifest.json"), path.join(scopedInstall.metadataRoot, "manifest.json"));
      await copyFileOrDirectory(path.join(bundleRoot, "catalog.json"), path.join(scopedInstall.metadataRoot, "catalog.json"));
      const promptsDir = path.join(targetSourceDir, "prompts");

      if (await pathExists(promptsDir)) {
        await copyDirectory(promptsDir, path.join(scopedInstall.metadataRoot, "prompts"));
      }

      const installLock = await buildInstallLock({
        manifest,
        target,
        scope: scopedInstall.scope,
        source: buildInstallSource(bundleDir, bundleRoot, cleanupRoot),
        metadataRoot: scopedInstall.metadataRoot,
        skillsRoot: scopedInstall.skillsRoot,
        targetBundle,
        previousVersion
      });
      await writeJson(path.join(scopedInstall.metadataRoot, "install-lock.json"), installLock);

      return {
        manifest,
        target,
        scope: scopedInstall.scope,
        installDir: scopedInstall.skillsRoot,
        metadataDir: scopedInstall.metadataRoot,
        installLock,
        replaced: Boolean(installedPack),
        created: !skillsRootState.existed
      };
    }

    const defaultDestinationRoot = cleanupRoot ? path.join(path.resolve(bundleDir), "installed") : path.join(bundleRoot, "installed");
    const destinationRoot = path.resolve(options.dest ?? defaultDestinationRoot);
    const installDir = path.join(destinationRoot, manifest.name);
    const destinationLabel = target === "codex" ? "Codex destination" : "Install destination";

    await ensureWritableDirectory(destinationRoot, destinationLabel, "Create the directory, fix permissions, or choose a different --dest.");

    const installDirExisted = await pathExists(installDir);

    if (installDirExisted) {
      await removePath(installDir);
    }

    await copyDirectory(targetSourceDir, installDir);
    await copyFileOrDirectory(path.join(bundleRoot, "manifest.json"), path.join(installDir, "manifest.json"));
    await copyFileOrDirectory(path.join(bundleRoot, "catalog.json"), path.join(installDir, "catalog.json"));

    return {
      manifest,
      target,
      scope: "custom",
      installDir,
      replaced: installDirExisted,
      created: !installDirExisted
    };
  } finally {
    if (cleanupRoot) {
      await removePath(cleanupRoot);
    }
  }
}

export async function upgradeBundle(bundleDir, options = {}) {
  return installBundle(bundleDir, options);
}

export async function uninstallBundle(packName, options = {}) {
  assertString(packName, "packName");

  const target = options.target;

  if (!target || !SUPPORTED_TARGETS.has(target)) {
    throwActionableError(
      "PSM020",
      `Uninstall target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`,
      "Use --target claude-code with --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: packName }, options);

  if (!scopedInstall) {
    throwActionableError(
      "PSM020",
      "Uninstall currently requires --scope.",
      "Pass --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const bundlePath = path.join(scopedInstall.metadataRoot, "bundle.json");

  if (!(await pathExists(bundlePath))) {
    throwActionableError(
      "PSM023",
      `Missing installed bundle metadata: ${bundlePath}`,
      "Use list or doctor to confirm the pack name and install scope before uninstalling.",
      `packsmith list --target claude-code --scope ${scopedInstall.scope}`
    );
  }

  const bundle = await readJson(bundlePath);

  for (const skill of bundle.skills ?? []) {
    const skillDirName = path.basename(path.dirname(skill.path));
    await removePath(path.join(scopedInstall.skillsRoot, skillDirName));
  }

  await removePath(scopedInstall.metadataRoot);

  return {
    packName,
    target,
    scope: scopedInstall.scope,
    uninstallDir: scopedInstall.skillsRoot,
    metadataDir: scopedInstall.metadataRoot
  };
}

export async function inspectInstalledBundles(options = {}) {
  const target = options.target;

  if (!target || !SUPPORTED_TARGETS.has(target)) {
    throwActionableError(
      "PSM020",
      `List target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`,
      "Use --target claude-code with --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: "__placeholder__" }, options);

  if (!scopedInstall) {
    throwActionableError(
      "PSM020",
      "List currently requires --scope.",
      "Pass --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const installedPacks = await loadScopedInstalledPacks(scopedInstall);
  const installed = [];

  for (const { metadataDir, manifest, bundle, installLock } of installedPacks) {
    installed.push({
      name: manifest.name,
      version: manifest.version,
      lockedVersion: installLock?.lockedVersion ?? manifest.version,
      source: installLock?.source ?? null,
      target: bundle.target,
      scope: scopedInstall.scope,
      skillCount: Array.isArray(bundle.skills) ? bundle.skills.length : 0,
      promptCount: Array.isArray(bundle.prompts) ? bundle.prompts.length : 0,
      skillIds: Array.isArray(bundle.skills) ? bundle.skills.map((skill) => skill.id) : [],
      promptIds: Array.isArray(bundle.prompts) ? bundle.prompts.map((prompt) => prompt.id) : [],
      metadataDir,
      integrity: await inspectInstalledBundleIntegrity(
        {
          ...scopedInstall,
          metadataRoot: metadataDir
        },
        bundle,
        installLock
      )
    });
  }

  installed.sort((left, right) => left.name.localeCompare(right.name));

  return {
    target,
    scope: scopedInstall.scope,
    installed
  };
}

export async function inspectInstallTargets(options = {}) {
  const target = options.target;

  if (!target || !SUPPORTED_TARGETS.has(target)) {
    throwActionableError(
      "PSM020",
      `Doctor target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`,
      "Use --target claude-code with --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: "__placeholder__" }, options);

  if (!scopedInstall) {
    throwActionableError(
      "PSM020",
      "Doctor currently requires --scope.",
      "Pass --scope user or --scope project.",
      "packsmith doctor --target claude-code --scope user"
    );
  }

  const installed = await inspectInstalledBundles(options);
  const unmanagedSkills = await listUnmanagedSkillDirectories(scopedInstall, installed.installed);
  const metadataRoot = path.dirname(scopedInstall.metadataRoot);

  return {
    target,
    scope: scopedInstall.scope,
    skillsRoot: scopedInstall.skillsRoot,
    metadataRoot,
    pathChecks: {
      skillsRoot: await inspectDirectoryState(scopedInstall.skillsRoot, `Claude Code ${scopedInstall.scope} scope skills root`),
      metadataRoot: await inspectDirectoryState(metadataRoot, `Claude Code ${scopedInstall.scope} scope Packsmith metadata root`)
    },
    installed: installed.installed,
    unmanagedSkills
  };
}
