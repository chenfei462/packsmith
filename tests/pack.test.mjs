import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildPack, inspectInstalledBundles, inspectInstallTargets, inspectPack, installBundle, uninstallBundle, validatePack } from "../src/lib/pack.mjs";
import { createPacksmithTarball, installPacksmithTarball, inspectPackedRepo, runInstalledPacksmith } from "../scripts/npm-helpers.mjs";
import { verifyReleaseReadiness } from "../scripts/release-check.mjs";
import { buildVerificationSnapshot, renderReadmeVerificationBlock } from "../scripts/verification-status.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const examplePack = path.join(repoRoot, "examples", "research-launchpad");
const execFileAsync = promisify(execFile);

async function runCli(args, options = {}) {
  return execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env
    }
  });
}

async function existsInRepo(relativePath) {
  try {
    await stat(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function existsAt(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listExampleDistDirectories() {
  const exampleRoot = path.join(examplePack);
  const entries = await readdir(exampleRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && /^dist(?:-|$)/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function listExamplePackNames() {
  const examplesRoot = path.join(repoRoot, "examples");
  const entries = await readdir(examplesRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function buildSkillMarkdown(name, description, body) {
  return `---
name: ${name}
description: ${description}
---

${body}
`;
}

async function createTempPack({
  name = "temp-pack",
  targets = ["claude-code", "codex"],
  skills = [
    {
      id: "starter-skill",
      description: "Starter skill.",
      content: buildSkillMarkdown("starter-skill", "Starter skill.", "# Starter skill\n\nDefault content.")
    }
  ],
  prompts = [
    {
      id: "starter-prompt",
      description: "Starter prompt.",
      fileName: "starter-prompt.md",
      content: "# Starter prompt\n\nDefault prompt.\n"
    }
  ]
} = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-pack-"));
  const packDir = path.join(tempRoot, name);

  await mkdir(packDir, { recursive: true });
  await mkdir(path.join(packDir, "skills"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });

  for (const skill of skills) {
    const skillDir = path.join(packDir, "skills", skill.id);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), skill.content, "utf8");
  }

  for (const prompt of prompts) {
    await writeFile(path.join(packDir, "prompts", prompt.fileName), prompt.content, "utf8");
  }

  await writeFile(
    path.join(packDir, "packsmith.json"),
    JSON.stringify(
      {
        name,
        description: `${name} description.`,
        version: "0.1.0",
        targets,
        skills: skills.map((skill) => ({
          id: skill.id,
          path: `skills/${skill.id}`,
          description: skill.description
        })),
        prompts: prompts.map((prompt) => ({
          id: prompt.id,
          path: `prompts/${prompt.fileName}`,
          description: prompt.description
        }))
      },
      null,
      2
    ),
    "utf8"
  );

  return packDir;
}

async function buildExamplePackInTemp(label) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `packsmith-${label}-`));
  return buildPack(examplePack, tempRoot);
}

function assertActionableError(error, code, commandPattern) {
  assert.equal(error.code, code);
  assert.equal(typeof error.fix, "string");
  assert.ok(error.fix.length > 0);
  assert.equal(typeof error.command, "string");
  assert.match(error.command, commandPattern);
}

test("validatePack accepts the example pack", async () => {
  const result = await validatePack(examplePack);

  assert.equal(result.manifest.name, "research-launchpad");
  assert.equal(result.skillCount, 1);
  assert.equal(result.promptCount, 1);
  assert.deepEqual(result.diagnostics, []);
});

test("inspectPack reports context metadata", async () => {
  const result = await inspectPack(examplePack);

  assert.equal(result.name, "research-launchpad");
  assert.equal(result.skillCount, 1);
  assert.equal(result.promptCount, 1);
  assert.ok(result.estimatedContextChars > 0);
  assert.equal(result.duplicateContextChars, 0);
  assert.equal(result.duplicateContextRatio, 0);
  assert.equal(result.largestDuplicateGroup, null);
  assert.equal(result.skills[0].id, "github-demand");
  assert.equal(result.prompts[0].id, "launch");
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.duplicateGroups, []);
});

test("buildPack emits target bundles for the example pack", async () => {
  const result = await buildExamplePackInTemp("dist-test");
  const catalog = JSON.parse(await readFile(path.join(result.outputRoot, "catalog.json"), "utf8"));

  assert.ok(result.outputRoot.endsWith(path.join("research-launchpad")));
  assert.deepEqual(result.targetsBuilt, ["claude-code", "codex"]);
  assert.equal(catalog.skills[0].content, undefined);
  assert.equal(catalog.prompts[0].content, undefined);
});

test("validatePack rejects a skill without SKILL.md", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-"));
  const packDir = path.join(tempRoot, "broken-pack");

  await mkdir(path.join(packDir, "skills", "missing-entry"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await writeFile(
    path.join(packDir, "packsmith.json"),
    JSON.stringify(
      {
        name: "broken-pack",
        description: "Broken test pack.",
        version: "0.1.0",
        targets: ["claude-code"],
        skills: [
          {
            id: "missing-entry",
            path: "skills/missing-entry",
            description: "Broken skill."
          }
        ],
        prompts: [
          {
            id: "launch",
            path: "prompts/launch.md",
            description: "Prompt."
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(packDir, "prompts", "launch.md"), "Prompt", "utf8");

  await assert.rejects(validatePack(packDir), (error) => {
    assert.match(error.message, /must include SKILL\.md/);
    assertActionableError(error, "PSM006", /packsmith validate <pack-dir>/);
    return true;
  });
});

test("validatePack exposes stable actionable errors for common pack failures", async () => {
  const missingManifestRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-missing-manifest-"));
  await assert.rejects(
    validatePack(path.join(missingManifestRoot, "missing-pack")),
    (error) => {
      assertActionableError(error, "PSM001", /packsmith init <pack-dir>/);
      return true;
    }
  );

  const missingNamePack = await createTempPack({ name: "missing-name-pack" });
  await writeFile(
    path.join(missingNamePack, "packsmith.json"),
    JSON.stringify(
      {
        description: "Missing name.",
        version: "0.1.0",
        targets: ["claude-code"],
        skills: []
      },
      null,
      2
    ),
    "utf8"
  );
  await assert.rejects(validatePack(missingNamePack), (error) => {
    assertActionableError(error, "PSM002", /packsmith inspect <pack-dir>/);
    return true;
  });

  const unsupportedTargetPack = await createTempPack({
    name: "unsupported-target-pack",
    targets: ["unknown-runtime"]
  });
  await assert.rejects(validatePack(unsupportedTargetPack), (error) => {
    assertActionableError(error, "PSM003", /packsmith inspect <pack-dir>/);
    return true;
  });

  const duplicateSkillPack = await createTempPack({
    name: "duplicate-skill-pack",
    skills: [
      {
        id: "same-skill",
        description: "First skill.",
        content: buildSkillMarkdown("same-skill", "First skill.", "# First\n")
      },
      {
        id: "same-skill",
        description: "Second skill.",
        content: buildSkillMarkdown("same-skill", "Second skill.", "# Second\n")
      }
    ]
  });
  await assert.rejects(validatePack(duplicateSkillPack), (error) => {
    assertActionableError(error, "PSM004", /packsmith inspect <pack-dir>/);
    return true;
  });

  const missingSkillDirPack = await createTempPack({ name: "missing-skill-dir-pack" });
  await rm(path.join(missingSkillDirPack, "skills", "starter-skill"), { recursive: true, force: true });
  await assert.rejects(validatePack(missingSkillDirPack), (error) => {
    assertActionableError(error, "PSM005", /packsmith validate <pack-dir>/);
    return true;
  });

  const missingPromptPack = await createTempPack({ name: "missing-prompt-pack" });
  await rm(path.join(missingPromptPack, "prompts", "starter-prompt.md"), { force: true });
  await assert.rejects(validatePack(missingPromptPack), (error) => {
    assertActionableError(error, "PSM009", /packsmith validate <pack-dir>/);
    return true;
  });
});

test("validatePack rejects a skill without required frontmatter", async () => {
  const packDir = await createTempPack({
    name: "missing-frontmatter-pack",
    skills: [
      {
        id: "bad-skill",
        description: "Broken skill.",
        content: "# Bad skill\n\nNo frontmatter here.\n"
      }
    ]
  });

  await assert.rejects(validatePack(packDir), (error) => {
    assert.match(error.message, /must start with YAML frontmatter/);
    assertActionableError(error, "PSM007", /packsmith validate <pack-dir>/);
    return true;
  });
});

test("validatePack rejects a skill without frontmatter name and description", async () => {
  const packDir = await createTempPack({
    name: "missing-fields-pack",
    skills: [
      {
        id: "bad-skill",
        description: "Broken skill.",
        content: `---
name: bad-skill
---

# Bad skill
`
      }
    ]
  });

  await assert.rejects(validatePack(packDir), (error) => {
    assert.match(error.message, /frontmatter must include a non-empty description/);
    assertActionableError(error, "PSM007", /packsmith validate <pack-dir>/);
    return true;
  });
});

test("validatePack rejects a skill with invalid frontmatter name format", async () => {
  const packDir = await createTempPack({
    name: "invalid-name-pack",
    skills: [
      {
        id: "bad-skill",
        description: "Broken skill.",
        content: `---
name: Bad Skill
description: Invalid name format.
---

# Bad skill
`
      }
    ]
  });

  await assert.rejects(validatePack(packDir), (error) => {
    assert.match(error.message, /frontmatter name must use lowercase letters, numbers, and hyphens/);
    assertActionableError(error, "PSM008", /packsmith validate <pack-dir>/);
    return true;
  });
});

test("validatePack rejects prompt basename collisions that would overwrite on build", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-prompt-collision-"));
  const packDir = path.join(tempRoot, "prompt-collision-pack");

  await mkdir(path.join(packDir, "skills", "starter-skill"), { recursive: true });
  await mkdir(path.join(packDir, "prompts", "alpha"), { recursive: true });
  await mkdir(path.join(packDir, "prompts", "beta"), { recursive: true });
  await writeFile(
    path.join(packDir, "skills", "starter-skill", "SKILL.md"),
    buildSkillMarkdown("starter-skill", "Starter skill.", "# Starter skill\n\nDefault content."),
    "utf8"
  );
  await writeFile(path.join(packDir, "prompts", "alpha", "launch.md"), "# Prompt alpha\n", "utf8");
  await writeFile(path.join(packDir, "prompts", "beta", "launch.md"), "# Prompt beta\n", "utf8");
  await writeFile(
    path.join(packDir, "packsmith.json"),
    JSON.stringify(
      {
        name: "prompt-collision-pack",
        description: "Prompt collision pack.",
        version: "0.1.0",
        targets: ["claude-code", "codex"],
        skills: [
          {
            id: "starter-skill",
            path: "skills/starter-skill",
            description: "Starter skill."
          }
        ],
        prompts: [
          {
            id: "launch-alpha",
            path: "prompts/alpha/launch.md",
            description: "Prompt alpha."
          },
          {
            id: "launch-beta",
            path: "prompts/beta/launch.md",
            description: "Prompt beta."
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(validatePack(packDir), (error) => {
    assert.match(error.message, /Duplicate prompt output basename "launch\.md"/);
    assertActionableError(error, "PSM010", /packsmith inspect <pack-dir>/);
    return true;
  });
});

test("init command scaffolds a new pack that validates", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-init-"));
  const packDir = path.join(tempRoot, "fresh-pack");

  await runCli(["init", packDir]);

  const manifest = JSON.parse(await readFile(path.join(packDir, "packsmith.json"), "utf8"));

  assert.equal(manifest.name, "fresh-pack");

  const validated = await validatePack(packDir);
  assert.equal(validated.skillCount, 1);
  assert.equal(validated.promptCount, 1);
});

test("install command copies a built target bundle into a destination", async () => {
  const built = await buildExamplePackInTemp("install-test");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-"));
  const installRoot = path.join(tempRoot, "installed");

  await runCli(["install", built.outputRoot, "--target", "codex", "--dest", installRoot]);

  const agentsPath = path.join(installRoot, "research-launchpad", "AGENTS.md");
  const agentsContent = await readFile(agentsPath, "utf8");

  assert.match(agentsContent, /research-launchpad/i);
});

test("installBundle rejects a file at the destination root", async () => {
  const built = await buildExamplePackInTemp("install-file-dest");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-file-dest-"));
  const installRoot = path.join(tempRoot, "installed");

  await writeFile(installRoot, "not a directory", "utf8");

  await assert.rejects(
    installBundle(built.outputRoot, {
      target: "codex",
      dest: installRoot
    }),
    (error) => {
      assert.match(error.message, /must be a directory|writable destination/i);
      assertActionableError(error, "PSM021", /packsmith install <pack-or-built-dir> --target <name> --dest <dir>/);
      return true;
    }
  );
});

test("installBundle reports the exact Codex destination path when parent creation fails", async () => {
  const built = await buildExamplePackInTemp("install-blocked-dest-parent");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-blocked-dest-parent-"));
  const blockedParent = path.join(tempRoot, "blocked");
  const installRoot = path.join(blockedParent, "installed");

  await writeFile(blockedParent, "not a directory", "utf8");

  await assert.rejects(
    installBundle(built.outputRoot, {
      target: "codex",
      dest: installRoot
    }),
    (error) => {
      assert.match(error.message, /Codex destination/i);
      assert.match(error.message, /not writable or cannot be created/i);
      assert.match(error.message, new RegExp(installRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(error.message, /choose a different --dest/i);
      assertActionableError(error, "PSM021", /packsmith install <pack-or-built-dir> --target <name> --dest <dir>/);
      return true;
    }
  );
});

test("installBundle rejects invalid install scopes", async () => {
  const built = await buildExamplePackInTemp("install-invalid-scope");

  await assert.rejects(
    installBundle(built.outputRoot, {
      target: "claude-code",
      scope: "team"
    }),
    (error) => {
      assert.match(error.message, /Install scope must be one of: project, user\./);
      assertActionableError(error, "PSM020", /packsmith doctor --target claude-code --scope user/);
      return true;
    }
  );
});

test("installBundle reports replacement when reinstalling the same bundle", async () => {
  const built = await buildExamplePackInTemp("install-replace");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-replace-"));
  const installRoot = path.join(tempRoot, "installed");

  const first = await installBundle(built.outputRoot, {
    target: "codex",
    dest: installRoot
  });
  const second = await installBundle(built.outputRoot, {
    target: "codex",
    dest: installRoot
  });

  assert.equal(first.replaced, false);
  assert.equal(second.replaced, true);
});

test("install command reports updates when reinstalling the same bundle", async () => {
  const built = await buildExamplePackInTemp("install-cli-replace");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-cli-replace-"));
  const installRoot = path.join(tempRoot, "installed");

  await runCli(["install", built.outputRoot, "--target", "codex", "--dest", installRoot]);
  const { stdout } = await runCli(["install", built.outputRoot, "--target", "codex", "--dest", installRoot]);

  assert.match(stdout, /Updated "research-launchpad" target "codex"/i);
  assert.match(stdout, /Next:/i);
});

test("list command explains how to add the first Claude Code bundle", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-empty-list-"));

  const { stdout } = await runCli(["list", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /No installed bundles found/i);
  assert.match(stdout, /packsmith install/i);
});

test("doctor command explains how to add the first Claude Code bundle", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-empty-doctor-"));

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /No installed bundles found/i);
  assert.match(stdout, /packsmith install/i);
  assert.match(stdout, /Skills root:/i);
});

test("inspectInstallTargets reports missing Claude Code install roots without creating them", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-missing-roots-"));

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.pathChecks.skillsRoot.exists, false);
  assert.equal(result.pathChecks.skillsRoot.writable, false);
  assert.equal(result.pathChecks.skillsRoot.code, "PSM024");
  assert.equal(typeof result.pathChecks.skillsRoot.fix, "string");
  assert.match(result.pathChecks.skillsRoot.command, /packsmith install <pack-or-built-dir> --target claude-code --scope user/);
  assert.equal(result.pathChecks.metadataRoot.exists, false);
  assert.equal(result.pathChecks.metadataRoot.writable, false);
  assert.equal(result.pathChecks.metadataRoot.code, "PSM024");
  assert.equal(typeof result.pathChecks.metadataRoot.fix, "string");
  assert.match(result.pathChecks.metadataRoot.command, /packsmith install <pack-or-built-dir> --target claude-code --scope user/);
  assert.equal(await existsAt(path.join(tempHome, ".claude")), false);
});

test("buildPack normalizes bundle paths to forward slashes", async () => {
  const built = await buildExamplePackInTemp("posix-paths");
  const bundle = JSON.parse(await readFile(path.join(built.outputRoot, "codex", "bundle.json"), "utf8"));

  assert.ok(bundle.skills.every((skill) => skill.path.includes("/")));
  assert.ok(bundle.prompts.every((prompt) => prompt.path.includes("/")));
  assert.ok(bundle.skills.every((skill) => !skill.path.includes("\\")));
  assert.ok(bundle.prompts.every((prompt) => !prompt.path.includes("\\")));
});

test("packaged tarball installs a working packsmith CLI entrypoint", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-packaged-cli-"));
  const packOutputDir = path.join(tempRoot, "pack-output");
  const prefixDir = path.join(tempRoot, "prefix");
  const workspace = path.join(tempRoot, "workspace");

  await mkdir(packOutputDir, { recursive: true });
  await mkdir(prefixDir, { recursive: true });
  await mkdir(workspace, { recursive: true });

  const tarball = await createPacksmithTarball(repoRoot, packOutputDir);
  const { binPath } = await installPacksmithTarball(tarball.tarballPath, prefixDir, { cwd: tempRoot });
  const { stdout } = await runInstalledPacksmith(binPath, ["--help"], { cwd: workspace });

  assert.match(stdout, /^Packsmith/m);
  assert.equal(await existsAt(binPath), true);
});

test("installBundle can install directly from a source pack directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-source-"));
  const installRoot = path.join(tempRoot, "installed");

  const result = await installBundle(examplePack, {
    target: "codex",
    dest: installRoot
  });

  const agentsPath = path.join(installRoot, "research-launchpad", "AGENTS.md");
  const manifestPath = path.join(installRoot, "research-launchpad", "manifest.json");

  assert.equal(result.target, "codex");
  assert.ok(await readFile(agentsPath, "utf8"));
  assert.ok(await readFile(manifestPath, "utf8"));
});

test("inspectPack flags duplicated context across skills and prompts", async () => {
  const repeatedContent = `# Shared workflow

Use the same workflow in every asset.
`;
  const packDir = await createTempPack({
    name: "duplicate-pack",
    targets: ["codex"],
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", repeatedContent)
      },
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", repeatedContent)
      }
    ],
    prompts: [
      {
        id: "launch",
        description: "Launch prompt.",
        fileName: "launch.md",
        content: repeatedContent
      }
    ]
  });

  const result = await inspectPack(packDir);

  assert.equal(result.duplicateGroups.length, 1);
  assert.deepEqual(result.duplicateGroups[0].assets.sort(), ["prompt:launch", "skill:alpha-skill", "skill:beta-skill"]);
  assert.ok(result.duplicateGroups[0].repeatedChars > 0);
  assert.equal(result.duplicateContextChars, result.duplicateGroups[0].repeatedChars * (result.duplicateGroups[0].assets.length - 1));
  assert.equal(result.largestDuplicateGroup.assets.length, 3);
  assert.equal(result.largestDuplicateGroup.repeatedChars, result.duplicateGroups[0].repeatedChars);
  assert.equal(result.diagnostics[0].code, "duplicate-content");
  assert.equal(typeof result.diagnostics[0].fix, "string");
  assert.match(result.diagnostics[0].command, /packsmith inspect <pack-dir>/);
});

test("inspectPack surfaces duplicate context summary for a highly repeated pack", async () => {
  const repeatedContent = `# Shared workflow

Use the same workflow in every asset.
`;
  const packDir = await createTempPack({
    name: "high-duplicate-pack",
    targets: ["claude-code"],
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", repeatedContent)
      },
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", repeatedContent)
      },
      {
        id: "gamma-skill",
        description: "Gamma skill.",
        content: buildSkillMarkdown("gamma-skill", "Gamma skill.", repeatedContent)
      }
    ],
    prompts: [
      {
        id: "launch",
        description: "Launch prompt.",
        fileName: "launch.md",
        content: repeatedContent
      }
    ]
  });

  const result = await inspectPack(packDir);

  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.largestDuplicateGroup.assets.length, 4);
  assert.ok(result.duplicateContextChars > 0);
  assert.ok(result.duplicateContextRatio > 0);
});

test("inspectPack flags oversized packs", async () => {
  const packDir = await createTempPack({
    name: "oversized-pack",
    skills: [
      {
        id: "big-skill",
        description: "Large skill.",
        content: buildSkillMarkdown("big-skill", "Large skill.", `# Big skill\n\n${"x".repeat(9000)}`)
      }
    ]
  });

  const result = await inspectPack(packDir);

  assert.equal(result.diagnostics[0].code, "oversized-pack");
  assert.equal(result.diagnostics[0].severity, "warning");
  assert.equal(result.diagnostics[0].thresholdChars, 8000);
  assert.equal(result.diagnostics[0].overageChars, result.estimatedContextChars - 8000);
  assert.equal(typeof result.diagnostics[0].fix, "string");
  assert.match(result.diagnostics[0].command, /packsmith inspect <pack-dir>/);
});

test("inspect command prints a human-readable summary by default", async () => {
  const { stdout } = await runCli(["inspect", examplePack]);

  assert.match(stdout, /Packsmith Inspect/);
  assert.match(stdout, /Estimated context:/);
  assert.match(stdout, /Duplicate context: none/);
  assert.match(stdout, /Largest duplicate group: none/);
  assert.match(stdout, /Diagnostics:\r?\n- none/);
});

test("inspect command supports --json output", async () => {
  const { stdout } = await runCli(["inspect", examplePack, "--json"]);
  const result = JSON.parse(stdout);

  assert.equal(result.name, "research-launchpad");
  assert.equal(result.promptCount, 1);
});

test("inspect json includes actionable diagnostics", async () => {
  const packDir = await createTempPack({
    name: "inspect-actionable-pack",
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", "# Shared\n\nRepeated body.")
      },
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", "# Shared\n\nRepeated body.")
      }
    ],
    prompts: []
  });

  const { stdout } = await runCli(["inspect", packDir, "--json"]);
  const result = JSON.parse(stdout);

  assert.equal(result.diagnostics[0].code, "duplicate-content");
  assert.equal(typeof result.diagnostics[0].fix, "string");
  assert.match(result.diagnostics[0].command, /packsmith inspect <pack-dir>/);
});

test("validatePack strict mode rejects diagnostics", async () => {
  const repeatedContent = `# Shared workflow

Use the same workflow in every asset.
`;
  const packDir = await createTempPack({
    name: "strict-duplicate-pack",
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", repeatedContent)
      },
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", repeatedContent)
      }
    ],
    prompts: [
      {
        id: "launch",
        description: "Launch prompt.",
        fileName: "launch.md",
        content: repeatedContent
      }
    ]
  });

  await assert.rejects(validatePack(packDir, { strict: true }), (error) => {
    assert.match(error.message, /Strict validation failed: duplicate-content/);
    assertActionableError(error, "PSM011", /packsmith inspect <pack-dir>/);
    return true;
  });
});

test("validate command supports --strict", async () => {
  const repeatedContent = `# Shared workflow

Use the same workflow in every asset.
`;
  const packDir = await createTempPack({
    name: "strict-cli-pack",
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", repeatedContent)
      },
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", repeatedContent)
      }
    ],
    prompts: [
      {
        id: "launch",
        description: "Launch prompt.",
        fileName: "launch.md",
        content: repeatedContent
      }
    ]
  });

  await assert.rejects(runCli(["validate", packDir, "--strict"]), (error) => {
    assert.match(error.stderr, /Error \[PSM011\]: Strict validation failed: duplicate-content/);
    assert.match(error.stderr, /Fix:/);
    assert.match(error.stderr, /Run: packsmith inspect <pack-dir>/);
    return true;
  });
});

test("installBundle installs Claude Code skills into user scope directories", async () => {
  const built = await buildExamplePackInTemp("claude-user-scope");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-"));

  const result = await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const skillEntryPath = path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md");
  const manifestPath = path.join(tempHome, ".claude", "packsmith", "research-launchpad", "manifest.json");

  assert.equal(result.scope, "user");
  assert.ok(result.installDir.endsWith(path.join(".claude", "skills")));
  assert.ok(await readFile(skillEntryPath, "utf8"));
  assert.ok(await readFile(manifestPath, "utf8"));
});

test("installBundle records source, locked version, and installed files for lifecycle checks", async () => {
  const built = await buildExamplePackInTemp("claude-user-lifecycle");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-lifecycle-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const lock = JSON.parse(await readFile(path.join(tempHome, ".claude", "packsmith", "research-launchpad", "install-lock.json"), "utf8"));

  assert.equal(lock.name, "research-launchpad");
  assert.equal(lock.version, "0.1.0");
  assert.equal(lock.lockedVersion, "0.1.0");
  assert.equal(lock.target, "claude-code");
  assert.equal(lock.scope, "user");
  assert.equal(lock.source.type, "built-bundle");
  assert.equal(lock.source.path, built.outputRoot);
  assert.match(lock.installedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(lock.files.some((file) => file.kind === "skill" && file.id === "github-demand" && file.path.endsWith(path.join("skills", "github-demand", "SKILL.md")) && /^sha256-[A-Za-z0-9+/=]+$/.test(file.integrity)));
  assert.ok(lock.files.some((file) => file.kind === "prompt" && file.id === "launch" && file.path.endsWith(path.join("packsmith", "research-launchpad", "prompts", "launch.md")) && /^sha256-[A-Za-z0-9+/=]+$/.test(file.integrity)));
});

test("installBundle installs Claude Code skills into project scope directories", async () => {
  const built = await buildExamplePackInTemp("claude-project-scope");
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-project-"));

  const result = await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "project",
    cwd: projectRoot
  });

  const skillEntryPath = path.join(projectRoot, ".claude", "skills", "github-demand", "SKILL.md");
  const metadataReadmePath = path.join(projectRoot, ".claude", "packsmith", "research-launchpad", "README.md");

  assert.equal(result.scope, "project");
  assert.ok(result.installDir.endsWith(path.join(".claude", "skills")));
  assert.ok(await readFile(skillEntryPath, "utf8"));
  assert.ok(await readFile(metadataReadmePath, "utf8"));
});

test("install command supports Claude Code user scope", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-"));

  const { stdout } = await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const skillEntryPath = path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md");

  assert.match(stdout, /user scope/i);
  assert.ok(await readFile(skillEntryPath, "utf8"));
});

test("install command can install directly from a source pack directory", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-source-"));

  const { stdout } = await runCli(["install", examplePack, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const skillEntryPath = path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md");

  assert.match(stdout, /user scope/i);
  assert.ok(await readFile(skillEntryPath, "utf8"));
});

test("upgrade command updates an existing Claude Code scoped install", async () => {
  const packDir = await createTempPack({ name: "upgrade-pack" });
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-upgrade-"));

  await runCli(["install", packDir, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const manifestPath = path.join(packDir, "packsmith.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "0.2.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const { stdout } = await runCli(["upgrade", packDir, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });
  const lock = JSON.parse(await readFile(path.join(tempHome, ".claude", "packsmith", "upgrade-pack", "install-lock.json"), "utf8"));

  assert.match(stdout, /Upgraded "upgrade-pack" target "claude-code" using user scope/i);
  assert.equal(lock.lockedVersion, "0.2.0");
  assert.equal(lock.previousVersion, "0.1.0");
});

test("uninstallBundle removes Claude Code user scope installs using metadata", async () => {
  const built = await buildExamplePackInTemp("claude-user-uninstall");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-uninstall-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const result = await uninstallBundle("research-launchpad", {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });
  const skillEntryPath = path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md");
  const metadataDir = path.join(tempHome, ".claude", "packsmith", "research-launchpad");

  assert.equal(result.scope, "user");
  assert.equal(await existsAt(skillEntryPath), false);
  assert.equal(await existsAt(metadataDir), false);
});

test("uninstallBundle removes Claude Code project scope installs using metadata", async () => {
  const built = await buildExamplePackInTemp("claude-project-uninstall");
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-project-uninstall-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "project",
    cwd: projectRoot
  });

  const result = await uninstallBundle("research-launchpad", {
    target: "claude-code",
    scope: "project",
    cwd: projectRoot
  });
  const skillEntryPath = path.join(projectRoot, ".claude", "skills", "github-demand", "SKILL.md");
  const metadataDir = path.join(projectRoot, ".claude", "packsmith", "research-launchpad");

  assert.equal(result.scope, "project");
  assert.equal(await existsAt(skillEntryPath), false);
  assert.equal(await existsAt(metadataDir), false);
});

test("uninstall command supports Claude Code user scope", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-uninstall");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-uninstall-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const { stdout } = await runCli(["uninstall", "research-launchpad", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });
  const skillEntryPath = path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md");

  assert.match(stdout, /uninstalled "research-launchpad" target "claude-code" using user scope/i);
  assert.equal(await existsAt(skillEntryPath), false);
});

test("inspectInstalledBundles lists Claude Code user scope installs", async () => {
  const built = await buildExamplePackInTemp("claude-user-list");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-list-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const result = await inspectInstalledBundles({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.scope, "user");
  assert.equal(result.installed.length, 1);
  assert.equal(result.installed[0].name, "research-launchpad");
  assert.equal(result.installed[0].target, "claude-code");
  assert.equal(result.installed[0].skillCount, 1);
  assert.equal(result.installed[0].promptCount, 1);
  assert.deepEqual(result.installed[0].skillIds, ["github-demand"]);
  assert.deepEqual(result.installed[0].promptIds, ["launch"]);
});

test("inspectInstalledBundles lists Claude Code project scope installs", async () => {
  const built = await buildExamplePackInTemp("claude-project-list");
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-project-list-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "project",
    cwd: projectRoot
  });

  const result = await inspectInstalledBundles({
    target: "claude-code",
    scope: "project",
    cwd: projectRoot
  });

  assert.equal(result.scope, "project");
  assert.equal(result.installed.length, 1);
  assert.equal(result.installed[0].name, "research-launchpad");
});

test("list command supports Claude Code user scope", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-list");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-list-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const { stdout } = await runCli(["list", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /Installed Packsmith bundles/);
  assert.match(stdout, /research-launchpad/);
  assert.match(stdout, /skills: github-demand/);
  assert.match(stdout, /prompts: launch/);
});

test("list command reports integrity issues in human-readable output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-list-integrity");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-list-integrity-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  await rm(path.join(tempHome, ".claude", "skills", "github-demand"), { recursive: true, force: true });

  const { stdout } = await runCli(["list", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /integrity: broken/i);
  assert.match(stdout, /missing skills: github-demand/i);
});

test("list command supports json output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-list-json");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-list-json-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const { stdout } = await runCli(["list", "--target", "claude-code", "--scope", "user", "--json"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });
  const result = JSON.parse(stdout);

  assert.equal(result.installed.length, 1);
  assert.equal(result.installed[0].name, "research-launchpad");
  assert.deepEqual(result.installed[0].skillIds, ["github-demand"]);
  assert.deepEqual(result.installed[0].promptIds, ["launch"]);
});

test("inspectInstallTargets reports Claude Code user scope paths and installed bundles", async () => {
  const built = await buildExamplePackInTemp("claude-user-doctor");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.target, "claude-code");
  assert.equal(result.scope, "user");
  assert.equal(result.installed.length, 1);
  assert.ok(result.skillsRoot.endsWith(path.join(".claude", "skills")));
  assert.ok(result.metadataRoot.endsWith(path.join(".claude", "packsmith")));
  assert.deepEqual(result.installed[0].skillIds, ["github-demand"]);
});

test("inspectInstallTargets reports missing installed Claude Code skill directories", async () => {
  const built = await buildExamplePackInTemp("claude-user-doctor-missing-skill");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-missing-skill-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  await rm(path.join(tempHome, ".claude", "skills", "github-demand"), { recursive: true, force: true });

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.installed[0].integrity.ok, false);
  assert.equal(result.installed[0].integrity.missingSkills.length, 1);
  assert.equal(result.installed[0].integrity.missingSkills[0], "github-demand");
  assert.equal(result.installed[0].integrity.code, "PSM023");
  assert.equal(typeof result.installed[0].integrity.fix, "string");
  assert.match(result.installed[0].integrity.command, /packsmith install <pack-or-built-dir> --target claude-code --scope user/);
});

test("inspectInstallTargets reports missing mirrored prompt files", async () => {
  const built = await buildExamplePackInTemp("claude-user-doctor-missing-prompt");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-missing-prompt-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  await rm(path.join(tempHome, ".claude", "packsmith", "research-launchpad", "prompts", "launch.md"), { force: true });

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.installed[0].integrity.ok, false);
  assert.equal(result.installed[0].integrity.missingPrompts.length, 1);
  assert.equal(result.installed[0].integrity.missingPrompts[0], "launch");
  assert.equal(result.installed[0].integrity.code, "PSM023");
  assert.equal(typeof result.installed[0].integrity.fix, "string");
  assert.match(result.installed[0].integrity.command, /packsmith install <pack-or-built-dir> --target claude-code --scope user/);
});

test("inspectInstallTargets reports content drift against the install lock", async () => {
  const built = await buildExamplePackInTemp("claude-user-doctor-drift");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-drift-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });
  await writeFile(path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md"), "---\nname: github-demand\ndescription: Changed.\n---\n\n# Drifted\n", "utf8");

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.installed[0].integrity.ok, false);
  assert.equal(result.installed[0].integrity.code, "PSM025");
  assert.deepEqual(result.installed[0].integrity.driftedSkills, ["github-demand"]);
  assert.equal(result.installed[0].integrity.driftedPrompts.length, 0);
  assert.match(result.installed[0].integrity.fix, /upgrade|reinstall/i);
  assert.match(result.installed[0].integrity.command, /packsmith upgrade <pack-or-built-dir> --target claude-code --scope user/);
});

test("inspectInstallTargets reports unmanaged Claude Code skill directories", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-doctor-unmanaged-"));
  const manualSkillDir = path.join(tempHome, ".claude", "skills", "manual-skill");

  await mkdir(manualSkillDir, { recursive: true });
  await writeFile(path.join(manualSkillDir, "SKILL.md"), buildSkillMarkdown("manual-skill", "Manual skill.", "# Manual skill\n"), "utf8");

  const result = await inspectInstallTargets({
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.deepEqual(result.unmanagedSkills, ["manual-skill"]);
});

test("doctor command supports human-readable output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-doctor");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-doctor-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /Packsmith Doctor/);
  assert.match(stdout, /research-launchpad/);
  assert.match(stdout, /Skills root:/);
  assert.match(stdout, /skills: github-demand/);
  assert.match(stdout, /prompts: launch/);
});

test("doctor command reports integrity issues in human-readable output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-doctor-integrity");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-doctor-integrity-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  await rm(path.join(tempHome, ".claude", "skills", "github-demand"), { recursive: true, force: true });

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /integrity: broken/i);
  assert.match(stdout, /missing skills: github-demand/i);
  assert.match(stdout, /Fix:/i);
  assert.match(stdout, /Run: packsmith install <pack-or-built-dir> --target claude-code --scope user/i);
});

test("doctor command reports drift in human-readable output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-doctor-drift");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-doctor-drift-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });
  await writeFile(path.join(tempHome, ".claude", "skills", "github-demand", "SKILL.md"), "---\nname: github-demand\ndescription: Changed.\n---\n\n# Drifted\n", "utf8");

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /integrity: drifted/i);
  assert.match(stdout, /drifted skills: github-demand/i);
  assert.match(stdout, /Run: packsmith upgrade <pack-or-built-dir> --target claude-code --scope user/i);
});

test("doctor command reports unmanaged skill directories in human-readable output", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-doctor-unmanaged-"));
  const manualSkillDir = path.join(tempHome, ".claude", "skills", "manual-skill");

  await mkdir(manualSkillDir, { recursive: true });
  await writeFile(path.join(manualSkillDir, "SKILL.md"), buildSkillMarkdown("manual-skill", "Manual skill.", "# Manual skill\n"), "utf8");

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  assert.match(stdout, /unmanaged skills: manual-skill/i);
});

test("doctor command supports json output", async () => {
  const built = await buildExamplePackInTemp("claude-user-cli-doctor-json");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-cli-doctor-json-"));

  await runCli(["install", built.outputRoot, "--target", "claude-code", "--scope", "user"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });

  const { stdout } = await runCli(["doctor", "--target", "claude-code", "--scope", "user", "--json"], {
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome
    }
  });
  const result = JSON.parse(stdout);

  assert.equal(result.target, "claude-code");
  assert.equal(result.installed.length, 1);
  assert.deepEqual(result.installed[0].skillIds, ["github-demand"]);
  assert.deepEqual(result.installed[0].promptIds, ["launch"]);
  assert.equal(result.pathChecks.skillsRoot.code, null);
  assert.equal(result.pathChecks.skillsRoot.command, null);
  assert.equal(result.installed[0].integrity.code, null);
  assert.equal(result.installed[0].integrity.command, null);
});

test("uninstallBundle rejects unsupported uninstall targets", async () => {
  await assert.rejects(
    uninstallBundle("research-launchpad", {
      target: "codex",
      scope: "project",
      cwd: repoRoot
    }),
    (error) => {
      assert.match(error.message, /only supported for claude-code/);
      assertActionableError(error, "PSM020", /packsmith doctor --target claude-code --scope user/);
      return true;
    }
  );
});

test("installBundle rejects scoped install for unsupported targets", async () => {
  const built = await buildExamplePackInTemp("codex-scope-reject");

  await assert.rejects(
    installBundle(built.outputRoot, {
      target: "codex",
      scope: "project",
      cwd: repoRoot
    }),
    (error) => {
      assert.match(error.message, /only supported for claude-code/);
      assertActionableError(error, "PSM020", /packsmith doctor --target claude-code --scope user/);
      return true;
    }
  );
});

test("installBundle rejects mixing dest and scope", async () => {
  const built = await buildExamplePackInTemp("mixed-install-options");

  await assert.rejects(
    installBundle(built.outputRoot, {
      target: "claude-code",
      dest: path.join(repoRoot, "temp-installed"),
      scope: "user"
    }),
    (error) => {
      assert.match(error.message, /either --dest or --scope/);
      assertActionableError(error, "PSM020", /packsmith install <pack-or-built-dir> --target <name> --dest <dir>/);
      return true;
    }
  );
});

test("installBundle rejects Claude Code scope collisions from another pack", async () => {
  const firstPack = await createTempPack({
    name: "first-pack",
    targets: ["claude-code"],
    skills: [
      {
        id: "shared-skill",
        description: "Shared skill from first pack.",
        content: buildSkillMarkdown("shared-skill", "Shared skill from first pack.", "# Shared skill\n\nFirst pack.")
      }
    ]
  });
  const secondPack = await createTempPack({
    name: "second-pack",
    targets: ["claude-code"],
    skills: [
      {
        id: "shared-skill",
        description: "Shared skill from second pack.",
        content: buildSkillMarkdown("shared-skill", "Shared skill from second pack.", "# Shared skill\n\nSecond pack.")
      }
    ]
  });
  const firstBuilt = await buildPack(firstPack, "dist");
  const secondBuilt = await buildPack(secondPack, "dist");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-collision-"));

  await installBundle(firstBuilt.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  await assert.rejects(
    installBundle(secondBuilt.outputRoot, {
      target: "claude-code",
      scope: "user",
      homeDir: tempHome
    }),
    (error) => {
      assert.match(error.message, /already owned by pack "first-pack"/);
      assertActionableError(error, "PSM022", /packsmith list --target claude-code --scope user/);
      return true;
    }
  );
});

test("installBundle allows reinstalling the same Claude Code pack", async () => {
  const built = await buildExamplePackInTemp("claude-user-reinstall");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-reinstall-"));

  await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const result = await installBundle(built.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  assert.equal(result.scope, "user");
});

test("installBundle cleans up removed skills and prompts when reinstalling the same pack", async () => {
  const firstPack = await createTempPack({
    name: "mutable-pack",
    targets: ["claude-code"],
    skills: [
      {
        id: "alpha-skill",
        description: "Alpha skill.",
        content: buildSkillMarkdown("alpha-skill", "Alpha skill.", "# Alpha skill\n\nFirst version.")
      }
    ],
    prompts: [
      {
        id: "alpha-prompt",
        description: "Alpha prompt.",
        fileName: "alpha.md",
        content: "# Alpha prompt\n"
      }
    ]
  });
  const secondPack = await createTempPack({
    name: "mutable-pack",
    targets: ["claude-code"],
    skills: [
      {
        id: "beta-skill",
        description: "Beta skill.",
        content: buildSkillMarkdown("beta-skill", "Beta skill.", "# Beta skill\n\nSecond version.")
      }
    ],
    prompts: [
      {
        id: "beta-prompt",
        description: "Beta prompt.",
        fileName: "beta.md",
        content: "# Beta prompt\n"
      }
    ]
  });
  const firstBuilt = await buildPack(firstPack, "dist");
  const secondBuilt = await buildPack(secondPack, "dist");
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-mutable-"));

  await installBundle(firstBuilt.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });
  await installBundle(secondBuilt.outputRoot, {
    target: "claude-code",
    scope: "user",
    homeDir: tempHome
  });

  const alphaSkillPath = path.join(tempHome, ".claude", "skills", "alpha-skill");
  const betaSkillPath = path.join(tempHome, ".claude", "skills", "beta-skill");
  const alphaPromptPath = path.join(tempHome, ".claude", "packsmith", "mutable-pack", "prompts", "alpha.md");
  const betaPromptPath = path.join(tempHome, ".claude", "packsmith", "mutable-pack", "prompts", "beta.md");

  assert.equal(await existsAt(alphaSkillPath), false);
  assert.equal(await existsAt(alphaPromptPath), false);
  assert.equal(await existsAt(betaSkillPath), true);
  assert.equal(await existsAt(betaPromptPath), true);
});

test("uninstallBundle exposes actionable metadata errors", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "packsmith-home-missing-metadata-"));

  await assert.rejects(
    uninstallBundle("missing-pack", {
      target: "claude-code",
      scope: "user",
      homeDir: tempHome
    }),
    (error) => {
      assert.match(error.message, /Missing installed bundle metadata/);
      assertActionableError(error, "PSM023", /packsmith list --target claude-code --scope user/);
      return true;
    }
  );
});

test("smoke script runs in temp space without polluting the repo root", async () => {
  const beforeClaude = await existsInRepo(".claude");
  const beforeTempPack = await existsInRepo("temp-smoke-pack");
  const beforeTempInstalled = await existsInRepo("temp-installed");
  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "smoke.mjs")], {
    cwd: repoRoot
  });

  assert.match(stdout, /Strictly validated pack "temp-smoke-pack"/);
  assert.match(stdout, /Verified Codex install artifact:/);
  assert.match(stdout, /^Packsmith/m);
  assert.match(stdout, /Verified packaged CLI entrypoint:/);
  assert.equal(await existsInRepo(".claude"), beforeClaude);
  assert.equal(await existsInRepo("temp-smoke-pack"), beforeTempPack);
  assert.equal(await existsInRepo("temp-installed"), beforeTempInstalled);
});

test("examples check script validates and builds every example pack without polluting the repo root", async () => {
  const beforeExamplesDist = await existsInRepo("examples/research-launchpad/dist-examples-check");
  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "examples-check.mjs")], {
    cwd: repoRoot
  });

  assert.match(stdout, /Validated example "research-launchpad"/);
  assert.match(stdout, /Built example "research-launchpad"/);
  assert.match(stdout, /Verified install artifacts for "research-launchpad"/);
  assert.match(stdout, /Validated example "incident-triage"/);
  assert.match(stdout, /Built example "incident-triage"/);
  assert.match(stdout, /Verified install artifacts for "incident-triage"/);
  assert.match(stdout, /Validated example "maintainer-handoff"/);
  assert.match(stdout, /Built example "maintainer-handoff"/);
  assert.match(stdout, /Verified install artifacts for "maintainer-handoff"/);
  assert.equal(await existsInRepo("examples/research-launchpad/dist-examples-check"), beforeExamplesDist);
});

test("example packs document copyable template structure", async () => {
  for (const exampleName of ["research-launchpad", "incident-triage", "maintainer-handoff"]) {
    const exampleDir = path.join(repoRoot, "examples", exampleName);
    const manifest = JSON.parse(await readFile(path.join(exampleDir, "packsmith.json"), "utf8"));
    const skillContent = await readFile(path.join(exampleDir, manifest.skills[0].path, "SKILL.md"), "utf8");
    const promptContent = await readFile(path.join(exampleDir, manifest.prompts[0].path), "utf8");
    const combined = `${skillContent}\n${promptContent}`;

    assert.match(combined, /When to use/i, `${exampleName} should explain when to use the template`);
    assert.match(combined, /Inputs/i, `${exampleName} should name expected inputs`);
    assert.match(combined, /Output format/i, `${exampleName} should define output format`);
    assert.match(combined, /Naming convention/i, `${exampleName} should document naming convention`);
    assert.match(combined, /Copyable structure/i, `${exampleName} should show copyable structure`);
    assert.match(combined, new RegExp(`skills/${manifest.skills[0].id}/SKILL\\.md`), `${exampleName} should show skill path`);
    assert.match(combined, new RegExp(manifest.prompts[0].path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${exampleName} should show prompt path`);
  }
});

test("eval script runs the recommended repository evaluation flow", async () => {
  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "eval.mjs")], {
    cwd: repoRoot
  });

  assert.match(stdout, /== smoke:example ==/);
  assert.match(stdout, /== examples:check ==/);
  assert.match(stdout, /== release:check ==/);
  assert.match(stdout, /Packsmith evaluation summary/);
  assert.match(stdout, /example packs verified: 3/);
  assert.match(stdout, /npm package published: false/);
  assert.match(stdout, /verification snapshot:/);
});

test("verification snapshot files match the current repository state", async () => {
  await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "eval.mjs")], {
    cwd: repoRoot
  });

  const expectedSnapshot = await buildVerificationSnapshot(repoRoot);
  const actualJson = JSON.parse(await readFile(path.join(repoRoot, "docs", "verification.json"), "utf8"));
  const actualMarkdown = await readFile(path.join(repoRoot, "docs", "verification.md"), "utf8");

  assert.deepEqual(actualJson, expectedSnapshot);
  assert.match(actualMarkdown, /# Verification Snapshot/);
  assert.match(actualMarkdown, /recommended eval command: `npm run eval`/);
  assert.match(actualMarkdown, /example packs verified by gate: 3/);
  assert.match(actualMarkdown, /toolchain: Node/);
  assert.match(actualMarkdown, /npm pack artifact:/);
  assert.match(actualMarkdown, /npm pack shasum:/);
  assert.match(actualMarkdown, /npm pack integrity:/);
  assert.match(actualMarkdown, /source CLI path via npm run eval/);
  assert.match(actualMarkdown, /Codex AGENTS\.md bridge artifact via smoke:example/);
  assert.match(actualMarkdown, /packaged CLI entrypoint via tarball install/);
  assert.match(actualMarkdown, /release-check gate for README, publish metadata, and workflows/);
});

test("verification snapshot exposes tarball provenance and a README evidence card", async () => {
  const snapshot = await buildVerificationSnapshot(repoRoot);
  const verificationMarkdown = await readFile(path.join(repoRoot, "docs", "verification.md"), "utf8");
  const verificationCard = await readFile(path.join(repoRoot, "docs", "assets", "packsmith-verification-card.svg"), "utf8");
  const demoCard = await readFile(path.join(repoRoot, "docs", "assets", "packsmith-demo-terminal.svg"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(snapshot.publishFootprint.filename, /packsmith-0\.1\.0\.tgz$/);
  assert.match(snapshot.publishFootprint.shasum, /^[0-9a-f]{40}$/);
  assert.match(snapshot.publishFootprint.integrity, /^sha512-/);
  assert.match(verificationMarkdown, new RegExp(snapshot.publishFootprint.shasum));
  assert.match(readme, /packsmith-verification-card\.svg/);
  assert.match(verificationCard, /Packsmith verification card/i);
  assert.match(verificationCard, /npm run eval/);
  assert.match(verificationCard, new RegExp(snapshot.publishFootprint.shasum.slice(0, 12)));
  assert.match(demoCard, /machine-generated cli evidence/i);
  assert.match(demoCard, /\$ packsmith inspect examples\/research-launchpad/);
  assert.match(demoCard, /Strictly validated pack "research-launchpad"/);
  assert.match(demoCard, new RegExp(snapshot.publishFootprint.shasum.slice(0, 12)));
});

test("README verification block switches install guidance for a published npm package", () => {
  const block = renderReadmeVerificationBlock({
    packageName: "@chenfei462/packsmith",
    version: "0.1.0",
    recommendedCommand: "npm run eval",
    examplePackCount: 3,
    npmPublished: true,
    npmVersion: "0.1.0",
    publishFootprint: {
      entryCount: 6
    }
  });

  assert.match(block, /npm published: true \(0\.1\.0\)/);
  assert.match(block, /preferred install: npm install -g @chenfei462\/packsmith/i);
  assert.match(block, /global install: published/i);
  assert.match(block, /claude code scoped install: packsmith install .* --target claude-code --scope user/i);
  assert.match(block, /codex bridge: packsmith install .* --target codex --dest/i);
  assert.doesNotMatch(block, /future path/i);
});

test("README verification block keeps global install future-only before npm publication", () => {
  const block = renderReadmeVerificationBlock({
    packageName: "@chenfei462/packsmith",
    version: "0.1.0",
    recommendedCommand: "npm run eval",
    examplePackCount: 3,
    npmPublished: false,
    npmVersion: null,
    publishFootprint: {
      entryCount: 6
    }
  });

  assert.match(block, /npm published: false/);
  assert.match(block, /preferred install: source eval \(npm run eval\)/i);
  assert.match(block, /global install: future path until npm publication/i);
});

test("examples check script ignores non-pack directories under examples", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-examples-ignore-"));
  const examplesRoot = path.join(tempRoot, "examples");
  const packDir = path.join(examplesRoot, "alpha-pack");
  const noteDir = path.join(examplesRoot, "notes");

  await mkdir(path.join(packDir, "skills", "alpha-skill"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await mkdir(noteDir, { recursive: true });
  await writeFile(
    path.join(packDir, "packsmith.json"),
    JSON.stringify(
      {
        name: "alpha-pack",
        description: "Alpha example pack.",
        version: "0.1.0",
        targets: ["claude-code"],
        skills: [
          {
            id: "alpha-skill",
            path: "skills/alpha-skill",
            description: "Alpha skill."
          }
        ],
        prompts: [
          {
            id: "alpha-prompt",
            path: "prompts/alpha.md",
            description: "Alpha prompt."
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(packDir, "skills", "alpha-skill", "SKILL.md"),
    buildSkillMarkdown("alpha-skill", "Alpha skill.", "# Alpha skill\n"),
    "utf8"
  );
  await writeFile(path.join(packDir, "prompts", "alpha.md"), "# Alpha prompt\n", "utf8");
  await writeFile(path.join(noteDir, "README.md"), "not a pack\n", "utf8");

  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "examples-check.mjs")], {
    cwd: tempRoot,
    env: {
      ...process.env,
      PACKSMITH_EXAMPLES_ROOT: examplesRoot
    }
  });

  assert.match(stdout, /Validated example "alpha-pack"/);
  assert.doesNotMatch(stdout, /notes/);
  assert.match(stdout, /Examples check: OK \(1 example pack\(s\)\)/);
});

test("example-pack tests do not rely on persistent dist directories in the repo", async () => {
  const distDirs = await listExampleDistDirectories();

  assert.deepEqual(distDirs, ["dist"]);
});

test("repo ships at least three example packs", async () => {
  const examplePackNames = await listExamplePackNames();

  assert.deepEqual(examplePackNames, ["incident-triage", "maintainer-handoff", "research-launchpad"]);
});

test("verifyReleaseReadiness accepts the repo's release metadata", async () => {
  const result = await verifyReleaseReadiness(repoRoot);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.checks.some((check) => check.code === "trusted-publish-workflow"));
  assert.ok(result.checks.some((check) => check.code === "npm-pack-contents"));
  assert.ok(result.checks.some((check) => check.code === "verification-card-fresh"));
  assert.ok(result.checks.some((check) => check.code === "demo-terminal-card-fresh"));
  assert.ok(result.checks.some((check) => check.code === "readme-demand-research-links"));
  assert.ok(result.checks.some((check) => check.code === "readme-no-mojibake"));
  assert.ok(result.checks.some((check) => check.code === "post-publish-verification-workflow"));
  assert.ok(result.checks.some((check) => check.code === "release-playbook-present"));
  assert.ok(result.checks.some((check) => check.code === "launch-kit-present"));
  assert.ok(result.checks.some((check) => check.code === "changelog-version-entry"));
});

test("inspectPackedRepo reports the real current tarball footprint", async () => {
  const packed = await inspectPackedRepo(repoRoot);

  assert.equal(packed.entryCount, 6);
  assert.ok(packed.size > 0);
  assert.deepEqual([...packed.files].sort(), ["LICENSE", "README.md", "package.json", "src/cli.mjs", "src/lib/fs-utils.mjs", "src/lib/pack.mjs"].sort());
});

test("verifyReleaseReadiness rejects a repo whose npm pack dry-run includes unexpected docs files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-packlist-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");
  const srcDir = path.join(tempRoot, "src");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE", "docs"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(tempRoot, "README.md"), await readFile(path.join(repoRoot, "README.md"), "utf8"), "utf8");
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(srcDir, "index.mjs"), "export const demo = true;\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /npm pack|unexpected publish|docs\//i.test(error)));
});

test("verifyReleaseReadiness rejects missing trusted publishing workflow", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-check-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");

  await mkdir(workflowDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(tempRoot, "README.md"), "# Demo\n", "utf8");
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm publish
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /trusted publishing/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without bilingual anchors", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-readme-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(tempRoot, "README.md"), "# Demo\n\nEnglish only.\n", "utf8");
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /bilingual/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without bilingual first-run quickstart sections", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-quickstart-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

## 中文

### 这是什么

中文部分。
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /quickstart/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without top-of-file machine signals", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-top-signals-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");
  const srcDir = path.join(tempRoot, "src");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@chenfei462/packsmith",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/chenfei462/packsmith.git"
        },
        homepage: "https://github.com/chenfei462/packsmith#readme",
        bugs: {
          url: "https://github.com/chenfei462/packsmith/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### First run

\`npm run eval\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

### Current limits

- claude-code
- codex
- --dest
- remote pack

### Target support matrix

- claude-code
- codex
- install --scope
- install --dest
- list / doctor / uninstall

### Publish footprint

\`npm pack --dry-run\`

## 中文

### 快速上手

\`npm run eval\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验

### 当前边界

- claude-code
- codex
- 显式 \`--dest\`
- 远程 pack

### 目标支持矩阵

- claude-code
- codex
- install --scope
- 显式 \`--dest\`
- list / doctor / uninstall

### 发布体积

\`npm pack --dry-run\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(path.join(srcDir, "index.mjs"), "export const demo = true;\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /top release signals/i.test(error)));
});

test("verifyReleaseReadiness rejects a README whose verification summary drifts from the generated snapshot", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-summary-drift-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");
  const examplesDir = path.join(tempRoot, "examples", "demo-pack");
  const srcDir = path.join(tempRoot, "src");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await mkdir(path.join(examplesDir, "skills", "demo-skill"), { recursive: true });
  await mkdir(path.join(examplesDir, "prompts"), { recursive: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@chenfei462/packsmith",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/chenfei462/packsmith.git"
        },
        homepage: "https://github.com/chenfei462/packsmith#readme",
        bugs: {
          url: "https://github.com/chenfei462/packsmith/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        },
        engines: {
          node: ">=20"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[![CI](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml)
[![Publish](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml)
\`Node >=20\` \`Zero runtime deps\` \`Targets: claude-code + codex\`
[Verification Snapshot](./docs/verification.md)
Current verification: \`npm run eval\` • example packs: 99 • npm published: true • npm pack: 99 files / 99.9 KB
当前验证：\`npm run eval\` • 示例 packs：99 • npm 已发布：true • npm pack：99 个文件 / 99.9 KB

[中文](#中文) | [English](#english)

## English

### First run

\`npm run eval\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

### Current limits

- claude-code
- codex
- --dest
- remote pack

### Target support matrix

- claude-code
- codex
- install --scope
- install --dest
- list / doctor / uninstall

### Publish footprint

\`npm pack --dry-run\`

## 中文

### 快速上手

\`npm run eval\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验

### 当前边界

- claude-code
- codex
- 显式 \`--dest\`
- 远程 pack

### 目标支持矩阵

- claude-code
- codex
- install --scope
- 显式 \`--dest\`
- list / doctor / uninstall

### 发布体积

\`npm pack --dry-run\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(path.join(srcDir, "index.mjs"), "export const demo = true;\n", "utf8");
  await writeFile(
    path.join(examplesDir, "packsmith.json"),
    JSON.stringify(
      {
        name: "demo-pack",
        description: "Demo pack.",
        version: "0.1.0",
        targets: ["claude-code", "codex"],
        skills: [
          {
            id: "demo-skill",
            path: "skills/demo-skill",
            description: "Demo skill."
          }
        ],
        prompts: [
          {
            id: "demo-prompt",
            path: "prompts/demo.md",
            description: "Demo prompt."
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(examplesDir, "skills", "demo-skill", "SKILL.md"),
    buildSkillMarkdown("demo-skill", "Demo skill.", "# Demo skill\n"),
    "utf8"
  );
  await writeFile(path.join(examplesDir, "prompts", "demo.md"), "# Demo prompt\n", "utf8");
  await writeFile(
    path.join(tempRoot, "docs", "verification.json"),
    JSON.stringify(
      {
        packageName: "@chenfei462/packsmith",
        version: "0.1.0",
        recommendedCommand: "npm run eval",
        nodeRequirement: ">=20",
        zeroRuntimeDependencies: true,
        examplePackCount: 1,
        examplePackNames: ["demo-pack"],
        npmPublished: false,
        npmVersion: null,
        publishFootprint: {
          entryCount: 3,
          sizeBytes: 1000,
          sizeLabel: "1.0 KB",
          files: ["LICENSE", "README.md", "package.json"]
        },
        proofPoints: ["demo"]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(tempRoot, "docs", "verification.md"), "# Verification Snapshot\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run eval
      - uses: actions/upload-artifact@v4
        with:
          name: verification-snapshot
          path: |
            docs/verification.json
            docs/verification.md
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /verification summary/i.test(error)));
});

test("verifyReleaseReadiness rejects a README that treats npm global install as currently available when unpublished", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-unpublished-install-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");
  const srcDir = path.join(tempRoot, "src");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@chenfei462/packsmith",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/chenfei462/packsmith.git"
        },
        homepage: "https://github.com/chenfei462/packsmith#readme",
        bugs: {
          url: "https://github.com/chenfei462/packsmith/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[![CI](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml)
[![Publish](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml)
\`Node >=20\` \`Zero runtime deps\` \`Targets: claude-code + codex\`

[中文](#中文) | [English](#english)

## English

### First run

\`npm run eval\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

### Current limits

- claude-code
- codex
- --dest
- remote pack

### Target support matrix

- claude-code
- codex
- install --scope
- install --dest
- list / doctor / uninstall

### Publish footprint

\`npm pack --dry-run\`

### Install

\`npm install -g @chenfei462/packsmith\`

## 中文

### 快速上手

\`npm run eval\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验

### 当前边界

- claude-code
- codex
- 显式 \`--dest\`
- 远程 pack

### 目标支持矩阵

- claude-code
- codex
- install --scope
- 显式 \`--dest\`
- list / doctor / uninstall

### 发布体积

\`npm pack --dry-run\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(path.join(srcDir, "index.mjs"), "export const demo = true;\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /future until publication/i.test(error)));
});

test("verifyReleaseReadiness rejects a repo without a code of conduct", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-coc-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

## 中文

### 这是什么

中文部分。

### 快速上手

\`npm run smoke:example\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /CODE_OF_CONDUCT\.md/i.test(error)));
});

test("verifyReleaseReadiness rejects a repo without a security policy", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-security-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

## 中文

### 这是什么

中文部分。

### 快速上手

\`npm run smoke:example\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /SECURITY\.md/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without a bilingual example-pack showcase", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-examples-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

## 中文

### 这是什么

中文部分。

### 快速上手

\`npm run smoke:example\`
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /example-pack showcase/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without a bilingual manual-copy comparison", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-manual-copy-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

## 中文

### 这是什么
中文部分。
### 快速上手
\`npm run smoke:example\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /copying folders by hand|手动复制文件夹/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without a bilingual current-limits section", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-current-limits-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

## 中文

### 这是什么
中文部分。
### 快速上手
\`npm run smoke:example\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /current limits|当前边界|runtime and distribution boundaries/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without a bilingual target support matrix", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-support-matrix-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run smoke:example\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

### Current limits

- claude-code
- codex
- --dest
- remote pack

## 中文

### 这是什么
中文部分。
### 快速上手
\`npm run smoke:example\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验

### 当前边界

- claude-code
- codex
- 显式 \`--dest\`
- 远程 pack
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /support matrix|支持矩阵|runtime capability/i.test(error)));
});

test("verifyReleaseReadiness rejects a README without a bilingual publish-footprint section", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-publish-footprint-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### Target support matrix

- claude-code
- codex
- install --scope
- install --dest
- list / doctor / uninstall

### First run

\`npm run smoke:example\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

### Why not copy folders by hand

- track installs
- detect drift
- strict validation

### Current limits

- claude-code
- codex
- --dest
- remote pack

## 中文

### 这是什么
中文部分。

### 目标支持矩阵

- claude-code
- codex
- install --scope
- 显式 \`--dest\`
- list / doctor / uninstall

### 快速上手
\`npm run smoke:example\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff

### 为什么不要手动复制文件夹

- 安装记录
- 检测漂移
- 严格校验

### 当前边界

- claude-code
- codex
- 显式 \`--dest\`
- 远程 pack
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await mkdir(path.join(tempRoot, "src"), { recursive: true });
  await writeFile(path.join(tempRoot, "src", "index.mjs"), "export const demo = true;\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm run examples:check
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /publish footprint|发布体积|npm pack --dry-run|dry-run evidence/i.test(error)));
});

test("verifyReleaseReadiness rejects a publish workflow without eval", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-release-examples-workflow-"));
  const workflowDir = path.join(tempRoot, ".github", "workflows");
  const docsAssetsDir = path.join(tempRoot, "docs", "assets");

  await mkdir(workflowDir, { recursive: true });
  await mkdir(docsAssetsDir, { recursive: true });
  await writeFile(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "@scope/demo",
        version: "0.1.0",
        license: "MIT",
        repository: {
          type: "git",
          url: "git+https://github.com/example/demo.git"
        },
        homepage: "https://github.com/example/demo#readme",
        bugs: {
          url: "https://github.com/example/demo/issues"
        },
        files: ["src", "README.md", "LICENSE"],
        publishConfig: {
          access: "public"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempRoot, "README.md"),
    `# Demo

[中文](#中文) | [English](#english)

## English

### What it is

English section.

### First run

\`npm run eval\`

### Example packs

- research-launchpad
- incident-triage
- maintainer-handoff

## 中文

### 这是什么

中文部分。

### 快速上手

\`npm run eval\`

### 示例 packs

- research-launchpad
- incident-triage
- maintainer-handoff
`,
    "utf8"
  );
  await writeFile(path.join(tempRoot, "LICENSE"), "MIT\n", "utf8");
  await writeFile(path.join(tempRoot, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  await writeFile(path.join(tempRoot, "SECURITY.md"), "# Security\n", "utf8");
  await writeFile(path.join(tempRoot, ".npmignore"), "tests/\n", "utf8");
  await writeFile(path.join(tempRoot, "docs", "runtime-assumptions.md"), "# Runtime assumptions\n", "utf8");
  await writeFile(path.join(docsAssetsDir, "packsmith-hero.svg"), "<svg></svg>\n", "utf8");
  await writeFile(
    path.join(workflowDir, "publish.yml"),
    `name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: https://registry.npmjs.org
      - run: npm test
      - run: npm publish --provenance --access public
`,
    "utf8"
  );

  const result = await verifyReleaseReadiness(tempRoot);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /npm run eval|verification snapshot artifact/i.test(error)));
});

test("package.json prepublishOnly runs eval and release:check before publish", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.match(packageJson.scripts.prepublishOnly, /npm run eval/);
  assert.match(packageJson.scripts.prepublishOnly, /npm run release:check/);
  assert.equal(packageJson.scripts.eval, "node scripts/eval.mjs");
});

test("package.json exposes verification:sync as a single script entrypoint", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.equal(packageJson.scripts["verification:sync"], "node scripts/verification-status.mjs sync");
  assert.doesNotMatch(packageJson.scripts["verification:sync"], /&&/);
});

test("post-publish verification workflow opens a proof refresh PR", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "post-publish-verification.yml"), "utf8");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\["Publish"\]/);
  assert.match(workflow, /npm run verification:sync/);
  assert.match(workflow, /peter-evans\/create-pull-request@v/);
  assert.match(workflow, /README\.md/);
  assert.match(workflow, /docs\/verification\.json/);
  assert.match(workflow, /docs\/verification\.md/);
});

test("launch documentation ships release playbook, launch kit, changelog, and release template", async () => {
  const changelog = await readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  const playbook = await readFile(path.join(repoRoot, "docs", "release-playbook.md"), "utf8");
  const launchKit = await readFile(path.join(repoRoot, "docs", "launch-kit.md"), "utf8");
  const releaseTemplate = await readFile(path.join(repoRoot, ".github", "release.yml"), "utf8");

  assert.match(changelog, /## 0\.1\.0/);
  assert.match(playbook, /v0\.1\.0/);
  assert.match(playbook, /node --test tests\/pack\.test\.mjs/);
  assert.match(playbook, /node scripts\/eval\.mjs/);
  assert.match(playbook, /npm trusted publishing/i);
  assert.match(playbook, /post-publish verification refresh/i);
  assert.match(launchKit, /GitHub Release body/i);
  assert.match(launchKit, /npm page positioning/i);
  assert.match(launchKit, /Community announcement/i);
  assert.match(launchKit, /60-90 Second Demo/);
  assert.match(launchKit, /Issue seed/i);
  assert.match(releaseTemplate, /changelog:/);
  assert.match(releaseTemplate, /categories:/);
});

test("README market-demand claims link to in-repo research evidence", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /4,526/);
  assert.match(readme, /133k/);
  assert.match(readme, /May 13, 2026/);
  assert.match(readme, /See \[GitHub demand research\]\(\.\/docs\/github-demand-2026-05\.md\) for source links and issue context\./);
  assert.match(readme, /\[GitHub demand research\]\(\.\/docs\/github-demand-2026-05\.md\)/);
});

test("README shows copyable example pack structure", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(readme, /Copy this structure/i);
  assert.match(readme, /examples\/research-launchpad\/packsmith\.json/);
  assert.match(readme, /skills\/github-demand\/SKILL\.md/);
  assert.match(readme, /prompts\/launch\.md/);
  assert.match(readme, /examples\/incident-triage/);
  assert.match(readme, /examples\/maintainer-handoff/);
});

test("README avoids common mojibake patterns in bilingual trust-critical sections", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.doesNotMatch(readme, /\[涓枃\]\(#涓枃\)/);
  assert.doesNotMatch(readme, /褰撳墠楠岃瘉/);
  assert.doesNotMatch(readme, /### 蹇€熶笂鎵?/);
  assert.doesNotMatch(readme, /### 绀轰緥 packs/);
  assert.doesNotMatch(readme, /### 褰撳墠杈圭晫/);
});

test("release:check script reports success for the repo", async () => {
  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "release-check.mjs")], {
    cwd: repoRoot
  });

  assert.match(stdout, /Release readiness: OK/);
});
