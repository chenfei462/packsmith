import path from "node:path";
import os from "node:os";
import { mkdtemp, readdir, readFile } from "node:fs/promises";

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

function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
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

function parseSkillFrontmatter(skillMarkdown, skillId) {
  const frontmatterMatch = skillMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!frontmatterMatch) {
    throw new Error(`Skill "${skillId}" must start with YAML frontmatter in SKILL.md.`);
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
    throw new Error(`Skill "${skillId}" frontmatter must include a non-empty name.`);
  }

  if (typeof frontmatter.description !== "string" || frontmatter.description.length === 0) {
    throw new Error(`Skill "${skillId}" frontmatter must include a non-empty description.`);
  }

  if (!SKILL_NAME_PATTERN.test(frontmatter.name)) {
    throw new Error(`Skill "${skillId}" frontmatter name must use lowercase letters, numbers, and hyphens.`);
  }

  return frontmatter;
}

function extractSkillBody(skillMarkdown) {
  return skillMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

async function loadManifest(packDir) {
  const manifestPath = path.join(packDir, "packsmith.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const manifest = await readJson(manifestPath);
  assertString(manifest.name, "manifest.name");
  assertString(manifest.description, "manifest.description");
  assertString(manifest.version, "manifest.version");
  assertArray(manifest.targets, "manifest.targets");
  assertArray(manifest.skills, "manifest.skills");

  for (const target of manifest.targets) {
    if (!SUPPORTED_TARGETS.has(target)) {
      throw new Error(`Unsupported target "${target}". Supported targets: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`);
    }
  }

  manifest.prompts ??= [];

  if (!Array.isArray(manifest.prompts)) {
    throw new Error("manifest.prompts must be an array when present.");
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
      throw new Error(`Missing skill directory for "${skill.id}": ${absoluteSkillDir}`);
    }

    if (!(await pathExists(skillEntryPath))) {
      throw new Error(`Skill "${skill.id}" must include SKILL.md: ${skillEntryPath}`);
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
      throw new Error(`Missing prompt file for "${prompt.id}": ${absolutePromptPath}`);
    }

    const existingPrompt = promptBasenames.get(promptBasename);

    if (existingPrompt && existingPrompt !== prompt.id) {
      throw new Error(`Duplicate prompt output basename "${promptBasename}" for prompts "${existingPrompt}" and "${prompt.id}".`);
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
      manifest: await readJson(manifestPath)
    });
  }

  return installed;
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
      groups: duplicateGroups.map((group) => ({
        assets: group.assets,
        repeatedChars: group.repeatedChars
      }))
    });
  }

  if (catalog.estimatedContextChars >= OVERSIZED_PACK_CONTEXT_THRESHOLD) {
    diagnostics.push({
      code: "oversized-pack",
      severity: "warning",
      message: `Estimated context ${catalog.estimatedContextChars} chars exceeds the ${OVERSIZED_PACK_CONTEXT_THRESHOLD}-char warning threshold.`
    });
  }

  return { diagnostics, duplicateGroups };
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveHomeDir(options = {}) {
  return path.resolve(options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? os.homedir());
}

function resolveWorkingDir(options = {}) {
  return path.resolve(options.cwd ?? process.cwd());
}

function resolveScopedInstallPaths(target, manifest, options = {}) {
  const scope = options.scope;

  if (!scope) {
    return null;
  }

  if (!SUPPORTED_INSTALL_SCOPES.has(scope)) {
    throw new Error(`Install scope must be one of: ${Array.from(SUPPORTED_INSTALL_SCOPES).join(", ")}.`);
  }

  if (target !== "claude-code") {
    throw new Error(`Scoped install is only supported for claude-code. Received target "${target}".`);
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

async function inspectInstalledBundleIntegrity(scopedInstall, bundle) {
  const missingSkills = [];
  const missingPrompts = [];

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

  return {
    ok: missingSkills.length === 0 && missingPrompts.length === 0,
    missingSkills,
    missingPrompts
  };
}

async function listUnmanagedSkillDirectories(scopedInstall, installedBundles) {
  if (!(await pathExists(scopedInstall.skillsRoot))) {
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
    throw new Error(`Strict validation failed: ${codes}.`);
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

  return {
    packDir: absolutePackDir,
    name: catalog.name,
    version: catalog.version,
    targets: catalog.targets,
    skillCount: catalog.skills.length,
    promptCount: catalog.prompts.length,
    estimatedContextChars: catalog.estimatedContextChars,
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
    throw new Error(`Expected either a built bundle (manifest.json) or a source pack (packsmith.json): ${absoluteInputDir}`);
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
      throw new Error(`Install target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`);
    }

    const targetSourceDir = path.join(bundleRoot, target);

    if (!(await pathExists(targetSourceDir))) {
      throw new Error(`Missing built target directory: ${targetSourceDir}`);
    }

    if (options.dest && options.scope) {
      throw new Error("Use either --dest or --scope for install, not both.");
    }

    const scopedInstall = resolveScopedInstallPaths(target, manifest, options);

    if (scopedInstall) {
      const targetBundle = await readJson(path.join(targetSourceDir, "bundle.json"));
      const installedPacks = await loadScopedInstalledPacks(scopedInstall);
      const installedPack = installedPacks.find(({ manifest: installedManifest }) => installedManifest.name === manifest.name);

      for (const skill of targetBundle.skills ?? []) {
        const skillDirName = path.basename(path.dirname(skill.path));
        const conflictingPack = installedPacks.find(({ manifest: installedManifest, bundle: installedBundle }) => {
          if (installedManifest.name === manifest.name) {
            return false;
          }

          return (installedBundle.skills ?? []).some((installedSkill) => path.basename(path.dirname(installedSkill.path)) === skillDirName);
        });

        if (conflictingPack) {
          throw new Error(`Claude Code skill "${skillDirName}" is already owned by pack "${conflictingPack.manifest.name}" in ${scopedInstall.scope} scope.`);
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

      return {
        manifest,
        target,
        scope: scopedInstall.scope,
        installDir: scopedInstall.skillsRoot,
        metadataDir: scopedInstall.metadataRoot
      };
    }

    const defaultDestinationRoot = cleanupRoot ? path.join(path.resolve(bundleDir), "installed") : path.join(bundleRoot, "installed");
    const destinationRoot = path.resolve(options.dest ?? defaultDestinationRoot);
    const installDir = path.join(destinationRoot, manifest.name);

    await copyDirectory(targetSourceDir, installDir);
    await copyFileOrDirectory(path.join(bundleRoot, "manifest.json"), path.join(installDir, "manifest.json"));
    await copyFileOrDirectory(path.join(bundleRoot, "catalog.json"), path.join(installDir, "catalog.json"));

    return {
      manifest,
      target,
      scope: "custom",
      installDir
    };
  } finally {
    if (cleanupRoot) {
      await removePath(cleanupRoot);
    }
  }
}

export async function uninstallBundle(packName, options = {}) {
  assertString(packName, "packName");

  const target = options.target;

  if (!target || !SUPPORTED_TARGETS.has(target)) {
    throw new Error(`Uninstall target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`);
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: packName }, options);

  if (!scopedInstall) {
    throw new Error("Uninstall currently requires --scope.");
  }

  const bundlePath = path.join(scopedInstall.metadataRoot, "bundle.json");

  if (!(await pathExists(bundlePath))) {
    throw new Error(`Missing installed bundle metadata: ${bundlePath}`);
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
    throw new Error(`List target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`);
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: "__placeholder__" }, options);

  if (!scopedInstall) {
    throw new Error("List currently requires --scope.");
  }

  const installedPacks = await loadScopedInstalledPacks(scopedInstall);
  const installed = [];

  for (const { metadataDir, manifest, bundle } of installedPacks) {
    installed.push({
      name: manifest.name,
      version: manifest.version,
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
        bundle
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
    throw new Error(`Doctor target must be one of: ${Array.from(SUPPORTED_TARGETS).join(", ")}.`);
  }

  const scopedInstall = resolveScopedInstallPaths(target, { name: "__placeholder__" }, options);

  if (!scopedInstall) {
    throw new Error("Doctor currently requires --scope.");
  }

  const installed = await inspectInstalledBundles(options);
  const unmanagedSkills = await listUnmanagedSkillDirectories(scopedInstall, installed.installed);

  return {
    target,
    scope: scopedInstall.scope,
    skillsRoot: scopedInstall.skillsRoot,
    metadataRoot: path.dirname(scopedInstall.metadataRoot),
    installed: installed.installed,
    unmanagedSkills
  };
}
