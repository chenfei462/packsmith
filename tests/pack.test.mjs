import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { auditInstalledPacks, buildPack, inspectPack, installBundle, installPack, listInstalledPacks, previewInstallPlan, validatePack, validatePolicy } from "../src/lib/pack.mjs";
import { editDistance, findTyposquattingMatches } from "../src/lib/typosquatting.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const examplePack = path.join(repoRoot, "examples", "research-launchpad");
const execFileAsync = promisify(execFile);
const npmCliPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

async function createIsolatedEnv(prefix) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    tempRoot,
    homeDir: path.join(tempRoot, "home"),
    stateDir: path.join(tempRoot, "state"),
    env: {
      ...process.env,
      PACKSMITH_HOME: path.join(tempRoot, "state"),
      PACKSMITH_TEST_HOME: path.join(tempRoot, "home"),
      NO_COLOR: "1"
    }
  };
}
const canonicalRepositoryHostPath = "github.com/chenfei462/packsmith";
const forbiddenRepositoryReferences = [/github\.com\/packsmith\/packsmith/g, /repo:packsmith\/packsmith/g];
const releaseFacingFiles = [
  "package.json",
  "README.md",
  path.join("src", "cli.mjs"),
  path.join("scripts", "generate-official-packs.mjs"),
  path.join("registry", "catalog.json"),
  path.join("docs", "registry-and-adapters.md"),
  path.join("docs", "registry-submission-guide.md"),
  path.join("docs", "mass-market-optimization.md"),
  path.join("docs", "signing-design.md"),
  path.join("docs", "site", "generate.mjs"),
  path.join(".github", "workflows", "link-check.yml")
];

async function runCli(args, options = {}) {
  const cwd = typeof options === "string" ? options : options.cwd ?? repoRoot;
  const env = typeof options === "string" ? process.env : { ...process.env, ...options.env };

  return execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), ...args], { cwd, env });
}

async function writePackManifest(packDir, manifest) {
  await writeFile(path.join(packDir, "packsmith.json"), JSON.stringify(manifest, null, 2), "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function releaseFacingPackageFiles() {
  const officialPackDirs = await readdir(path.join(repoRoot, "official-packs"), { withFileTypes: true });
  const officialManifests = officialPackDirs
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("official-packs", entry.name, "packsmith.json"));

  return [...releaseFacingFiles, ...officialManifests];
}

async function writePack(packDir, overrides = {}) {
  const name = overrides.name ?? path.basename(packDir);
  const skillId = overrides.skillId ?? "review";
  const promptId = overrides.promptId ?? "launch";

  await mkdir(path.join(packDir, "skills", skillId), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await writeFile(
    path.join(packDir, "skills", skillId, "SKILL.md"),
    overrides.skillText ??
      `---
name: ${skillId}
description: Review changes when the user asks for risk analysis.
---

# ${skillId}

Use this skill when the user asks for code review, risk analysis, or missing tests.

Return:

- findings
- risk
- recommended next step
`,
    "utf8"
  );
  await writeFile(path.join(packDir, "prompts", `${promptId}.md`), overrides.promptText ?? "Review the current change.", "utf8");
  await writePackManifest(packDir, {
    name,
    description: overrides.description ?? "Focused code review pack for tests.",
    version: overrides.version ?? "0.1.0",
    targets: overrides.targets ?? ["claude-code", "codex"],
    permissions: overrides.permissions ?? {
      shell: "optional",
      filesystem: "required",
      network: "none",
      browser: "none"
    },
    skills: [
      {
        id: skillId,
        path: `skills/${skillId}`,
        description: "Review changes when the user asks for risk analysis."
      }
    ],
    prompts: [
      {
        id: promptId,
        path: `prompts/${promptId}.md`,
        description: "Prompt for launching a focused review."
      }
    ]
  });
}

async function writeBuiltBundle(bundleDir, manifestOverrides = {}) {
  const manifest = {
    name: "built-pack",
    description: "Built bundle used by install tests.",
    version: "0.1.0",
    targets: ["codex"],
    permissions: {
      shell: "none",
      filesystem: "required",
      network: "none",
      browser: "none"
    },
    skills: [],
    prompts: [],
    ...manifestOverrides
  };

  await mkdir(path.join(bundleDir, "codex"), { recursive: true });
  await writeFile(path.join(bundleDir, "codex", "AGENTS.md"), "# Built Pack\n", "utf8");
  await writeFile(path.join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(path.join(bundleDir, "catalog.json"), JSON.stringify({ name: manifest.name }, null, 2), "utf8");
}

async function writeRegistry(catalogPath, entries) {
  await mkdir(path.dirname(catalogPath), { recursive: true });
  const normalizedEntries = entries.map((entry) => ({
    category: "code-quality",
    license: "MIT",
    riskLevel: "low",
    estimatedContextSize: 1200,
    usageExample: `packsmith install ${entry.id ?? "example-pack"}`,
    ...entry
  }));

  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-05-23T00:00:00.000Z",
        packs: normalizedEntries
      },
      null,
      2
    ),
    "utf8"
  );
}

async function listFiles(dirPath, rootDir = dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath, rootDir)));
    } else {
      files.push(path.relative(rootDir, entryPath));
    }
  }

  return files.sort();
}

async function hashDirectoryForTest(dirPath) {
  const hash = createHash("sha256");

  for (const relativePath of await listFiles(dirPath)) {
    const content = await readFile(path.join(dirPath, relativePath));
    hash.update(relativePath.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return `sha256-${hash.digest("hex")}`;
}

async function withJsonServer(routes, callback) {
  const server = createServer((request, response) => {
    const body = routes[request.url];

    if (!body) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("validatePack accepts the example pack", async () => {
  const result = await validatePack(examplePack);

  assert.equal(result.manifest.name, "research-launchpad");
  assert.equal(result.skillCount, 1);
  assert.equal(result.promptCount, 1);
});

test("inspectPack reports context metadata", async () => {
  const result = await inspectPack(examplePack);

  assert.equal(result.name, "research-launchpad");
  assert.equal(result.targetCount, 2);
  assert.equal(result.skillCount, 1);
  assert.equal(result.promptCount, 1);
  assert.ok(result.estimatedContextChars > 0);
  assert.equal(result.skills[0].id, "github-demand");
});

test("inspectPack estimates context from every skill file and prompt", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-inspect-"));
  const packDir = path.join(tempRoot, "context-pack");
  const skillDir = path.join(packDir, "skills", "deep-skill");
  const promptDir = path.join(packDir, "prompts");
  const skillEntry = "Skill entry text.";
  const skillGuide = "Additional skill guidance.";
  const promptText = "Prompt context text.";

  await mkdir(skillDir, { recursive: true });
  await mkdir(promptDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), skillEntry, "utf8");
  await writeFile(path.join(skillDir, "guide.md"), skillGuide, "utf8");
  await writeFile(path.join(promptDir, "launch.md"), promptText, "utf8");
  await writePackManifest(packDir, {
    name: "context-pack",
    description: "Context accounting test pack.",
    version: "0.1.0",
    targets: ["claude-code"],
    skills: [
      {
        id: "deep-skill",
        path: "skills/deep-skill",
        description: "Skill with more than one file."
      }
    ],
    prompts: [
      {
        id: "launch",
        path: "prompts/launch.md",
        description: "Prompt."
      }
    ]
  });

  const result = await inspectPack(packDir);

  assert.equal(result.estimatedContextChars, skillEntry.length + skillGuide.length + promptText.length);
  assert.equal(result.skills[0].fileCount, 2);
});

test("buildPack emits target bundles for the example pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-dist-"));
  const result = await buildPack(examplePack, path.join(tempRoot, "dist"));

  assert.ok(result.outputRoot.endsWith(path.join("dist", "research-launchpad")));
  assert.deepEqual(result.targetsBuilt, ["claude-code", "codex"]);
});

test("buildPack removes target bundles that are no longer declared", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-prune-targets-"));
  const packDir = path.join(tempRoot, "target-prune-pack");
  const outDir = path.join(tempRoot, "dist");

  await writePack(packDir, { name: "target-prune-pack", targets: ["claude-code", "codex"] });

  const firstBuild = await buildPack(packDir, outDir);
  const staleTargetDir = path.join(firstBuild.outputRoot, "codex");
  await stat(path.join(staleTargetDir, "AGENTS.md"));

  const manifest = await readJson(path.join(packDir, "packsmith.json"));
  manifest.targets = ["claude-code"];
  await writePackManifest(packDir, manifest);

  const secondBuild = await buildPack(packDir, outDir);

  assert.deepEqual(secondBuild.targetsBuilt, ["claude-code"]);
  await assert.rejects(stat(staleTargetDir));
});

test("buildPack rejects output paths that would overwrite the source pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-source-guard-"));
  const packDir = path.join(tempRoot, "guarded-pack");

  await writePack(packDir, { name: "guarded-pack", targets: ["codex"] });

  await assert.rejects(buildPack(packDir, tempRoot), /output directory.*source pack/i);
  await stat(path.join(packDir, "packsmith.json"));
  await stat(path.join(packDir, "skills", "review", "SKILL.md"));
});

test("buildPack allows sibling output directories with similar prefixes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-prefix-"));
  const packDir = path.join(tempRoot, "prefix-pack");
  const outDir = path.join(tempRoot, "prefix-pack-output");

  await writePack(packDir, { name: "prefix-pack", targets: ["codex"] });

  const result = await buildPack(packDir, outDir);

  assert.equal(result.outputRoot, path.join(outDir, "prefix-pack"));
  await stat(path.join(result.outputRoot, "codex", "AGENTS.md"));
});

test("buildPack rejects manifest names that would escape the output directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-name-escape-"));
  const packDir = path.join(tempRoot, "source-pack");
  const outDir = path.join(tempRoot, "dist");

  await writePack(packDir, { name: "../escape-pack", targets: ["codex"] });

  await assert.rejects(buildPack(packDir, outDir), /manifest\.name/);
  await assert.rejects(stat(path.join(tempRoot, "escape-pack", "manifest.json")));
});

test("validatePack rejects skill and prompt paths that escape the pack directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-path-escape-"));
  const packDir = path.join(tempRoot, "escape-pack");
  const outsideSkillDir = path.join(tempRoot, "outside-skill");
  const outsidePromptPath = path.join(tempRoot, "outside-prompt.md");

  await mkdir(path.join(packDir, "skills"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await mkdir(outsideSkillDir, { recursive: true });
  await writeFile(path.join(outsideSkillDir, "SKILL.md"), "Outside skill.", "utf8");
  await writeFile(outsidePromptPath, "Outside prompt.", "utf8");
  await writePackManifest(packDir, {
    name: "escape-pack",
    description: "Path traversal test pack.",
    version: "0.1.0",
    targets: ["claude-code"],
    skills: [
      {
        id: "escape-skill",
        path: path.win32.join("..", "outside-skill"),
        description: "Escapes the source pack directory."
      }
    ],
    prompts: [
      {
        id: "escape-prompt",
        path: path.resolve(outsidePromptPath),
        description: "Escapes the source pack directory."
      }
    ]
  });

  await assert.rejects(validatePack(packDir), /safe relative path|outside the pack directory/);
  await assert.rejects(buildPack(packDir, path.join(tempRoot, "dist")), /safe relative path|outside the pack directory/);
});

test("validatePack rejects a skill without SKILL.md", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-"));
  const packDir = path.join(tempRoot, "broken-pack");

  await mkdir(path.join(packDir, "skills", "missing-entry"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await writePackManifest(packDir, {
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
  });
  await writeFile(path.join(packDir, "prompts", "launch.md"), "Prompt", "utf8");

  await assert.rejects(validatePack(packDir), /must include SKILL\.md/);
});

test("validatePack rejects a manifest without required prompts", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-missing-prompts-"));
  const packDir = path.join(tempRoot, "missing-prompts-pack");

  await mkdir(path.join(packDir, "skills", "starter"), { recursive: true });
  await writeFile(path.join(packDir, "skills", "starter", "SKILL.md"), "Skill", "utf8");
  await writePackManifest(packDir, {
    name: "missing-prompts-pack",
    description: "Missing prompts test pack.",
    version: "0.1.0",
    targets: ["claude-code"],
    skills: [
      {
        id: "starter",
        path: "skills/starter",
        description: "Starter skill."
      }
    ]
  });

  await assert.rejects(validatePack(packDir), /manifest\.prompts must be an array/);
});

test("buildPack preserves referenced skill and prompt paths in target bundles", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-paths-"));
  const packDir = path.join(tempRoot, "path-pack");
  const skillDir = path.join(packDir, "skills", "source-dir");
  const promptDir = path.join(packDir, "prompts", "nested");

  await mkdir(skillDir, { recursive: true });
  await mkdir(promptDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "Skill", "utf8");
  await writeFile(path.join(promptDir, "launch.md"), "Prompt", "utf8");
  await writePackManifest(packDir, {
    name: "path-pack",
    description: "Path preservation test pack.",
    version: "0.1.0",
    targets: ["claude-code", "codex"],
    skills: [
      {
        id: "friendly-id",
        path: "skills/source-dir",
        description: "Skill whose id differs from its directory."
      }
    ],
    prompts: [
      {
        id: "launch",
        path: "prompts/nested/launch.md",
        description: "Nested launch prompt."
      }
    ]
  });

  const built = await buildPack(packDir);
  const claudeSkillPath = path.join(built.outputRoot, "claude-code", "skills", "source-dir", "SKILL.md");
  const codexPromptPath = path.join(built.outputRoot, "codex", "prompts", "nested", "launch.md");
  const bundle = JSON.parse(await readFile(path.join(built.outputRoot, "codex", "bundle.json"), "utf8"));

  await stat(claudeSkillPath);
  await stat(codexPromptPath);
  assert.equal(bundle.skills[0].path, "skills/source-dir/SKILL.md");
  assert.equal(bundle.prompts[0].path, "prompts/nested/launch.md");
});

test("init command scaffolds a new pack that validates", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-init-");
  const packDir = path.join(tempRoot, "fresh-pack");

  await runCli(["init", packDir], { env });

  const manifest = JSON.parse(await readFile(path.join(packDir, "packsmith.json"), "utf8"));

  assert.equal(manifest.name, "fresh-pack");

  const validated = await validatePack(packDir);
  assert.equal(validated.skillCount, 1);
  assert.equal(validated.promptCount, 1);
});

test("v0.1 command chain init, validate, inspect, build, install works through the CLI", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-v01-chain-");
  const packDir = path.join(tempRoot, "chain-pack");
  const distDir = path.join(tempRoot, "dist");
  const installRoot = path.join(tempRoot, "installed");

  await runCli(["init", packDir], { env });

  const validated = await runCli(["validate", packDir], { env });
  assert.match(validated.stdout, /Validated pack "chain-pack" with 1 skill\(s\) and 1 prompt\(s\)\./);

  const inspected = JSON.parse((await runCli(["inspect", packDir], { env })).stdout);
  assert.equal(inspected.name, "chain-pack");
  assert.equal(inspected.skillCount, 1);
  assert.equal(inspected.promptCount, 1);

  const built = await runCli(["build", packDir, "--out", distDir], { env });
  assert.match(built.stdout, /Built "chain-pack" for claude-code, codex in /);
  await stat(path.join(distDir, "chain-pack", "claude-code", "skills", "starter-skill", "SKILL.md"));
  await stat(path.join(distDir, "chain-pack", "codex", "AGENTS.md"));

  await runCli(["install", path.join(distDir, "chain-pack"), "--target", "claude-code", "--dest", installRoot], { env });
  await stat(path.join(installRoot, "chain-pack", "skills", "starter-skill", "SKILL.md"));
  await stat(path.join(installRoot, "chain-pack", "manifest.json"));
});

test("install command copies a built target bundle into a destination", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-install-");
  const installRoot = path.join(tempRoot, "installed");
  const built = await buildPack(examplePack, path.join(tempRoot, "dist"));

  await runCli(["install", built.outputRoot, "--target", "codex", "--dest", installRoot], {
    env
  });

  const agentsPath = path.join(installRoot, "research-launchpad", "AGENTS.md");
  const agentsContent = await readFile(agentsPath, "utf8");

  assert.match(agentsContent, /research-launchpad/i);
});

test("installPack rejects built bundle manifest names that would escape the destination", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-name-escape-"));
  const bundleDir = path.join(tempRoot, "bundle");
  const installRoot = path.join(tempRoot, "dest");

  await writeBuiltBundle(bundleDir, { name: "../escape-pack" });

  await assert.rejects(
    installPack(bundleDir, {
      target: "codex",
      dest: installRoot,
      stateDir: path.join(tempRoot, "state")
    }),
    /manifest\.name/
  );
  await assert.rejects(stat(path.join(tempRoot, "escape-pack", "AGENTS.md")));
});

test("installBundle rejects manifest names that would escape the destination", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-bundle-name-escape-"));
  const bundleDir = path.join(tempRoot, "bundle");
  const installRoot = path.join(tempRoot, "dest");

  await writeBuiltBundle(bundleDir, { name: "../escape-pack" });

  await assert.rejects(installBundle(bundleDir, { target: "codex", dest: installRoot }), /manifest\.name/);
  await assert.rejects(stat(path.join(tempRoot, "escape-pack", "AGENTS.md")));
});

test("legacy install with --dest still requires an explicit target", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-install-required-");
  const installRoot = path.join(tempRoot, "installed");
  const built = await buildPack(examplePack, path.join(tempRoot, "dist"));

  await assert.rejects(
    runCli(["install", built.outputRoot, "--dest", installRoot], { env }),
    (error) => error.stderr.includes("Missing required --target <name> option.")
  );
});

test("help presents package-manager commands", async () => {
  const { env } = await createIsolatedEnv("packsmith-help-");
  const { stdout } = await runCli(["--help"], { env });

  assert.doesNotMatch(stdout, /npx @packsmith\/cli/);
  assert.match(stdout, /packsmith\s+# interactive browser/);
  assert.match(stdout, /packsmith search review/);
  assert.match(stdout, /packsmith preview <pack>/);
  assert.match(stdout, /packsmith install <pack-or-built-dir>/);
  assert.match(stdout, /packsmith search <query>/);
  assert.match(stdout, /packsmith doctor <path>/);
  assert.match(stdout, /packsmith score <pack>/);
  assert.match(stdout, /packsmith sync \[--policy <file>\]/);
  assert.match(stdout, /packsmith audit/);
  assert.match(stdout, /\.github\/skills/);
  assert.match(stdout, /~\/\.copilot\/skills/);
});

test("package metadata publishes as @packsmith/cli while keeping the packsmith bin", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));

  assert.equal(packageJson.name, "@packsmith/cli");
  assert.equal(packageJson.bin.packsmith, "src/cli.mjs");
  assert.match(packageJson.description, /cross-agent/i);
  assert.match(packageJson.description, /trust/i);
  assert.equal(packageJson.repository.type, "git");
  assert.match(packageJson.repository.url, /github\.com\/chenfei462\/packsmith/);
  assert.match(packageJson.homepage, /github\.com\/chenfei462\/packsmith#readme/);
  assert.match(packageJson.bugs.url, /github\.com\/chenfei462\/packsmith\/issues/);
  assert.ok(packageJson.keywords.includes("package-manager"));
  assert.ok(packageJson.keywords.includes("github-copilot"));
  assert.ok(packageJson.keywords.includes("cursor"));
  assert.ok(packageJson.keywords.includes("opencode"));
  assert.ok(packageJson.keywords.includes("trae"));
  assert.ok(packageJson.keywords.includes("supply-chain"));
  assert.match(packageJson.scripts.prepublishOnly, /npm run verify:hackathon:ci/);
  assert.match(packageJson.scripts.prepublishOnly, /node scripts\/i18n-check\.mjs --ci/);
  assert.match(packageJson.scripts.prepublishOnly, /npm run pack:dry-run/);

  const verifyHackathon = await readFile(path.join(repoRoot, "scripts", "verify-hackathon.mjs"), "utf8");
  assert.match(
    verifyHackathon,
    /runStep\("registry quality gate"[\s\S]*"registry",\s*"validate",\s*"--quality-gate",\s*"85"/
  );
});

test("release-facing repository links use the canonical GitHub remote", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  const generator = await readFile(path.join(repoRoot, "scripts", "generate-official-packs.mjs"), "utf8");
  const catalog = await readJson(path.join(repoRoot, "registry", "catalog.json"));

  assert.equal(packageJson.name, "@packsmith/cli");
  assert.equal(packageJson.repository.url, "git+https://github.com/chenfei462/packsmith.git");
  assert.equal(packageJson.homepage, "https://github.com/chenfei462/packsmith#readme");
  assert.equal(packageJson.bugs.url, "https://github.com/chenfei462/packsmith/issues");
  assert.match(generator, /github\.com\/chenfei462\/packsmith/);
  assert.ok(catalog.packs.length > 0, "registry catalog includes packs to verify");

  for (const pack of catalog.packs) {
    assert.equal(pack.repository, `https://${canonicalRepositoryHostPath}/tree/main/official-packs/${pack.id}`, `${pack.id} repository`);
    assert.equal(pack.homepage, `https://${canonicalRepositoryHostPath}#${pack.id}`, `${pack.id} homepage`);
  }

  const staleReferences = [];

  for (const relativePath of await releaseFacingPackageFiles()) {
    const content = await readFile(path.join(repoRoot, relativePath), "utf8");
    for (const pattern of forbiddenRepositoryReferences) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        staleReferences.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  assert.deepEqual(staleReferences, []);
});

test("packaged official pack docs guard unpublished npm commands", async () => {
  const officialPackDirs = await readdir(path.join(repoRoot, "official-packs"), { withFileTypes: true });
  const generator = await readFile(path.join(repoRoot, "scripts", "generate-official-packs.mjs"), "utf8");

  assert.doesNotMatch(generator, /npx @packsmith\/cli/);

  for (const entry of officialPackDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const readmePath = path.join(repoRoot, "official-packs", entry.name, "README.md");

    try {
      const readme = await readFile(readmePath, "utf8");
      assert.doesNotMatch(readme, /npx @packsmith\/cli/, `${entry.name} README should not advertise unpublished npx commands`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
});

test("packaged planning docs keep npm and registry claims current", async () => {
  const registryDocs = await readFile(path.join(repoRoot, "docs", "registry-and-adapters.md"), "utf8");
  const deliverablePlan = await readFile(path.join(repoRoot, "docs", "deliverable-product-plan.md"), "utf8");
  const massMarketPlan = await readFile(path.join(repoRoot, "docs", "mass-market-optimization.md"), "utf8");
  const competitiveBlueprint = await readFile(path.join(repoRoot, "docs", "productization-competitive-blueprint-2026-05.md"), "utf8");

  assert.doesNotMatch(registryDocs, /Each published official pack has .*README.*example fixture/);
  assert.match(registryDocs, /53 runtime-complete official packs/);
  assert.match(registryDocs, /30 launch-ready packs/);
  assert.doesNotMatch(deliverablePlan, /ready to publish or already published to npm/);
  assert.match(deliverablePlan, /After npm publication/);
  assert.match(massMarketPlan, /After npm publication/);
  assert.match(competitiveBlueprint, /after-npm-publication path/);
});

test("package root import is a side-effect-free library entrypoint", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const pkg = await import('@packsmith/cli'); console.log(typeof pkg.validatePack);"
    ],
    {
      cwd: repoRoot,
      timeout: 1500
    }
  );

  assert.equal(stdout.trim(), "function");
});

test("i18n extract preserves existing todo translations", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-i18n-extract-"));
  const scriptsDir = path.join(tempRoot, "scripts");
  const registryDir = path.join(tempRoot, "registry");
  const i18nDir = path.join(tempRoot, "i18n");
  const langDir = path.join(i18nDir, "zh");

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(registryDir, { recursive: true });
  await mkdir(langDir, { recursive: true });
  await copyFile(path.join(repoRoot, "scripts", "i18n-extract.mjs"), path.join(scriptsDir, "i18n-extract.mjs"));
  await writeFile(
    path.join(registryDir, "catalog.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-06-06T00:00:00.000Z",
        packs: [
          {
            id: "review-pack",
            name: "Review Pack",
            description: "Reviews code.",
            usageExample: "packsmith install review-pack"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(i18nDir, "config.json"),
    JSON.stringify(
      {
        languages: ["zh"],
        requiredFields: ["name", "description"],
        optionalFields: ["usageExample"]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(langDir, "catalog-descriptions.json"),
    JSON.stringify(
      {
        "review-pack": {
          _todo: true,
          name: "代码审查包",
          description: "Reviews code."
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await execFileAsync(process.execPath, [path.join(scriptsDir, "i18n-extract.mjs")], { cwd: tempRoot });

  const translations = await readJson(path.join(langDir, "catalog-descriptions.json"));
  assert.equal(translations["review-pack"].name, "代码审查包");
  assert.equal(translations["review-pack"].description, "Reviews code.");
  assert.equal(translations["review-pack"]._source_name, "Review Pack");
});

test("catalog shard generation rejects unsafe categories and missing configured translations", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-catalog-shards-"));
  const scriptsDir = path.join(tempRoot, "scripts");
  const registryDir = path.join(tempRoot, "registry");
  const i18nDir = path.join(tempRoot, "i18n");

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(registryDir, { recursive: true });
  await mkdir(i18nDir, { recursive: true });
  await copyFile(
    path.join(repoRoot, "scripts", "generate-catalog-shards.mjs"),
    path.join(scriptsDir, "generate-catalog-shards.mjs")
  );
  await writeFile(
    path.join(registryDir, "catalog.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-06-06T00:00:00.000Z",
        packs: [
          {
            id: "escape-pack",
            name: "Escape Pack",
            description: "Attempts an unsafe category.",
            category: "../escape"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(i18nDir, "config.json"),
    JSON.stringify({ languages: ["zh"] }, null, 2),
    "utf8"
  );

  await assert.rejects(
    execFileAsync(process.execPath, [path.join(scriptsDir, "generate-catalog-shards.mjs")], { cwd: tempRoot }),
    (error) => error.stderr.includes("Invalid catalog category")
  );

  const catalog = await readJson(path.join(registryDir, "catalog.json"));
  catalog.packs[0].category = "code-quality";
  await writeFile(path.join(registryDir, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [path.join(scriptsDir, "generate-catalog-shards.mjs")], { cwd: tempRoot }),
    (error) => error.stderr.includes("Missing catalog translations for language: zh")
  );
});

test("starter kit generation fails on unknown pack ids and uses catalog timestamp", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-starter-kits-"));
  const scriptsDir = path.join(tempRoot, "scripts");
  const registryDir = path.join(tempRoot, "registry");

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(registryDir, { recursive: true });
  await copyFile(
    path.join(repoRoot, "scripts", "generate-starter-kits.mjs"),
    path.join(scriptsDir, "generate-starter-kits.mjs")
  );
  await writeFile(
    path.join(registryDir, "catalog.json"),
    JSON.stringify({ schemaVersion: 1, updatedAt: "2026-06-06T00:00:00.000Z", packs: [] }, null, 2),
    "utf8"
  );

  await assert.rejects(
    execFileAsync(process.execPath, [path.join(scriptsDir, "generate-starter-kits.mjs")], { cwd: tempRoot }),
    (error) => error.stderr.includes("references unknown pack")
  );
});

test("i18n check fails CI when translation coverage is below threshold", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-i18n-check-"));
  const scriptsDir = path.join(tempRoot, "scripts");
  const registryDir = path.join(tempRoot, "registry");
  const i18nDir = path.join(tempRoot, "i18n");
  const langDir = path.join(i18nDir, "zh");

  await mkdir(scriptsDir, { recursive: true });
  await mkdir(registryDir, { recursive: true });
  await mkdir(langDir, { recursive: true });
  await copyFile(path.join(repoRoot, "scripts", "i18n-check.mjs"), path.join(scriptsDir, "i18n-check.mjs"));
  await writeFile(
    path.join(registryDir, "catalog.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-06-06T00:00:00.000Z",
        packs: [{ id: "review-pack", name: "Review Pack", description: "Reviews code." }]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(i18nDir, "config.json"),
    JSON.stringify(
      {
        languages: ["zh"],
        completionThreshold: 1,
        requiredFields: ["name", "description"]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(langDir, "catalog-descriptions.json"),
    JSON.stringify(
      {
        "review-pack": {
          _todo: true,
          name: "Review Pack",
          description: "Reviews code."
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    execFileAsync(process.execPath, [path.join(scriptsDir, "i18n-check.mjs"), "--ci"], { cwd: tempRoot }),
    (error) => error.stdout.includes("::error") && error.stderr.includes("Translation validation failed")
  );
});

const cjkOrHangulByLanguage = {
  zh: /[\p{Script=Han}]/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /[\p{Script=Hangul}]/u
};

const placeholderPatterns = [
  { label: "replacement character", pattern: /\uFFFD/u },
  { label: "mojibake marker", pattern: /[\u00C3\u00C2]|\u00EF\u00BF\u00BD/u },
  { label: "long question-mark run", pattern: /\?{2,}/u },
  { label: "todo placeholder", pattern: /\b(?:todo|tbd|placeholder|translation needed)\b/i },
  { label: "todo placeholder", pattern: /\u5F85\u7FFB\u8BD1|\u9700\u8981\u7FFB\u8BD1|\u672A\u7FFB\u8A33|\u7FFB\u8A33\u5FC5\u8981|\uBC88\uC5ED\s*\uD544\uC694/u },
  {
    label: "template placeholder",
    pattern:
      /\u76F8\u5173\u5DE5\u4F5C\uFF1A\u68C0\u67E5\u98CE\u9669\u3001\u6574\u7406\u7ED3\u679C\u5E76\u7ED9\u51FA\u9A8C\u8BC1\u6B65\u9AA4/u
  },
  {
    label: "template placeholder",
    pattern:
      /\u306E\u4F5C\u696D\u3067\u3001\u30EA\u30B9\u30AF\u3068\u30C6\u30B9\u30C8\u3092\u78BA\u8A8D\u3057\u3001\u6B21\u306E\u624B\u9806\u3092\u6574\u7406\u3057\u307E\u3059/u
  },
  {
    label: "template placeholder",
    pattern: /\uAD00\uB828\s+\uC704\uD5D8,\s+\uD14C\uC2A4\uD2B8,\s+\uAC80\uC99D\s+\uB2E8\uACC4\uB97C\s+\uC815\uB9AC\uD569\uB2C8\uB2E4/u
  }
];

function normalizeTranslationComparison(value) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function collectCatalogTranslationIssues(catalog, i18nConfig, translationsByLanguage) {
  const issues = [];
  const requiredFields = i18nConfig.requiredFields ?? ["name", "description"];
  const primaryLanguage = i18nConfig.primaryLanguage ?? "en";

  for (const lang of i18nConfig.languages ?? []) {
    const translations = translationsByLanguage[lang];

    if (!translations || typeof translations !== "object") {
      issues.push(`${lang}: missing translation catalog`);
      continue;
    }

    for (const pack of catalog.packs ?? []) {
      const entry = translations[pack.id];

      if (!entry || typeof entry !== "object") {
        issues.push(`${lang}/${pack.id}: missing translation entry`);
        continue;
      }

      if (entry._todo) {
        issues.push(`${lang}/${pack.id}: _todo must not be present`);
      }

      for (const field of requiredFields) {
        const value = entry[field];
        const sourceValue = pack[field];
        const location = `${lang}/${pack.id}.${field}`;

        if (typeof value !== "string" || value.trim() === "") {
          issues.push(`${location}: missing or empty field`);
          continue;
        }

        if (/^\?+$/.test(value.trim())) {
          issues.push(`${location}: all-question-mark placeholder`);
        }

        for (const { label, pattern } of placeholderPatterns) {
          if (pattern.test(value)) {
            issues.push(`${location}: ${label}`);
          }
        }

        if (
          lang !== primaryLanguage &&
          typeof sourceValue === "string" &&
          normalizeTranslationComparison(value) === normalizeTranslationComparison(sourceValue)
        ) {
          issues.push(`${location}: must not equal English source text`);
        }

        const scriptPattern = cjkOrHangulByLanguage[lang];
        if (scriptPattern && !scriptPattern.test(value)) {
          issues.push(`${location}: missing localized script characters`);
        }
      }
    }
  }

  return issues;
}

test("i18n mojibake validator catches future packs and placeholder corruption", () => {
  const catalog = {
    packs: [
      { id: "future-pack", name: "Future Pack", description: "Future source description." },
      { id: "todo-pack", name: "Todo Pack", description: "Todo source description." },
      { id: "same-pack", name: "Same Pack", description: "Same source description." },
      { id: "mojibake-pack", name: "Mojibake Pack", description: "Mojibake source description." },
      { id: "script-pack", name: "Script Pack", description: "Script source description." },
      { id: "template-pack", name: "Template Pack", description: "Template source description." },
      { id: "missing-field-pack", name: "Missing Field Pack", description: "Missing field source description." }
    ]
  };
  const i18nConfig = {
    languages: ["zh", "fr"],
    primaryLanguage: "en",
    requiredFields: ["name", "description"]
  };
  const translationsByLanguage = {
    zh: {
      "todo-pack": {
        _todo: true,
        name: "\u5F85\u529E",
        description: "\u5F85\u529E\u8BF4\u660E"
      },
      "same-pack": {
        name: "Same Pack",
        description: "Same source description."
      },
      "mojibake-pack": {
        name: "\u4E71\u7801\u5305",
        description: "Fran\u00C3\u00A7ais??"
      },
      "script-pack": {
        name: "Script Pack",
        description: "No localized script"
      },
      "template-pack": {
        name: "\u6A21\u677F\u5305",
        description:
          "\u6A21\u677F\u5305\u76F8\u5173\u5DE5\u4F5C\uFF1A\u68C0\u67E5\u98CE\u9669\u3001\u6574\u7406\u7ED3\u679C\u5E76\u7ED9\u51FA\u9A8C\u8BC1\u6B65\u9AA4\u3002"
      },
      "missing-field-pack": {
        name: "\u7F3A\u5B57\u6BB5\u5305"
      }
    },
    fr: {
      "future-pack": {
        name: "Pack futur",
        description: "Description future"
      },
      "todo-pack": {
        name: "Pack a faire",
        description: "Description"
      },
      "same-pack": {
        name: "Pack different",
        description: "Description differente"
      },
      "mojibake-pack": {
        name: "Pack mojibake",
        description: "Texte \u00EF\u00BF\u00BD casse"
      },
      "script-pack": {
        name: "Pack script",
        description: "Description"
      },
      "template-pack": {
        name: "TODO",
        description: "Description"
      },
      "missing-field-pack": {
        name: "Pack incomplet",
        description: "Description"
      }
    }
  };

  const issues = collectCatalogTranslationIssues(catalog, i18nConfig, translationsByLanguage).join("\n");

  assert.match(issues, /zh\/future-pack: missing translation entry/);
  assert.match(issues, /zh\/todo-pack: _todo must not be present/);
  assert.match(issues, /zh\/same-pack\.name: must not equal English source text/);
  assert.match(issues, /zh\/mojibake-pack\.description: mojibake marker/);
  assert.match(issues, /zh\/mojibake-pack\.description: long question-mark run/);
  assert.match(issues, /zh\/script-pack\.name: missing localized script characters/);
  assert.match(issues, /zh\/template-pack\.description: template placeholder/);
  assert.match(issues, /zh\/missing-field-pack\.description: missing or empty field/);
  assert.match(issues, /fr\/mojibake-pack\.description: mojibake marker/);
  assert.match(issues, /fr\/template-pack\.name: todo placeholder/);
});

test("i18n catalog translations reject mojibake placeholders", async () => {
  const catalog = await readJson(path.join(repoRoot, "registry", "catalog.json"));
  const i18nConfig = await readJson(path.join(repoRoot, "i18n", "config.json"));
  const translationsByLanguage = {};

  for (const lang of i18nConfig.languages) {
    translationsByLanguage[lang] = await readJson(path.join(repoRoot, "i18n", lang, "catalog-descriptions.json"));
  }

  assert.deepEqual(collectCatalogTranslationIssues(catalog, i18nConfig, translationsByLanguage), []);
});

test("AI pack generator validates option values before reading credentials", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "generate-pack.mjs"), "--pack"], {
      cwd: repoRoot,
      env: { ...process.env, ANTHROPIC_API_KEY: "" }
    }),
    (error) => error.stderr.includes("--pack requires a value")
  );
});

test("content coverage docs include TRAE target coverage", async () => {
  const coverageDoc = await readFile(path.join(repoRoot, "docs", "content-coverage.md"), "utf8");

  assert.match(coverageDoc, /\| Supported targets \| 6 \|/);
  assert.match(coverageDoc, /\| trae \| 54 \|/);
  assert.match(coverageDoc, /\| Category \| claude-code \| codex \| cursor \| github-copilot \| opencode \| trae \|/);
});

test("AI pack generator prompts and post-processes generated packs for TRAE", async () => {
  const generator = await readFile(path.join(repoRoot, "scripts", "generate-pack.mjs"), "utf8");

  assert.match(generator, /All packs support targets: claude-code, codex, github-copilot, opencode, cursor, trae/);
  assert.match(
    generator,
    /targets: \["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"\]/
  );
  assert.match(
    generator,
    /targets: \['claude-code', 'codex', 'github-copilot', 'opencode', 'cursor', 'trae'\]/
  );
  assert.match(generator, /targetSupport/);
  assert.match(generator, /trae/);
  assert.match(generator, /local TRAE Skill directories/);
});

test("search and show read a registry catalog", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-registry-");
  const packDir = path.join(tempRoot, "senior-code-reviewer");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "senior-code-reviewer" });
  await writeRegistry(catalogPath, [
    {
      id: "senior-code-reviewer",
      name: "Senior Code Reviewer",
      description: "Finds bugs, regressions, missing tests, and risky changes.",
      version: "0.1.0",
      targets: ["claude-code", "codex"],
      author: "packsmith",
      verified: true,
      tags: ["review", "quality"],
      updatedAt: "2026-05-24T00:00:00.000Z",
      stars: 42,
      installCount: 210,
      repository: "https://github.com/packsmith/official-packs",
      source: packDir
    }
  ]);

  const searched = await runCli(["search", "review", "--registry", catalogPath], { env });
  const shown = await runCli(["info", "senior-code-reviewer", "--registry", catalogPath], { env });

  assert.match(searched.stdout, /senior-code-reviewer/);
  assert.match(searched.stdout, /verified/);
  assert.match(searched.stdout, /stars: 42/);
  assert.match(searched.stdout, /installs: 210/);
  assert.match(shown.stdout, /Senior Code Reviewer/);
  assert.match(shown.stdout, /Targets: claude-code, codex/);
  assert.match(shown.stdout, /Category: code-quality/);
  assert.match(shown.stdout, /License: MIT/);
  assert.match(shown.stdout, /Declared risk: low/);
  assert.match(shown.stdout, /Computed install risk: low/);
  assert.match(shown.stdout, /Risk explanation: declared low; computed install risk remains low because filesystem: required/);
  assert.match(shown.stdout, /Estimated context: 1200 chars/);
  assert.match(shown.stdout, /Example: packsmith install senior-code-reviewer/);
  assert.match(shown.stdout, /Tags: review, quality/);
  assert.match(shown.stdout, /Repository: https:\/\/github\.com\/packsmith\/official-packs/);
});

test("search supports JSON output for tool and CI consumers", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-search-json-");
  const packDir = path.join(tempRoot, "json-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "json-pack" });
  await writeRegistry(catalogPath, [
    {
      id: "json-pack",
      name: "JSON Pack",
      description: "Pack returned in JSON search output.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "packsmith",
      verified: true,
      source: packDir,
      tags: ["json"]
    }
  ]);

  const { stdout } = await runCli(["search", "json", "--registry", catalogPath, "--json"], { env });
  const payload = JSON.parse(stdout);

  assert.equal(payload.results[0].id, "json-pack");
  assert.equal(payload.catalog.schemaVersion, 1);
});

test("search matches registry tags and categories", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-registry-tags-"));
  const packDir = path.join(tempRoot, "dependency-upgrader");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "dependency-upgrader" });
  await writeRegistry(catalogPath, [
    {
      id: "dependency-upgrader",
      name: "Dependency Upgrader",
      description: "Plans safe dependency upgrade batches and follow-up checks.",
      version: "0.1.0",
      targets: ["claude-code", "codex"],
      author: "packsmith",
      verified: true,
      source: packDir,
      tags: ["maintenance", "dependencies"],
      updatedAt: "2026-05-24T00:00:00.000Z",
      stars: 17,
      installCount: 88
    }
  ]);

  const { env } = await createIsolatedEnv("packsmith-registry-tags-");

  const searched = await runCli(["search", "dependencies", "--registry", catalogPath], { env });
  const categorySearch = await runCli(["search", "code-quality", "--registry", catalogPath], { env });

  assert.match(searched.stdout, /dependency-upgrader/);
  assert.match(categorySearch.stdout, /dependency-upgrader/);

  await writeRegistry(catalogPath, [
    {
      id: "dependency-upgrader",
      name: "Dependency Upgrader",
      description: "Catalog entry without social proof fields.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);

  const validated = await runCli(["registry", "validate", "--registry", catalogPath], { env });
  const legacyInfo = await runCli(["info", "dependency-upgrader", "--registry", catalogPath], { env });

  assert.match(validated.stdout, /Registry valid/);
  assert.match(legacyInfo.stdout, /Tags: none/);
  assert.match(legacyInfo.stdout, /Stars: 0/);
  assert.match(legacyInfo.stdout, /Installs: 0/);
});

test("default registry exposes official packs", async () => {
  const { env } = await createIsolatedEnv("packsmith-registry-default-");
  const searched = await runCli(["search", "review"], { env });
  const shown = await runCli(["show", "senior-code-reviewer"], { env });

  assert.match(searched.stdout, /senior-code-reviewer/);
  assert.match(shown.stdout, /Senior Code Reviewer/);
  assert.match(shown.stdout, /Verified: yes/);
});

test("default registry includes the launch code-quality packs", async () => {
  const { stdout } = await runCli(["search", "packsmith"]);

  assert.match(stdout, /senior-code-reviewer/);
  assert.match(stdout, /test-writer/);
  assert.match(stdout, /security-reviewer/);
  assert.match(stdout, /refactor-planner/);
  assert.match(stdout, /bug-hunter/);
  assert.match(stdout, /performance-profiler/);
});

test("default registry includes every official pack with social proof", async () => {
  const catalog = await readJson(path.join(repoRoot, "registry", "catalog.json"));
  const officialPackIds = (await readdir(path.join(repoRoot, "official-packs"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedLaunchPackIds = [
    "senior-code-reviewer",
    "security-reviewer",
    "test-writer",
    "refactor-planner",
    "bug-hunter",
    "performance-profiler",
    "repo-cartographer",
    "onboarding-guide",
    "dependency-auditor",
    "api-surface-mapper",
    "database-schema-reader",
    "legacy-code-translator",
    "launch-researcher",
    "github-trending-analyst",
    "competitor-breakdown",
    "readme-converter",
    "roadmap-writer",
    "issue-triage",
    "docs-maintainer",
    "changelog-writer",
    "tutorial-writer",
    "api-docs-writer",
    "contributing-guide-writer",
    "release-checklist",
    "prompt-debugger",
    "skill-author",
    "context-budgeter",
    "multi-agent-router",
    "workflow-packager",
    "agent-memory-curator"
  ];

  assert.deepEqual(
    catalog.packs.map((pack) => pack.id).sort(),
    officialPackIds
  );

  for (const packId of expectedLaunchPackIds) {
    assert.ok(catalog.packs.some((pack) => pack.id === packId), `registry includes ${packId}`);
  }

  for (const pack of catalog.packs) {
    assert.ok(Array.isArray(pack.tags) && pack.tags.length > 0, `${pack.id} has tags`);
    assert.equal(typeof pack.category, "string", `${pack.id} has category`);
    assert.equal(typeof pack.license, "string", `${pack.id} has license`);
    assert.equal(typeof pack.riskLevel, "string", `${pack.id} has riskLevel`);
    assert.equal(typeof pack.estimatedContextSize, "number", `${pack.id} has estimatedContextSize`);
    assert.equal(typeof pack.usageExample, "string", `${pack.id} has usageExample`);
    assert.equal(typeof pack.updatedAt, "string", `${pack.id} has updatedAt`);
    assert.equal(typeof pack.stars, "number", `${pack.id} has stars`);
    assert.equal(typeof pack.installCount, "number", `${pack.id} has installCount`);
  }
});

test("catalog compatibility notes only name declared targets", async () => {
  const catalog = await readJson(path.join(repoRoot, "registry", "catalog.json"));
  const targetNames = new Map([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["github-copilot", "GitHub Copilot"],
    ["opencode", "OpenCode"],
    ["cursor", "Cursor"],
    ["trae", "TRAE"]
  ]);

  for (const pack of catalog.packs) {
    const notes = pack.compatibilityNotes ?? "";
    const declaredTargets = new Set(pack.targets ?? []);

    for (const [targetId, targetName] of targetNames) {
      assert.ok(
        !notes.includes(targetName) || declaredTargets.has(targetId),
        `${pack.id} compatibilityNotes mention ${targetName} without declaring ${targetId}`
      );
    }
  }
});

test("registry validate checks catalog entries and source packs", async () => {
  const { env } = await createIsolatedEnv("packsmith-registry-validate-");
  const { stdout } = await runCli(["registry", "validate", "--quality-gate", "85"], { env });

  assert.match(stdout, /Registry valid/);
  assert.match(stdout, /54 pack/);
});

test("package files publish only the bundled launch packs", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  const catalog = await readJson(path.join(repoRoot, "registry", "catalog.json"));
  const publishedOfficialPacks = packageJson.files.filter((entry) => entry.startsWith("official-packs/"));
  const catalogPackIds = catalog.packs.map((pack) => `official-packs/${pack.id}`).sort();

  assert.equal(publishedOfficialPacks.length, catalog.packs.length);
  assert.deepEqual(publishedOfficialPacks.sort(), catalogPackIds);
  assert.equal((await readdir(path.join(repoRoot, "official-packs"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).length, 54);
});

test("npm pack dry-run includes the demo surface and excludes development tests", async () => {
  const { stdout } = await execFileAsync(process.execPath, [npmCliPath, "pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 4
  });
  const [pack] = JSON.parse(stdout);
  const files = pack.files.map((file) => file.path);

  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("scripts/hackathon-demo.mjs"));
  assert.ok(files.includes("docs/assets/packsmith-demo.svg"));
  assert.ok(files.includes("registry/catalog.json"));
  assert.ok(files.includes("src/cli.mjs"));
  assert.ok(files.includes("official-packs/senior-code-reviewer/packsmith.json"));
  assert.ok(!files.some((file) => file.startsWith("tests/")));
  assert.ok(!files.some((file) => file.endsWith(".tgz")));
});

test("docs site generator escapes dynamic content and avoids innerHTML rendering", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-docs-site-"));
  const tempDocsSiteDir = path.join(tempRoot, "docs", "site");
  const tempRegistryDir = path.join(tempRoot, "registry");
  const tempI18nDir = path.join(tempRoot, "i18n");
  const tempZhDir = path.join(tempI18nDir, "zh");

  await mkdir(tempDocsSiteDir, { recursive: true });
  await mkdir(tempRegistryDir, { recursive: true });
  await mkdir(tempZhDir, { recursive: true });
  await copyFile(path.join(repoRoot, "docs", "site", "generate.mjs"), path.join(tempDocsSiteDir, "generate.mjs"));
  await writeFile(
    path.join(tempRegistryDir, "catalog.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-06-06T00:00:00.000Z",
        packs: [
          {
            id: "xss-pack",
            name: "</script><img src=x onerror=alert(1)>",
            description: "<svg onload=alert(1)>",
            category: "code-quality",
            targets: ["codex"],
            source: "../official-packs/xss-pack",
            license: "MIT",
            riskLevel: "low",
            estimatedContextSize: 10,
            usageExample: "packsmith install xss-pack",
            verified: true,
            author: "packsmith"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempI18nDir, "config.json"),
    JSON.stringify(
      {
        languages: ["zh"],
        primaryLanguage: "en",
        completionThreshold: 0.5,
        requiredFields: ["name", "description"],
        optionalFields: ["usageExample"],
        priorityLanguages: ["zh"],
        catalogSource: "../registry/catalog.json"
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(tempZhDir, "catalog-descriptions.json"),
    JSON.stringify(
      {
        "xss-pack": {
          name: "<script>alert(1)</script>",
          description: "<img src=x onerror=alert(1)>"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await execFileAsync(process.execPath, [path.join(tempDocsSiteDir, "generate.mjs")], { cwd: tempRoot });

  const html = await readFile(path.join(tempDocsSiteDir, "dist", "index.html"), "utf8");

  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/i);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/i);
  assert.match(html, /\\u003C\/script\\u003E/);
  assert.match(html, /replaceChildren/);
  assert.doesNotMatch(html, /grid\.innerHTML/);
});

test("registry validate enforces a quality gate for verified packs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-quality-gate-"));
  const packDir = path.join(tempRoot, "weak-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, {
    name: "weak-pack",
    skillText: "# Weak\n\nDo things.",
    promptText: "Do things."
  });
  await writeRegistry(catalogPath, [
    {
      id: "weak-pack",
      name: "Weak Pack",
      description: "Short weak pack.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "packsmith",
      verified: true,
      source: packDir,
      tags: ["weak"]
    }
  ]);

  await assert.rejects(
    runCli(["registry", "validate", "--registry", catalogPath, "--quality-gate", "85"]),
    (error) => error.stderr.includes("quality score") && error.stderr.includes("below gate 85")
  );
});

test("registry commands manage bundled, official, and custom registries", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-registry-config-"));
  const packDir = path.join(tempRoot, "team-pack");
  const catalogPath = path.join(tempRoot, "team-catalog.json");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "team-pack" });
  await writeRegistry(catalogPath, [
    {
      id: "team-pack",
      name: "Team Pack",
      description: "Pack in a custom team registry.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "team",
      verified: true,
      source: packDir,
      tags: ["team"]
    }
  ]);

  const added = await runCli(["registry", "add", "team", catalogPath, "--state-dir", stateDir]);
  const used = await runCli(["registry", "use", "team", "--state-dir", stateDir]);
  const listed = await runCli(["registry", "list", "--state-dir", stateDir, "--json"]);
  const searched = await runCli(["search", "team", "--state-dir", stateDir]);

  const payload = JSON.parse(listed.stdout);

  assert.match(added.stdout, /Added registry team/);
  assert.match(used.stdout, /Using registry team/);
  assert.equal(payload.active, "team");
  assert.ok(payload.registries.some((entry) => entry.name === "bundled"));
  assert.ok(payload.registries.some((entry) => entry.name === "official"));
  assert.ok(payload.registries.some((entry) => entry.name === "team"));
  assert.match(searched.stdout, /team-pack/);
});

test("registry refresh caches remote catalogs and makes the active remote searchable", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-remote-registry-"));
  const packDir = path.join(tempRoot, "remote-pack");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "remote-pack" });

  const catalog = {
    schemaVersion: 1,
    updatedAt: "2026-05-25T00:00:00.000Z",
    packs: [
      {
        id: "remote-pack",
        name: "Remote Pack",
        description: "Pack loaded from a refreshed remote registry.",
        version: "0.1.0",
        targets: ["codex"],
        author: "team",
        publisher: {
          id: "team",
          verified: true
        },
        verified: true,
        category: "code-quality",
        tags: ["remote"],
        source: packDir,
        license: "MIT",
        riskLevel: "low",
        estimatedContextSize: 1200,
        usageExample: "packsmith install remote-pack",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]
  };

  await withJsonServer({ "/catalog.json": catalog }, async (origin) => {
    await runCli(["registry", "add", "remote-team", `${origin}/catalog.json`, "--state-dir", stateDir]);
    await runCli(["registry", "use", "remote-team", "--state-dir", stateDir]);

    const refreshed = await runCli(["registry", "refresh", "--state-dir", stateDir, "--json"]);
    const refreshPayload = JSON.parse(refreshed.stdout);
    const remote = refreshPayload.refreshed.find((entry) => entry.name === "remote-team");

    assert.equal(remote.status, "cached");
    assert.match(remote.cachePath, /remote-team\.catalog\.json$/);

    const searched = await runCli(["search", "remote", "--state-dir", stateDir]);
    assert.match(searched.stdout, /remote-pack/);
  });
});

test("installing from a refreshed remote registry requires confirmation, --yes, or policy", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-remote-install-confirm-"));
  const packDir = path.join(tempRoot, "remote-confirm-pack");
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, { name: "remote-confirm-pack", targets: ["codex"] });
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requiredVerified: true,
        allowedPublishers: ["team"],
        allowedRequiredPermissions: ["filesystem"],
        allowedTargets: ["codex"],
        maxRisk: "low"
      },
      null,
      2
    ),
    "utf8"
  );

  const catalog = {
    schemaVersion: 1,
    updatedAt: "2026-05-25T00:00:00.000Z",
    packs: [
      {
        id: "remote-confirm-pack",
        name: "Remote Confirm Pack",
        description: "Pack installed through a refreshed remote registry.",
        version: "0.1.0",
        targets: ["codex"],
        author: "team",
        publisher: {
          id: "team",
          verified: true
        },
        verified: true,
        category: "code-quality",
        tags: ["remote"],
        source: packDir,
        license: "MIT",
        riskLevel: "low",
        estimatedContextSize: 1200,
        usageExample: "packsmith install remote-confirm-pack",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]
  };

  await withJsonServer({ "/catalog.json": catalog }, async (origin) => {
    await runCli(["registry", "add", "remote-team", `${origin}/catalog.json`, "--state-dir", stateDir]);
    await runCli(["registry", "use", "remote-team", "--state-dir", stateDir]);
    await runCli(["registry", "refresh", "--state-dir", stateDir]);

    await assert.rejects(
      runCli(["install", "remote-confirm-pack", "--state-dir", stateDir, "--target", "codex"], {
        env: {
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir
        }
      }),
      (error) => error.stderr.includes("requires confirmation") && error.stderr.includes("--yes")
    );

    const installed = await runCli(
      ["install", "remote-confirm-pack", "--state-dir", stateDir, "--target", "codex", "--yes"],
      {
        env: {
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir
        }
      }
    );

    assert.match(installed.stdout, /Installed remote-confirm-pack/);

    await rm(path.join(homeDir, ".codex", "skills", "remote-confirm-pack"), { recursive: true, force: true });

    const policyInstall = await runCli(
      ["install", "remote-confirm-pack", "--state-dir", stateDir, "--target", "codex", "--policy", policyPath],
      {
        env: {
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir
        }
      }
    );

    assert.match(policyInstall.stdout, /Installed remote-confirm-pack/);
  });
});

test("registry validate accepts GitHub source metadata with pinned commit and checksum", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-github-source-"));
  const catalogPath = path.join(tempRoot, "catalog.json");

  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-05-25T00:00:00.000Z",
        packs: [
          {
            id: "github-pack",
            name: "GitHub Pack",
            description: "Remote pack with GitHub source metadata.",
            version: "0.1.0",
            author: "packsmith",
            publisher: {
              id: "packsmith",
              verified: false
            },
            category: "code-quality",
            tags: ["github"],
            targets: ["codex"],
            source: {
              type: "github-archive",
              repo: "packsmith/official-packs",
              path: "packs/github-pack",
              ref: "v0.1.0",
              tag: "v0.1.0",
              commit: "0123456789abcdef0123456789abcdef01234567",
              checksum: "sha256-abc123",
              schemaVersion: 1
            },
            license: "MIT",
            riskLevel: "low",
            estimatedContextSize: 1200,
            usageExample: "packsmith install github-pack",
            verified: false,
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await runCli(["registry", "validate", "--registry", catalogPath, "--json"]);
  const payload = JSON.parse(stdout);

  assert.equal(payload.valid, true);
  assert.equal(payload.checkedPacks[0].status, "remote-metadata");
  assert.equal(payload.checkedPacks[0].commit, "0123456789abcdef0123456789abcdef01234567");
});

test("install resolves a GitHub archive source through the contents API when checksum matches", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-github-install-"));
  const sourceDir = path.join(tempRoot, "repo-source", "packs", "github-install-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");

  await writePack(sourceDir, { name: "github-install-pack", targets: ["codex"] });
  const checksum = await hashDirectoryForTest(sourceDir);

  await withJsonServer(
    Object.fromEntries(
      await Promise.all(
        (await listFiles(sourceDir)).map(async (relativePath) => [
          `/raw/${relativePath.split(path.sep).join("/")}`,
          await readFile(path.join(sourceDir, relativePath), "utf8")
        ])
      )
    ),
    async (rawOrigin) => {
      const fileEntries = await Promise.all(
        (await listFiles(sourceDir)).map(async (relativePath) => ({
          name: path.basename(relativePath),
          path: relativePath.split(path.sep).join("/"),
          type: "file",
          download_url: `${rawOrigin}/raw/${relativePath.split(path.sep).join("/")}`
        }))
      );

      await writeFile(
        catalogPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            updatedAt: "2026-05-25T00:00:00.000Z",
            packs: [
              {
                id: "github-install-pack",
                name: "GitHub Install Pack",
                description: "Pack fetched from a GitHub source during install.",
                version: "0.1.0",
                author: "packsmith",
                publisher: {
                  id: "packsmith",
                  verified: true
                },
                category: "code-quality",
                tags: ["github"],
                targets: ["codex"],
                source: {
                  type: "github-archive",
                  repo: "packsmith/official-packs",
                  path: "packs/github-install-pack",
                  ref: "v0.1.0",
                  commit: "0123456789abcdef0123456789abcdef01234567",
                  checksum,
                  apiBaseUrl: `${rawOrigin}/github-api`,
                  schemaVersion: 1
                },
                license: "MIT",
                riskLevel: "low",
                estimatedContextSize: 1200,
                usageExample: "packsmith install github-install-pack",
                verified: true,
                updatedAt: "2026-05-25T00:00:00.000Z"
              }
            ]
          },
          null,
          2
        ),
        "utf8"
      );

      const apiRoutes = {
        "/github-api/repos/packsmith/official-packs/contents/packs/github-install-pack?ref=v0.1.0": fileEntries
      };

      await withJsonServer(apiRoutes, async (apiOrigin) => {
        const catalog = await readJson(catalogPath);
        catalog.packs[0].source.apiBaseUrl = `${apiOrigin}/github-api`;
        await writeFile(catalogPath, JSON.stringify(catalog, null, 2), "utf8");

        const installed = await runCli(
          ["install", "github-install-pack", "--registry", catalogPath, "--target", "codex", "--yes"],
          {
            env: {
              PACKSMITH_HOME: stateDir,
              PACKSMITH_TEST_HOME: homeDir,
              PACKSMITH_ALLOWED_FETCH_HOSTS: "127.0.0.1,localhost"
            }
          }
        );

        assert.match(installed.stdout, /Installed github-install-pack/);
        await stat(path.join(homeDir, ".codex", "skills", "github-install-pack", "AGENTS.md"));
      });
    }
  );
});

test("registry validate rejects duplicate ids and missing sources", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-registry-validate-"));
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writeRegistry(catalogPath, [
    {
      id: "duplicate-pack",
      name: "Duplicate Pack",
      description: "First duplicate.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "packsmith",
      verified: true,
      source: "missing-pack"
    },
    {
      id: "duplicate-pack",
      name: "Duplicate Pack Again",
      description: "Second duplicate.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: false,
      source: "also-missing"
    }
  ]);

  await assert.rejects(
    runCli(["registry", "validate", "--registry", catalogPath]),
    (error) => error.stderr.includes("Duplicate registry id") && error.stderr.includes("source not found")
  );
});

test("registry validate rejects launch-schema entries with missing fields", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-registry-schema-"));
  const packDir = path.join(tempRoot, "incomplete-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "incomplete-pack" });
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-05-24T00:00:00.000Z",
        packs: [
          {
            id: "incomplete-pack",
            name: "Incomplete Pack",
            description: "A catalog entry missing launch metadata.",
            version: "0.1.0",
            targets: ["claude-code"],
            author: "packsmith",
            verified: true,
            source: packDir,
            tags: ["incomplete"]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    runCli(["registry", "validate", "--registry", catalogPath]),
    (error) =>
      error.stderr.includes("missing category") &&
      error.stderr.includes("missing license") &&
      error.stderr.includes("riskLevel must be one of") &&
      error.stderr.includes("missing usageExample")
  );
});

test("default registry works outside the repository cwd", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-cwd-"));
  const searched = await runCli(["search", "cartographer"], { cwd: tempRoot });

  assert.match(searched.stdout, /repo-cartographer/);
});

test("install command installs a local source pack with dry-run and writes trust metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-source-"));
  const packDir = path.join(tempRoot, "senior-code-reviewer");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "senior-code-reviewer" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });

  const dryRun = await runCli(["install", packDir, "--target", "codex", "--dry-run"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(dryRun.stdout, /Dry run/);
  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "senior-code-reviewer")));

  const installed = await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(installed.stdout, /Installed senior-code-reviewer/);
  assert.match(installed.stdout, /Codex: installed/);

  const receipt = await readJson(path.join(stateDir, "receipts", "senior-code-reviewer.codex.json"));
  const lockfile = await readJson(path.join(stateDir, "packsmith.lock"));
  const agentsContent = await readFile(path.join(homeDir, ".codex", "skills", "senior-code-reviewer", "AGENTS.md"), "utf8");

  assert.equal(receipt.pack, "senior-code-reviewer");
  assert.equal(receipt.target, "codex");
  assert.equal(lockfile.installed.length, 1);
  assert.match(lockfile.installed[0].checksum, /^sha256-/);
  assert.match(agentsContent, /senior-code-reviewer/i);
});

test("installPack rejects destinations that would overwrite the source pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-source-guard-"));
  const packDir = path.join(tempRoot, "guarded-install-pack");

  await writePack(packDir, { name: "guarded-install-pack", targets: ["codex"] });

  await assert.rejects(
    installPack(packDir, {
      target: "codex",
      dest: tempRoot,
      stateDir: path.join(tempRoot, "state")
    }),
    /install destination.*source/i
  );
  await stat(path.join(packDir, "packsmith.json"));
  await stat(path.join(packDir, "skills", "review", "SKILL.md"));
});

test("installBundle rejects destinations that would overwrite the input bundle", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-bundle-guard-"));
  const packDir = path.join(tempRoot, "guarded-bundle-pack");

  await writePack(packDir, { name: "guarded-bundle-pack", targets: ["codex"] });
  const built = await buildPack(packDir, path.join(tempRoot, "dist"));

  await assert.rejects(installBundle(built.outputRoot, { target: "codex", dest: path.dirname(built.outputRoot) }), /install destination.*source/i);
  await stat(path.join(built.outputRoot, "manifest.json"));
  await stat(path.join(built.outputRoot, "codex", "AGENTS.md"));
});

test("reinstall removes files that are no longer in the source pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-reinstall-prune-"));
  const packDir = path.join(tempRoot, "pruned-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const obsoleteSourcePath = path.join(packDir, "skills", "review", "obsolete.md");
  const obsoleteInstallPath = path.join(homeDir, ".codex", "skills", "pruned-pack", "skills", "review", "obsolete.md");

  await writePack(packDir, { name: "pruned-pack", targets: ["codex"] });
  await writeFile(obsoleteSourcePath, "Remove me on reinstall.", "utf8");

  await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  await stat(obsoleteInstallPath);
  await rm(obsoleteSourcePath, { force: true });

  await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  await assert.rejects(stat(obsoleteInstallPath));
});

test("preview prints a trust-centered install plan without writing target files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-preview-"));
  const packDir = path.join(tempRoot, "preview-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "preview-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });

  const { stdout } = await runCli(["preview", packDir, "--target", "codex", "--json"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const plan = JSON.parse(stdout);

  assert.equal(plan.pack.id, "preview-pack");
  assert.equal(plan.targets[0].target, "codex");
  assert.match(plan.targets[0].installDir, /preview-pack/);
  assert.ok(plan.targets[0].writes.some((filePath) => filePath.endsWith("AGENTS.md")));
  assert.equal(plan.permissions.filesystem, "required");
  assert.equal(plan.risk.level, "low");
  assert.equal(plan.assets.hasScripts, false);
  assert.equal(plan.provenance.verified, false);
  assert.match(plan.provenance.checksum, /^sha256-/);
  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "preview-pack")));

  const human = await runCli(["preview", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(human.stdout, /Preview for preview-pack/);
  assert.doesNotMatch(human.stdout, /Dry run for preview-pack/);
});

test("install --dry-run emits the same install plan JSON", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-plan-"));
  const packDir = path.join(tempRoot, "plan-pack");
  const homeDir = path.join(tempRoot, "home");

  await writePack(packDir, { name: "plan-pack" });

  const { stdout } = await runCli(["install", packDir, "--target", "claude-code", "--dry-run", "--json"], {
    env: {
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const plan = JSON.parse(stdout);

  assert.equal(plan.pack.id, "plan-pack");
  assert.equal(plan.targets[0].target, "claude-code");
  assert.ok(plan.targets[0].writes.some((filePath) => filePath.endsWith("README.md")));
});

test("preview explains effective risk reasons beyond registry metadata", async () => {
  const { env } = await createIsolatedEnv("packsmith-preview-risk-");
  const { stdout } = await runCli(["preview", "senior-code-reviewer", "--target", "codex", "--json"], { env });
  const plan = JSON.parse(stdout);

  assert.equal(plan.risk.level, "medium");
  assert.match(plan.risk.reasons.join(" | "), /registry declares low risk/);
  assert.match(plan.risk.reasons.join(" | "), /network: optional/);
});

test("preview --all-targets prints one install readiness row per supported runtime", async () => {
  const { env } = await createIsolatedEnv("packsmith-preview-all-");
  const { stdout } = await runCli(["preview", "senior-code-reviewer", "--all-targets"], { env });

  assert.match(stdout, /Preview matrix for senior-code-reviewer/);
  assert.match(stdout, /Claude Code\s+preview-ready/);
  assert.match(stdout, /Codex\s+preview-ready/);
  assert.match(stdout, /GitHub Copilot\s+preview-ready/);
  assert.match(stdout, /OpenCode\s+preview-ready/);
  assert.match(stdout, /Cursor\s+preview-ready/);
  assert.match(stdout, /TRAE\s+preview-ready/);
});

test("preview --all-targets --json emits machine-readable target summaries", async () => {
  const { env } = await createIsolatedEnv("packsmith-preview-all-json-");
  const { stdout } = await runCli(["preview", "senior-code-reviewer", "--all-targets", "--json"], { env });
  const preview = JSON.parse(stdout);

  assert.equal(preview.pack.id, "senior-code-reviewer");
  assert.equal(preview.summary.total, 6);
  assert.equal(preview.summary.ready, 6);
  assert.deepEqual(preview.summary.readyTargets, ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"]);

  const codex = preview.targets.find((target) => target.id === "codex");

  assert.equal(codex.status, "preview-ready");
  assert.equal(codex.scope, "personal");
  assert.equal(codex.risk, "medium");
  assert.ok(codex.writes > 0);
  assert.match(codex.checksum, /^sha256-/);
  assert.equal(codex.checksumStatus, "calculated");
  assert.deepEqual(codex.bridgeFiles, ["AGENTS.md", "README.md", "bundle.json"]);

  const trae = preview.targets.find((target) => target.id === "trae");

  assert.equal(trae.status, "preview-ready");
  assert.equal(trae.scope, "project");
  assert.deepEqual(trae.bridgeFiles, ["SKILL.md", "README.md", "bundle.json"]);
});

test("passport command prints trust, score, risk conflict, and runtime summary", async () => {
  const { env } = await createIsolatedEnv("packsmith-passport-");
  const { stdout } = await runCli(["passport", "senior-code-reviewer"], { env });

  // PS-1: title, then the risk conflict as the visual focus.
  assert.match(stdout, /PACKSMITH PASSPORT — senior-code-reviewer/);
  assert.match(stdout, /RUNTIME READINESS\s+all targets preview-ready/);
  assert.match(stdout, /^\s+Claude Code$/m);
  assert.match(stdout, /^\s+Codex$/m);
  assert.match(stdout, /^\s+GitHub Copilot$/m);
  assert.match(stdout, /^\s+Cursor$/m);
  assert.match(stdout, /^\s+OpenCode$/m);
  assert.match(stdout, /^\s+TRAE$/m);
  assert.match(stdout, /RISK ASSESSMENT\s+⚠ MEDIUM \(upgraded from declared: low\)/);
  assert.match(stdout, /Why: filesystem: required; network: optional/);
  assert.match(stdout, /Permissions: shell optional, filesystem required, network optional, browser none/);
  assert.match(stdout, /TRUST/);
  assert.match(stdout, /Quality Score\s+\d+\/100/);
  // Checksum keeps its algorithm prefix and the first 12 digest chars (§2.2/§4);
  // the full value stays in --json.
  assert.match(stdout, /Checksum\s+sha256-[0-9a-f]{12}… \(full value in --json\)/);
  // PS-2: redundant fields are gone from the human screen.
  assert.doesNotMatch(stdout, /Checksum Status/);
  assert.doesNotMatch(stdout, /Audit\s+preview-only/);
  // PS-3: the screen ends in an action.
  assert.match(stdout, /NEXT/);
  assert.match(stdout, /packsmith install senior-code-reviewer --target codex --yes/);
  assert.match(stdout, /Trust before install/);
});

test("passport --json emits trust posture with target summary", async () => {
  const { env } = await createIsolatedEnv("packsmith-passport-json-");
  const { stdout } = await runCli(["passport", "senior-code-reviewer", "--json"], { env });
  const passport = JSON.parse(stdout);

  assert.equal(passport.pack.id, "senior-code-reviewer");
  assert.equal(passport.targetSummary.total, 6);
  assert.equal(passport.targetSummary.ready, 6);
  assert.deepEqual(passport.targetSummary.readyTargets, ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"]);
  assert.equal(passport.risk.level, "medium");
  assert.equal(passport.risk.declared, "low");
  assert.match(passport.risk.explanation, /declared low; elevated to medium/);
  assert.equal(passport.score.overall, 95);
  assert.equal(passport.provenance.publisher, "packsmith");
  assert.equal(passport.provenance.verified, true);
  assert.match(passport.provenance.checksum, /^sha256-/);
  assert.equal(passport.permissions.filesystem, "required");
  assert.equal(passport.audit.status, "preview-only");
  // PS-3: the JSON contract keeps the audit field for machines, and reports
  // what is already on disk so a repeat install is visible before it happens.
  assert.deepEqual(passport.installed, []);
});

test("passport reports an existing install instead of claiming nothing is installed", async () => {
  const { homeDir, env } = await createIsolatedEnv("packsmith-passport-installed-");

  const fresh = await runCli(["passport", "senior-code-reviewer"], { env });
  assert.match(fresh.stdout, /NOT INSTALLED on any target/);

  await mkdir(path.join(homeDir, ".codex", "skills"), { recursive: true });
  await runCli(["install", "senior-code-reviewer", "--target", "codex", "--yes"], { env });

  const installed = await runCli(["passport", "senior-code-reviewer"], { env });
  assert.match(installed.stdout, /INSTALLED on 1 target/);
  assert.match(installed.stdout, /Codex 0\.1\.0 -> /);
  assert.doesNotMatch(installed.stdout, /NOT INSTALLED/);

  const payload = JSON.parse((await runCli(["passport", "senior-code-reviewer", "--json"], { env })).stdout);
  assert.equal(payload.installed.length, 1);
  assert.equal(payload.installed[0].target, "codex");
});

test("install plan command emits a preview plan without writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-plan-command-"));
  const packDir = path.join(tempRoot, "plan-command-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "plan-command-pack" });

  const { stdout } = await runCli(["install", "plan", packDir, "--target", "codex", "--json"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const plan = JSON.parse(stdout);

  assert.equal(plan.pack.id, "plan-command-pack");
  assert.equal(plan.targets[0].target, "codex");
  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "plan-command-pack")));

  const human = await runCli(["install", "plan", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(human.stdout, /Install plan for plan-command-pack/);
  assert.doesNotMatch(human.stdout, /Dry run for plan-command-pack/);
});

test("install command installs a registry pack id", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-registry-"));
  const packDir = path.join(tempRoot, "senior-code-reviewer");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "senior-code-reviewer" });
  await mkdir(path.join(homeDir, ".claude", "skills"), { recursive: true });
  await writeRegistry(catalogPath, [
    {
      id: "senior-code-reviewer",
      name: "Senior Code Reviewer",
      description: "Finds bugs, regressions, missing tests, and risky changes.",
      version: "0.1.0",
      targets: ["claude-code", "codex"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);

  const result = await runCli(["install", "senior-code-reviewer", "--registry", catalogPath], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(result.stdout, /Installed senior-code-reviewer/);
  assert.match(result.stdout, /Claude Code: installed/);
  assert.match(result.stdout, /Ask Claude Code: Use senior-code-reviewer to review my current changes\./);
  await stat(path.join(homeDir, ".claude", "skills", "senior-code-reviewer", "README.md"));
});

test("install command prints a generic next prompt for non-review packs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-next-prompt-"));
  const packDir = path.join(tempRoot, "docs-maintainer");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, {
    name: "docs-maintainer",
    description: "Keeps README, changelog, examples, and command docs aligned with implementation."
  });
  await writeRegistry(catalogPath, [
    {
      id: "docs-maintainer",
      name: "Docs Maintainer",
      description: "Keeps README, changelog, examples, and command docs aligned with implementation.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);

  const result = await runCli(["install", "docs-maintainer", "--registry", catalogPath, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(result.stdout, /Ask Codex: Use docs-maintainer when this task matches its workflow\./);
  assert.doesNotMatch(result.stdout, /review my current changes/);
});

test("install --json reports the real install result after writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-json-"));
  const packDir = path.join(tempRoot, "json-installed-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "json-installed-pack" });

  const { stdout } = await runCli(["install", packDir, "--target", "codex", "--json"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const payload = JSON.parse(stdout);

  assert.equal(payload.manifest.name, "json-installed-pack");
  assert.equal(payload.dryRun, false);
  assert.equal(payload.installed[0].target, "codex");
  assert.equal(payload.plan.pack.id, "json-installed-pack");
  await stat(path.join(homeDir, ".codex", "skills", "json-installed-pack", "AGENTS.md"));
});

test("registry install blocks checksum mismatches before writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-checksum-"));
  const packDir = path.join(tempRoot, "checksum-block-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "checksum-block-pack", targets: ["codex"] });
  await writeRegistry(catalogPath, [
    {
      id: "checksum-block-pack",
      name: "Checksum Block Pack",
      description: "Pack with a bad registry checksum.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir,
      checksum: "sha256-this-does-not-match"
    }
  ]);

  await assert.rejects(
    runCli(["install", "checksum-block-pack", "--registry", catalogPath, "--target", "codex"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) =>
      // §4 checksum-drift template: conclusion + cause + fix, and no stack trace.
      error.stderr.includes("✗ install blocked: checksum mismatch for checksum-block-pack") &&
      error.stderr.includes("the pack source changed after the registry recorded it") &&
      error.stderr.includes("fix: verify the source") &&
      !error.stderr.includes("at installPack")
  );

  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "checksum-block-pack")));
});

test("install --policy rejects disallowed packs before writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-policy-"));
  const packDir = path.join(tempRoot, "blocked-install-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const policyPath = path.join(tempRoot, "policy.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "blocked-install-pack", targets: ["codex"] });
  await writeRegistry(catalogPath, [
    {
      id: "blocked-install-pack",
      name: "Blocked Install Pack",
      description: "Pack blocked by install policy.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      publisher: {
        id: "packsmith",
        verified: true
      },
      verified: true,
      source: packDir
    }
  ]);
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        allowedPacks: ["some-other-pack"],
        allowedRegistries: [catalogPath],
        allowedPublishers: ["packsmith"],
        allowedTargets: ["codex"],
        allowedRequiredPermissions: ["filesystem"],
        maxRisk: "low",
        requiredVerified: true
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    runCli(["install", "blocked-install-pack", "--registry", catalogPath, "--target", "codex", "--policy", policyPath], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => error.stderr.includes("Policy blocked install") && error.stderr.includes("not in allowedPacks")
  );

  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "blocked-install-pack")));
});

test("install --policy defaults required permissions to filesystem before writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-policy-default-"));
  const packDir = path.join(tempRoot, "required-shell-network-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const policyPath = path.join(tempRoot, "policy.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "required-shell-network-pack",
    targets: ["codex"],
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "required",
      browser: "required"
    }
  });
  await writeRegistry(catalogPath, [
    {
      id: "required-shell-network-pack",
      name: "Required Shell Network Pack",
      description: "Pack requiring shell and network access.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);
  await writeFile(policyPath, JSON.stringify({ maxRisk: "high" }, null, 2), "utf8");

  await assert.rejects(
    runCli(
      [
        "install",
        "required-shell-network-pack",
        "--registry",
        catalogPath,
        "--target",
        "codex",
        "--allow-risk",
        "high",
        "--policy",
        policyPath
      ],
      {
        env: {
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir
        }
      }
    ),
    (error) =>
      error.stderr.includes("permission shell: required is not allowed") &&
      error.stderr.includes("permission network: required is not allowed") &&
      error.stderr.includes("permission browser: required is not allowed") &&
      error.stderr.includes("Allowed required permissions: filesystem")
  );

  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "required-shell-network-pack")));
});

test("install command installs OpenCode, Cursor, GitHub Copilot, and TRAE target bundles", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-four-targets-"));
  const packDir = path.join(tempRoot, "portable-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "portable-pack",
    targets: ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"]
  });

  const opencode = await runCli(["install", packDir, "--target", "opencode"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const cursor = await runCli(["install", packDir, "--target", "cursor"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const copilot = await runCli(["install", packDir, "--target", "github-copilot", "--scope", "project"], {
    cwd: tempRoot,
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const traeProject = await runCli(["install", packDir, "--target", "trae", "--scope", "project"], {
    cwd: tempRoot,
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const traeCliProject = await runCli(["install", packDir, "--target", "trae", "--scope", "cli-project"], {
    cwd: tempRoot,
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(opencode.stdout, /OpenCode: installed/);
  assert.match(cursor.stdout, /Cursor: installed/);
  assert.match(copilot.stdout, /GitHub Copilot: installed/);
  assert.match(traeProject.stdout, /TRAE: installed/);
  assert.match(traeCliProject.stdout, /TRAE: installed/);
  await stat(path.join(homeDir, ".opencode", "skills", "portable-pack", "PACKSMITH.md"));
  await stat(path.join(homeDir, ".cursor", "rules", "packsmith", "portable-pack", "portable-pack.mdc"));
  await stat(path.join(tempRoot, ".github", "skills", "portable-pack", "SKILL.md"));
  await stat(path.join(tempRoot, ".trae", "skills", "portable-pack", "SKILL.md"));
  await stat(path.join(tempRoot, ".traecli", "skills", "portable-pack", "SKILL.md"));
});

test("targets command shows support status, scope, default paths, and warnings", async () => {
  const { stdout } = await runCli(["targets", "--json"]);
  const payload = JSON.parse(stdout);
  const copilot = payload.targets.find((target) => target.id === "github-copilot");
  const trae = payload.targets.find((target) => target.id === "trae");
  const gemini = payload.targets.find((target) => target.id === "gemini-cli");

  assert.equal(copilot.status, "supported");
  assert.ok(copilot.scopes.includes("project"));
  assert.match(copilot.defaultInstallRoots.project, /\.github[/\\]skills/);
  assert.equal(trae.status, "supported");
  assert.deepEqual(trae.scopes, ["project", "cli-project", "personal"]);
  assert.match(trae.defaultInstallRoots.project, /\.trae[/\\]skills/);
  assert.match(trae.defaultInstallRoots["cli-project"], /\.traecli[/\\]skills/);
  assert.match(trae.defaultInstallRoots.personal, /\.trae-cn[/\\]skills/);
  assert.deepEqual(trae.bridgeFiles, ["SKILL.md", "README.md", "bundle.json"]);
  assert.equal(gemini.status, "planned");
});

test("targets command prints every scoped default path", async () => {
  const { stdout } = await runCli(["targets"]);

  assert.match(stdout, /GitHub Copilot \(github-copilot\)/);
  assert.match(stdout, /Default paths:/);
  assert.match(stdout, /project: .*\.github[/\\]skills/);
  assert.match(stdout, /personal: .*\.copilot[/\\]skills/);
  assert.match(stdout, /TRAE \(trae\)/);
  assert.match(stdout, /cli-project: .*\.traecli[/\\]skills/);
  assert.match(stdout, /personal: .*\.trae-cn[/\\]skills/);
});

test("parallel install dry-runs do not race on the build cache", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-parallel-"));
  const packDir = path.join(tempRoot, "parallel-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "parallel-pack", targets: ["claude-code", "codex", "opencode", "cursor"] });

  for (let index = 0; index < 120; index += 1) {
    await writeFile(
      path.join(packDir, "skills", "review", `note-${index}.md`),
      `Parallel cache note ${index}\n\nThis file makes the source pack large enough to expose shared build-cache races.\n`,
      "utf8"
    );
  }

  const runs = ["claude-code", "codex", "opencode", "cursor"].map((target) =>
    runCli(["install", packDir, "--target", target, "--dry-run"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    })
  );

  const results = await Promise.all(runs);

  assert.equal(results.length, 4);
  assert.ok(results.every((result) => result.stdout.includes("Dry run for parallel-pack")));
});

test("publish --dry-run validates a source pack and prints registry submission metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-publish-"));
  const packDir = path.join(tempRoot, "publishable-pack");

  await writePack(packDir, { name: "publishable-pack", targets: ["claude-code", "codex", "opencode", "cursor"] });

  const { stdout } = await runCli(["publish", packDir, "--dry-run"]);

  assert.match(stdout, /Publish dry run: publishable-pack@0\.1\.0/);
  assert.match(stdout, /Registry entry preview/);
  assert.match(stdout, /packsmith registry validate/);
  assert.match(stdout, /"category": "community"/);
  assert.match(stdout, /"license": "MIT"/);
  assert.match(stdout, /"riskLevel": "low"/);
  assert.match(stdout, /"estimatedContextSize": \d+/);
  assert.match(stdout, /"usageExample": "packsmith install publishable-pack"/);
});

test("running packsmith without a command opens the interactive browser entry", async () => {
  const { stdout } = await runCli([], {
    env: {
      PACKSMITH_TUI_SCRIPT: "4,senior-code-reviewer,,Y,q"
    }
  });

  assert.match(stdout, /Packsmith Interactive/);
  assert.match(stdout, /Browse registry/);
  assert.match(stdout, /Target \(claude-code\/codex\/github-copilot\/opencode\/cursor\/trae, blank to auto-detect\):/);
  assert.match(stdout, /Install plan for senior-code-reviewer/);
  assert.match(stdout, /Trust:/);
  assert.match(stdout, /Goodbye/);
});

test("running packsmith without a command prints help in non-interactive shells", async () => {
  const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PACKSMITH_TUI_SCRIPT: ""
    },
    timeout: 1500
  });

  assert.match(stdout, /Usage:/);
  assert.match(stdout, /packsmith search <query>/);
  assert.doesNotMatch(stdout, /Packsmith Interactive/);
});

test("sync restores registry installs with sources relative to the catalog", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-sync-registry-"));
  const packDir = path.join(tempRoot, "packs", "relative-registry-pack");
  const catalogPath = path.join(tempRoot, "registry", "catalog.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "relative-registry-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await writeRegistry(catalogPath, [
    {
      id: "relative-registry-pack",
      name: "Relative Registry Pack",
      description: "Pack installed from a catalog-relative source.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: "../packs/relative-registry-pack"
    }
  ]);

  await runCli(["install", "relative-registry-pack", "--registry", catalogPath, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await rm(path.join(homeDir, ".codex", "skills", "relative-registry-pack"), { recursive: true, force: true });

  const { stdout } = await runCli(["sync"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /relative-registry-pack/);
  assert.match(stdout, /synced|already current/i);
  await stat(path.join(homeDir, ".codex", "skills", "relative-registry-pack", "AGENTS.md"));
});

test("update resolves installed registry sources relative to the stored catalog path", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-update-registry-"));
  const packDir = path.join(tempRoot, "packs", "relative-update-pack");
  const catalogPath = path.join(tempRoot, "registry", "catalog.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "relative-update-pack", targets: ["codex"] });
  await writeRegistry(catalogPath, [
    {
      id: "relative-update-pack",
      name: "Relative Update Pack",
      description: "Pack updated from a catalog-relative source.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: "../packs/relative-update-pack"
    }
  ]);

  await runCli(["install", "relative-update-pack", "--registry", catalogPath, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  const { stdout } = await runCli(["update", "relative-update-pack"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /relative-update-pack/);
  assert.doesNotMatch(stdout, /source unavailable/i);
  assert.match(stdout, /already current|updated/i);
});

test("install command detects existing agent directories before falling back to the first supported target", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-detect-"));
  const packDir = path.join(tempRoot, "multi-agent-pack");
  const detectedHome = path.join(tempRoot, "detected-home");
  const fallbackHome = path.join(tempRoot, "fallback-home");
  const detectedState = path.join(tempRoot, "detected-state");
  const fallbackState = path.join(tempRoot, "fallback-state");

  await writePack(packDir, { name: "multi-agent-pack" });
  await mkdir(path.join(detectedHome, ".codex", "skills"), { recursive: true });

  const detected = await runCli(["install", packDir], {
    env: {
      PACKSMITH_HOME: detectedState,
      PACKSMITH_TEST_HOME: detectedHome
    }
  });
  const fallback = await runCli(["install", packDir], {
    env: {
      PACKSMITH_HOME: fallbackState,
      PACKSMITH_TEST_HOME: fallbackHome
    }
  });

  assert.match(detected.stdout, /Codex: installed/);
  assert.doesNotMatch(detected.stdout, /Claude Code: installed/);
  await stat(path.join(detectedHome, ".codex", "skills", "multi-agent-pack", "AGENTS.md"));
  assert.match(fallback.stdout, /Claude Code: installed/);
  await stat(path.join(fallbackHome, ".claude", "skills", "multi-agent-pack", "README.md"));
});

test("installPack lets a selector choose one target when multiple agents are detected", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-select-"));
  const packDir = path.join(tempRoot, "selectable-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const selections = [];

  await writePack(packDir, { name: "selectable-pack" });
  await mkdir(path.join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(path.join(homeDir, ".codex", "skills"), { recursive: true });

  const result = await installPack(packDir, {
    homeDir,
    stateDir,
    selectTargets(targets) {
      selections.push(targets);
      return ["codex"];
    }
  });

  assert.deepEqual(selections, [["claude-code", "codex"]]);
  assert.deepEqual(
    result.installed.map((entry) => entry.target),
    ["codex"]
  );
  await stat(path.join(homeDir, ".codex", "skills", "selectable-pack", "AGENTS.md"));
  await assert.rejects(stat(path.join(homeDir, ".claude", "skills", "selectable-pack")));
});

test("list, remove, update, and sync manage installed packs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-installed-lifecycle-"));
  const packDir = path.join(tempRoot, "senior-code-reviewer");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "senior-code-reviewer" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });

  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  const listed = await runCli(["list"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const updated = await runCli(["update"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(listed.stdout, /senior-code-reviewer/);
  assert.match(listed.stdout, /codex/);
  assert.match(updated.stdout, /senior-code-reviewer/);
  assert.match(updated.stdout, /already current|updated/i);

  await rm(path.join(homeDir, ".codex", "skills", "senior-code-reviewer"), { recursive: true, force: true });
  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "senior-code-reviewer", "AGENTS.md")));

  const synced = await runCli(["sync"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(synced.stdout, /Sync results/);
  assert.match(synced.stdout, /senior-code-reviewer/);
  assert.match(synced.stdout, /synced|already current/i);
  await stat(path.join(homeDir, ".codex", "skills", "senior-code-reviewer", "AGENTS.md"));

  const removed = await runCli(["remove", "senior-code-reviewer"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(removed.stdout, /Removed senior-code-reviewer/);
  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "senior-code-reviewer")));
});

test("pin command marks an installed pack and update skips pinned entries", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-pin-"));
  const packDir = path.join(tempRoot, "pinned-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "pinned-pack" });
  await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  const pinned = await runCli(["pin", "pinned-pack"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const lockfile = await readJson(path.join(stateDir, "packsmith.lock"));
  const updated = await runCli(["update"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(pinned.stdout, /Pinned pinned-pack/);
  assert.equal(lockfile.installed[0].pinned, true);
  assert.match(updated.stdout, /pinned, skipped/);
});

test("quiet install emits no success chatter while still writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-quiet-"));
  const packDir = path.join(tempRoot, "quiet-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "quiet-pack" });

  const installed = await runCli(["install", packDir, "--target", "codex", "--quiet"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.equal(installed.stdout, "");
  await stat(path.join(homeDir, ".codex", "skills", "quiet-pack", "AGENTS.md"));
});

test("sync --policy exits non-zero when the synchronized install violates policy", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-sync-policy-"));
  const packDir = path.join(tempRoot, "sync-policy-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, { name: "sync-policy-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requireVerified: true,
        allowedRequiredPermissions: ["filesystem"]
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    runCli(["sync", "--policy", policyPath], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) =>
      error.code === 1 &&
      error.stdout.includes("Sync results") &&
      error.stdout.includes("Policy violations") &&
      error.stdout.includes("requires unverified pack")
  );
});

test("doctor runs the v0.2 reliability gate over a pack workspace", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-"));
  const packDir = path.join(tempRoot, "doctor-pack");

  await writePack(packDir, {
    name: "doctor-pack",
    targets: ["claude-code", "gemini-cli"],
    promptText: "Do the thing."
  });

  const { stdout } = await runCli(["doctor", packDir]);

  assert.match(stdout, /^Packsmith Doctor\n/);
  assert.match(stdout, /review\n/);
  assert.match(stdout, /✓ Agent Skills specification/);
  assert.match(stdout, /✓ Claude Code/);
  assert.match(stdout, /✓ Codex/);
  assert.match(stdout, /0 warnings · 0 errors/);
  assert.match(stdout, /\nPASS\n?$/);
});

test("score reports registry pack quality as JSON", async () => {
  const { stdout } = await runCli(["score", "senior-code-reviewer", "--json"]);
  const score = JSON.parse(stdout);

  assert.equal(score.pack, "senior-code-reviewer");
  assert.equal(score.source, "registry");
  assert.equal(score.overall, 95);
  assert.equal(score.dimensions.instructionSafety, 100);
  assert.equal(score.dimensions.portability, 100);
  assert.equal(score.context.tokenPressure, "low");
});

test("score reports a concise human summary for local pack directories", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-score-"));
  const packDir = path.join(tempRoot, "score-pack");

  await writePack(packDir, { name: "score-pack" });

  const { stdout } = await runCli(["score", packDir]);

  assert.match(stdout, /Packsmith Score: score-pack/);
  assert.match(stdout, /Overall: \d+\/100/);
  assert.match(stdout, /Context: \d+ chars, low pressure/);
  assert.match(stdout, /Portability: Claude Code, Codex/);
});

test("high risk registry installs require explicit risk acknowledgement", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-high-risk-"));
  const packDir = path.join(tempRoot, "danger-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "danger-pack",
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "required",
      browser: "required"
    }
  });
  await writeRegistry(catalogPath, [
    {
      id: "danger-pack",
      name: "Danger Pack",
      description: "High-risk pack that needs explicit acknowledgement.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir,
      riskLevel: "high"
    }
  ]);

  await assert.rejects(
    runCli(["install", "danger-pack", "--registry", catalogPath, "--target", "codex", "--yes"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => error.stderr.includes("High-risk pack") && error.stderr.includes("--allow-risk high")
  );

  const installed = await runCli(
    ["install", "danger-pack", "--registry", catalogPath, "--target", "codex", "--yes", "--allow-risk", "high"],
    {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }
  );

  assert.match(installed.stdout, /Installed danger-pack/);
});

test("official high-risk risk-probe pack is blocked by default install gate", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-risk-probe-blocked-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const env = {
    ...process.env,
    PACKSMITH_HOME: stateDir,
    PACKSMITH_TEST_HOME: homeDir,
    NO_COLOR: "1"
  };

  await assert.rejects(
    runCli(["install", "risk-probe", "--target", "codex", "--yes"], { env }),
    (error) => error.stderr.includes("High-risk pack") && error.stderr.includes("--allow-risk high")
  );

  await assert.rejects(stat(path.join(homeDir, ".codex", "skills", "risk-probe")));
});

test("official high-risk risk-probe pack installs with --allow-risk high", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-risk-probe-allowed-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const env = {
    ...process.env,
    PACKSMITH_HOME: stateDir,
    PACKSMITH_TEST_HOME: homeDir,
    NO_COLOR: "1"
  };

  const installed = await runCli(
    ["install", "risk-probe", "--target", "codex", "--yes", "--allow-risk", "high"],
    { env }
  );

  assert.match(installed.stdout, /Installed risk-probe/);
});

test("registry risk cannot be downgraded below manifest permissions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-risk-downgrade-"));
  const packDir = path.join(tempRoot, "danger-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "danger-pack",
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "required",
      browser: "required"
    }
  });
  await writeRegistry(catalogPath, [
    {
      id: "danger-pack",
      name: "Danger Pack",
      description: "Low-declared registry entry that still requires high risk.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir,
      riskLevel: "low"
    }
  ]);

  const plan = await previewInstallPlan("danger-pack", { registry: catalogPath, target: "codex" });

  assert.equal(plan.risk.level, "high");
  assert.match(plan.risk.reasons.join(" | "), /shell|network|registry declares low risk/);

  await assert.rejects(
    runCli(["install", "danger-pack", "--registry", catalogPath, "--target", "codex", "--yes"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => error.stderr.includes("--allow-risk high")
  );

  const installed = await runCli(
    ["install", "danger-pack", "--registry", catalogPath, "--target", "codex", "--yes", "--allow-risk", "high"],
    {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }
  );

  assert.match(installed.stdout, /Installed danger-pack/);
});

test("registry validate rejects invalid risk levels", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-registry-risk-"));
  const packDir = path.join(tempRoot, "safe-pack");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "safe-pack" });
  await writeRegistry(catalogPath, [
    {
      id: "safe-pack",
      name: "Safe Pack",
      description: "Pack with an invalid risk level in the registry.",
      version: "0.1.0",
      targets: ["claude-code"],
      author: "packsmith",
      verified: true,
      source: packDir,
      riskLevel: "banana"
    }
  ]);

  await assert.rejects(
    runCli(["registry", "validate", "--registry", catalogPath]),
    (error) => error.stderr.includes("riskLevel must be one of")
  );
});

test("generate-examples.mjs parses with node --check", async () => {
  await execFileAsync(process.execPath, ["--check", path.join(repoRoot, "scripts", "generate-examples.mjs")]);
});

test("audit reports checksum mismatches for installed packs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-"));
  const packDir = path.join(tempRoot, "security-pass");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "security-pass",
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "optional",
      browser: "none"
    }
  });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(path.join(homeDir, ".codex", "skills", "security-pass", "tampered.txt"), "changed", "utf8");

  const { stdout } = await runCli(["audit"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /security-pass/);
  assert.match(stdout, /checksum mismatch/i);
  assert.match(stdout, /shell: required/);
});

test("audit reports available updates from local registry metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-update-"));
  const packDir = path.join(tempRoot, "update-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const catalogPath = path.join(tempRoot, "catalog.json");

  await writePack(packDir, { name: "update-pack", version: "0.1.0" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await writeRegistry(catalogPath, [
    {
      id: "update-pack",
      name: "Update Pack",
      description: "Pack with an available catalog update.",
      version: "0.1.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);
  await runCli(["install", "update-pack", "--registry", catalogPath, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeRegistry(catalogPath, [
    {
      id: "update-pack",
      name: "Update Pack",
      description: "Pack with an available catalog update.",
      version: "0.2.0",
      targets: ["codex"],
      author: "packsmith",
      verified: true,
      source: packDir
    }
  ]);

  const { stdout } = await runCli(["audit"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /Update: available 0\.2\.0/);
});

test("audit reports source checksum mismatch recorded in the lockfile", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-source-checksum-"));
  const packDir = path.join(tempRoot, "checksum-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "checksum-pack" });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  const lockfilePath = path.join(stateDir, "packsmith.lock");
  const lockfile = await readJson(lockfilePath);
  lockfile.installed[0].sourceChecksum = "sha256-not-the-source";
  await writeFile(lockfilePath, JSON.stringify(lockfile, null, 2), "utf8");

  const { stdout } = await runCli(["audit"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /source checksum mismatch/i);
});

test("audit --ci exits non-zero when installed packs have warnings", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-ci-"));
  const packDir = path.join(tempRoot, "ci-security-pass");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "ci-security-pass" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(path.join(homeDir, ".codex", "skills", "ci-security-pass", "tampered.txt"), "changed", "utf8");

  await assert.rejects(
    runCli(["audit", "--ci"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => error.code === 1 && error.stdout.includes("checksum mismatch")
  );
});

test("audit --json outputs envelope with schemaVersion/ok and preserves results", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-json-"));
  const packDir = path.join(tempRoot, "json-audit-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "json-audit-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  const { stdout } = await runCli(["audit", "--json"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ok, true);
  assert.ok(typeof payload.stateDir === "string");
  assert.ok(payload.results && Array.isArray(payload.results));
  assert.ok(payload.results.length > 0);
  // results internal structure preserved
  assert.ok(payload.results[0].pack);
  assert.ok(payload.results[0].status);
});

test("audit --ci --json exits non-zero but stdout remains valid JSON envelope", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-ci-json-"));
  const packDir = path.join(tempRoot, "ci-json-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, { name: "ci-json-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(path.join(homeDir, ".codex", "skills", "ci-json-pack", "tampered.txt"), "changed", "utf8");

  await assert.rejects(
    runCli(["audit", "--ci", "--json"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => {
      assert.equal(error.code, 1, "exit code should be 1");
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.schemaVersion, 1);
      assert.equal(payload.ok, true); // envelope ok=true means command executed successfully
      assert.ok(payload.results.some((r) => r.status !== "ok"), "should have non-ok results");
      return true;
    }
  );
});

test("audit --policy reports blocked packs and risky permissions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-policy-"));
  const packDir = path.join(tempRoot, "policy-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, {
    name: "policy-pack",
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "optional",
      browser: "none"
    }
  });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requireVerified: true,
        blockedPacks: ["policy-pack"],
        allowedRequiredPermissions: ["filesystem"]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await runCli(["audit", "--policy", policyPath], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /Policy:/);
  assert.match(stdout, /blocked by policy/);
  assert.match(stdout, /requires unverified pack/);
  assert.match(stdout, /permission shell: required is not allowed/);
});

test("audit --policy defaults required permissions to filesystem", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-policy-default-"));
  const packDir = path.join(tempRoot, "audit-required-network-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, {
    name: "audit-required-network-pack",
    targets: ["codex"],
    permissions: {
      shell: "required",
      filesystem: "required",
      network: "required",
      browser: "required"
    }
  });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(policyPath, JSON.stringify({ maxRisk: "high" }, null, 2), "utf8");

  const { stdout } = await runCli(["audit", "--policy", policyPath], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /permission shell: required is not allowed/);
  assert.match(stdout, /permission network: required is not allowed/);
  assert.match(stdout, /permission browser: required is not allowed/);
  assert.match(stdout, /Allowed required permissions: filesystem/);
});

test("audit --policy --ci exits non-zero for policy violations", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-policy-ci-"));
  const packDir = path.join(tempRoot, "unverified-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, { name: "unverified-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await runCli(["install", packDir, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requireVerified: true
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    runCli(["audit", "--policy", policyPath, "--ci"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    }),
    (error) => error.code === 1 && error.stdout.includes("requires unverified pack")
  );
});

test("audit --policy enforces allowed registries and publishers", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-publisher-policy-"));
  const packDir = path.join(tempRoot, "publisher-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, { name: "publisher-pack" });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await writeRegistry(catalogPath, [
    {
      id: "publisher-pack",
      name: "Publisher Pack",
      description: "Pack with registry author metadata.",
      version: "0.1.0",
      targets: ["codex"],
      author: "unknown-publisher",
      verified: true,
      source: packDir
    }
  ]);
  await runCli(["install", "publisher-pack", "--registry", catalogPath, "--target", "codex"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        allowedRegistries: [path.join(tempRoot, "other-catalog.json")],
        allowedPublishers: ["packsmith"],
        allowedRequiredPermissions: ["filesystem"]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await runCli(["audit", "--policy", policyPath], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  assert.match(stdout, /registry is not allowed/);
  assert.match(stdout, /publisher "unknown-publisher" is not allowed/);
});

test("audit --policy allows the original remote registry URL after refresh caching", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-remote-policy-"));
  const packDir = path.join(tempRoot, "remote-policy-pack");
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const policyPath = path.join(tempRoot, "policy.json");

  await writePack(packDir, { name: "remote-policy-pack", targets: ["codex"] });

  const catalog = {
    schemaVersion: 1,
    updatedAt: "2026-05-25T00:00:00.000Z",
    packs: [
      {
        id: "remote-policy-pack",
        name: "Remote Policy Pack",
        description: "Pack installed from a cached remote registry.",
        version: "0.1.0",
        targets: ["codex"],
        author: "packsmith",
        publisher: {
          id: "packsmith",
          verified: true
        },
        verified: true,
        category: "code-quality",
        tags: ["remote"],
        source: packDir,
        license: "MIT",
        riskLevel: "low",
        estimatedContextSize: 1200,
        usageExample: "packsmith install remote-policy-pack",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]
  };

  await withJsonServer({ "/catalog.json": catalog }, async (origin) => {
    const remoteUrl = `${origin}/catalog.json`;

    await runCli(["registry", "add", "remote-policy", remoteUrl, "--state-dir", stateDir]);
    await runCli(["registry", "use", "remote-policy", "--state-dir", stateDir]);
    await runCli(["registry", "refresh", "--state-dir", stateDir]);
    await runCli(["install", "remote-policy-pack", "--state-dir", stateDir, "--target", "codex", "--yes"], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    });
    await writeFile(
      policyPath,
      JSON.stringify(
        {
          requiredVerified: true,
          allowedRegistries: [remoteUrl],
          allowedPublishers: ["packsmith"],
          allowedRequiredPermissions: ["filesystem"],
          allowedTargets: ["codex"],
          maxRisk: "low"
        },
        null,
        2
      ),
      "utf8"
    );

    const { stdout } = await runCli(["audit", "--policy", policyPath], {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir
      }
    });

    assert.match(stdout, /Remote Policy Pack|remote-policy-pack/);
    assert.doesNotMatch(stdout, /registry is not allowed/);
    assert.match(stdout, /Status: ok/);
  });
});

test("policy validate accepts the example policy", async () => {
  const { stdout } = await runCli(["policy", "validate", "examples/policy.json"]);

  assert.match(stdout, /Policy valid/);
  assert.match(stdout, /examples[/\\]policy\.json/);
});

test("policy validate prints the effective required permission gate", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-policy-default-"));
  const policyPath = path.join(tempRoot, "policy.json");

  await writeFile(policyPath, JSON.stringify({ requireVerified: true }, null, 2), "utf8");

  const { stdout } = await runCli(["policy", "validate", policyPath]);

  assert.match(stdout, /Policy valid/);
  assert.match(stdout, /Allowed required permissions: filesystem/);
  assert.match(stdout, /Required permissions outside this set are blocked before install and during audit/);
});

test("policy validate accepts productization policy fields", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-policy-product-"));
  const policyPath = path.join(tempRoot, "policy.json");

  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requiredVerified: true,
        allowedRegistries: ["https://example.com/catalog.json"],
        allowedPublishers: ["packsmith"],
        allowedPacks: ["senior-code-reviewer"],
        blockedPacks: ["danger-pack"],
        allowedPermissions: ["filesystem"],
        maxRisk: "medium",
        allowedTargets: ["codex", "github-copilot"]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await runCli(["policy", "validate", policyPath]);

  assert.match(stdout, /Policy valid/);
});

test("policy validate rejects invalid policy shapes and missing registries", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-policy-validate-"));
  const policyPath = path.join(tempRoot, "policy.json");

  await writeFile(
    policyPath,
    JSON.stringify(
      {
        requireVerified: "yes",
        allowedRegistries: ["missing-catalog.json"],
        allowedPublishers: ["packsmith", 7],
        blockedPacks: "senior-code-reviewer",
        allowedRequiredPermissions: ["filesystem", "telepathy"]
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    runCli(["policy", "validate", policyPath]),
    (error) =>
      error.stderr.includes("requireVerified must be a boolean") &&
      error.stderr.includes("allowedRegistries entry not found") &&
      error.stderr.includes("allowedPublishers must contain only strings") &&
      error.stderr.includes("blockedPacks must be an array") &&
      error.stderr.includes("Unknown permission")
  );
});

test("trust docs explain the default required permission policy", async () => {
  const trustDoc = await readFile(path.join(repoRoot, "docs", "trust-and-audit.md"), "utf8");

  assert.match(trustDoc, /default allows only `filesystem` as a required permission/i);
  assert.match(trustDoc, /required `shell`, `network`, and `browser` permissions are blocked/i);
});

test("buildPack produces deterministic output for identical sources", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-build-deterministic-"));
  const packDir = path.join(tempRoot, "deterministic-pack");

  await writePack(packDir, { name: "deterministic-pack", targets: ["claude-code", "codex"] });

  const first = await buildPack(packDir, path.join(tempRoot, "dist-1"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const second = await buildPack(packDir, path.join(tempRoot, "dist-2"));

  assert.equal(await hashDirectoryForTest(first.outputRoot), await hashDirectoryForTest(second.outputRoot));
});

test("update reinstalls a high-risk pack without re-prompting for risk", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-update-highrisk-"));
  const packDir = path.join(tempRoot, "danger-update-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "danger-update-pack",
    targets: ["codex"],
    permissions: { shell: "required", filesystem: "required", network: "required", browser: "none" }
  });

  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: { PACKSMITH_HOME: stateDir, PACKSMITH_TEST_HOME: homeDir }
  });

  const updated = await runCli(["update"], {
    env: { PACKSMITH_HOME: stateDir, PACKSMITH_TEST_HOME: homeDir }
  });

  assert.match(updated.stdout, /danger-update-pack/);
  assert.match(updated.stdout, /already current|updated/i);
  assert.doesNotMatch(updated.stdout, /error:/i);
  assert.doesNotMatch(updated.stdout, /allow-risk/i);
});

test("sync restores a high-risk pack without re-prompting for risk", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-sync-highrisk-"));
  const packDir = path.join(tempRoot, "danger-sync-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  await writePack(packDir, {
    name: "danger-sync-pack",
    targets: ["codex"],
    permissions: { shell: "required", filesystem: "required", network: "required", browser: "none" }
  });

  await runCli(["install", packDir, "--target", "codex", "--allow-risk", "high"], {
    env: { PACKSMITH_HOME: stateDir, PACKSMITH_TEST_HOME: homeDir }
  });
  await rm(path.join(homeDir, ".codex", "skills", "danger-sync-pack"), { recursive: true, force: true });

  const synced = await runCli(["sync"], {
    env: { PACKSMITH_HOME: stateDir, PACKSMITH_TEST_HOME: homeDir }
  });

  assert.match(synced.stdout, /danger-sync-pack/);
  assert.match(synced.stdout, /synced|already current/i);
  assert.doesNotMatch(synced.stdout, /error:/i);
  await stat(path.join(homeDir, ".codex", "skills", "danger-sync-pack", "AGENTS.md"));
});

test("install rejects GitHub source files that escape the cache directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-github-escape-"));
  const catalogPath = path.join(tempRoot, "catalog.json");
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const escapeTarget = path.join(tempRoot, "escaped.txt");

  const apiRoutes = {
    "/github-api/repos/attacker/repo/contents/packs/evil-pack?ref=main": [
      {
        name: "escaped.txt",
        path: "../../../escaped.txt",
        type: "file",
        download_url: "http://127.0.0.1:1/raw"
      }
    ]
  };

  await withJsonServer(apiRoutes, async (origin) => {
    await writeFile(
      catalogPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          updatedAt: "2026-05-25T00:00:00.000Z",
          packs: [
            {
              id: "evil-pack",
              name: "Evil Pack",
              description: "Pack whose GitHub source tries to escape the cache.",
              version: "0.1.0",
              author: "attacker",
              category: "code-quality",
              tags: ["evil"],
              targets: ["codex"],
              source: {
                type: "github-archive",
                repo: "attacker/repo",
                path: "packs/evil-pack",
                ref: "main",
                commit: "0123456789abcdef0123456789abcdef01234567",
                apiBaseUrl: `${origin}/github-api`
              },
              license: "MIT",
              riskLevel: "low",
              estimatedContextSize: 1200,
              usageExample: "packsmith install evil-pack",
              verified: false,
              updatedAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    await assert.rejects(
      runCli(["install", "evil-pack", "--registry", catalogPath, "--target", "codex", "--yes"], {
        env: {
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir,
          PACKSMITH_ALLOWED_FETCH_HOSTS: "127.0.0.1,localhost"
        }
      }),
      (error) => error.stderr.includes("escapes the download directory")
    );

    await assert.rejects(stat(escapeTarget));
  });
});

test("audit reports dangling references for receipt pointing to missing source/installDir", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-audit-dangling-"));
  const packDir = path.join(tempRoot, "dangling-pack");
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");

  // Create a fake receipt pointing to a non-existent installDir and source
  await mkdir(path.join(stateDir, "receipts"), { recursive: true });
  await writeFile(
    path.join(stateDir, "receipts", "dangling-pack.codex.json"),
    JSON.stringify({
      pack: "dangling-pack",
      version: "0.1.0",
      target: "codex",
      installedAt: "2026-05-24T00:00:00.000Z",
      installDir: path.join(homeDir, ".codex", "skills", "dangling-pack", "missing-dir"),
      source: path.join(packDir, "nonexistent-source"),
      checksum: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceChecksum: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      permissions: { shell: "optional", filesystem: "required", network: "none", browser: "none" }
    }),
    "utf8"
  );

  // Write a minimal lockfile WITH a matching entry so installDir missing is the only issue
  await writeFile(
    path.join(stateDir, "packsmith.lock"),
    JSON.stringify({
      installed: [
        {
          pack: "dangling-pack",
          target: "codex",
          installDir: path.join(homeDir, ".codex", "skills", "dangling-pack", "missing-dir"),
          source: path.join(packDir, "nonexistent-source"),
          checksum: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          sourceChecksum: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }
      ]
    }),
    "utf8"
  );

  const { stdout } = await runCli(["audit"], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir
    }
  });

  // The audit should detect that installDir is missing (dangling reference)
  assert.match(stdout, /dangling-pack/);
  assert.match(stdout, /install directory missing/i);
});

// ---------------------------------------------------------------------------
// Security hardening batch (security-input.md §3 #2/#6, §1 DoS):
// typosquatting warnings, policy maxContextSize, github-archive unpack caps.
// ---------------------------------------------------------------------------

test("edit distance scores transpositions as one edit", () => {
  assert.equal(editDistance("senior-code-reviewer", "senior-code-reveiwer"), 1);
  assert.equal(editDistance("ab", "ba"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("flaw", "lawn"), 2);
  assert.equal(editDistance("same", "same"), 0);
  assert.equal(editDistance("", "abc"), 3);
});

test("findTyposquattingMatches flags near names, ignores exact and far names", () => {
  const known = ["senior-code-reviewer", "security-reviewer", "bug-hunter"];

  assert.deepEqual(findTyposquattingMatches("senior-code-reveiwer", known), [
    { name: "senior-code-reviewer", distance: 1 }
  ]);
  assert.deepEqual(findTyposquattingMatches("senior-code-reviewer", known), []);
  assert.deepEqual(findTyposquattingMatches("completely-different-pack", known), []);
  assert.deepEqual(findTyposquattingMatches("SENIOR-CODE-REVEIWER", known), [
    { name: "senior-code-reviewer", distance: 1 }
  ]);
  assert.deepEqual(findTyposquattingMatches("bug-hunte", known), [
    { name: "bug-hunter", distance: 1 }
  ]);
  assert.deepEqual(findTyposquattingMatches("bug-hunter", known, { maxDistance: 0 }), []);
});

test("preview warns when pack name is one edit from an official catalog pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-typosquat-preview-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "senior-code-reveiwer");
  await writePack(packDir, { name: "senior-code-reveiwer" });

  const { stdout } = await runCli(["preview", packDir, "--target", "claude-code", "--state-dir", stateDir], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir,
      NO_COLOR: "1"
    }
  });

  assert.match(stdout, /WARNING: 疑似 typosquatting/);
  assert.match(stdout, /senior-code-reviewer/);
  assert.match(stdout, /edit distance 1/);
});

test("preview --json exposes the typosquatting advisory list", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-typosquat-json-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "senior-code-reveiwer");
  await writePack(packDir, { name: "senior-code-reveiwer" });

  const { stdout } = await runCli(
    ["preview", packDir, "--json", "--target", "claude-code", "--state-dir", stateDir],
    {
      env: {
        PACKSMITH_HOME: stateDir,
        PACKSMITH_TEST_HOME: homeDir,
        NO_COLOR: "1"
      }
    }
  );

  const plan = JSON.parse(stdout);
  assert.deepEqual(plan.typosquatting, [{ name: "senior-code-reviewer", distance: 1 }]);
});

test("preview does not warn for the exact official pack name", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-typosquat-exact-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "senior-code-reviewer");
  await writePack(packDir, { name: "senior-code-reviewer" });

  const { stdout } = await runCli(["preview", packDir, "--target", "claude-code", "--state-dir", stateDir], {
    env: {
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir,
      NO_COLOR: "1"
    }
  });

  assert.doesNotMatch(stdout, /疑似 typosquatting/);
  const plan = await previewInstallPlan(packDir, { stateDir, homeDir, target: "claude-code" });
  assert.deepEqual(plan.typosquatting, []);
});

test("typosquatting warning also covers names installed locally", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-typosquat-installed-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");

  const originalPackDir = path.join(tempRoot, "zzz-demo-pack");
  await writePack(originalPackDir, { name: "zzz-demo-pack" });
  await installPack(originalPackDir, { stateDir, homeDir, target: "claude-code" });

  const lookalikePackDir = path.join(tempRoot, "zzz-demo-pavk");
  await writePack(lookalikePackDir, { name: "zzz-demo-pavk" });

  const plan = await previewInstallPlan(lookalikePackDir, { stateDir, homeDir, target: "claude-code" });
  assert.deepEqual(plan.typosquatting, [{ name: "zzz-demo-pack", distance: 1 }]);
});

async function writePolicyFile(policyPath, policy) {
  await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");
}

async function addContextEstimate(packDir, estimatedChars) {
  const manifestPath = path.join(packDir, "packsmith.json");
  const manifest = await readJson(manifestPath);
  manifest.context = { estimatedChars };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

test("policy validate accepts numeric maxContextSize and rejects invalid values", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-policy-context-"));
  const policyPath = path.join(tempRoot, "policy.json");

  await writePolicyFile(policyPath, { maxContextSize: 5000 });
  const valid = await validatePolicy(policyPath);
  assert.equal(valid.valid, true);
  assert.equal(valid.policy.maxContextSize, 5000);

  await writePolicyFile(policyPath, { maxContextSize: "6000" });
  const notNumber = await validatePolicy(policyPath);
  assert.equal(notNumber.valid, false);
  assert.match(notNumber.issues.join(" "), /maxContextSize must be a positive finite number/);

  await writePolicyFile(policyPath, { maxContextSize: 0 });
  const notPositive = await validatePolicy(policyPath);
  assert.equal(notPositive.valid, false);
  assert.match(notPositive.issues.join(" "), /maxContextSize must be a positive finite number/);
});

test("policy maxContextSize blocks installs whose estimated context size exceeds the limit", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-context-blocked-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "context-heavy");
  await writePack(packDir, { name: "context-heavy" });
  await addContextEstimate(packDir, 6000);

  const policyPath = path.join(tempRoot, "policy.json");
  await writePolicyFile(policyPath, { maxContextSize: 5000 });

  await assert.rejects(
    installPack(packDir, { stateDir, homeDir, target: "claude-code", policy: policyPath }),
    (error) =>
      /Policy blocked install/.test(error.message) &&
      /context size 6000 chars exceeds policy maxContextSize 5000/.test(error.message)
  );

  const installed = await listInstalledPacks({ stateDir });
  assert.equal(installed.installed.length, 0);
});

test("policy maxContextSize allows installs under the limit and audit stays ok", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-context-allowed-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "context-light");
  await writePack(packDir, { name: "context-light" });
  await addContextEstimate(packDir, 4200);

  const policyPath = path.join(tempRoot, "policy.json");
  await writePolicyFile(policyPath, { maxContextSize: 5000 });

  const result = await installPack(packDir, { stateDir, homeDir, target: "claude-code", policy: policyPath });
  assert.equal(result.dryRun, false);
  assert.equal(result.manifest.name, "context-light");

  const installed = await listInstalledPacks({ stateDir });
  assert.equal(installed.installed.length, 1);

  const audit = await auditInstalledPacks({ stateDir, policy: policyPath });
  assert.equal(audit.results.length, 1);
  assert.equal(audit.results[0].status, "ok");
  assert.deepEqual(audit.results[0].policyIssues, []);
});

test("audit reports packs whose real context size exceeds policy maxContextSize", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-context-audit-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const packDir = path.join(tempRoot, "context-drift");
  const paddedSkill = [
    "---",
    "name: review",
    "description: Review changes when the user asks for risk analysis.",
    "---",
    "",
    "# review",
    "",
    "Context padding. ".repeat(400)
  ].join("\n");
  await writePack(packDir, { name: "context-drift", skillText: paddedSkill });

  // Install without a policy first; the audit then flags the pack.
  await installPack(packDir, { stateDir, homeDir, target: "claude-code" });

  const policyPath = path.join(tempRoot, "policy.json");
  await writePolicyFile(policyPath, { maxContextSize: 5000 });

  const audit = await auditInstalledPacks({ stateDir, policy: policyPath });
  assert.equal(audit.results.length, 1);
  assert.equal(audit.results[0].status, "warning");
  assert.ok(
    audit.results[0].policyIssues.some((issue) =>
      /context size \d+ chars exceeds policy maxContextSize 5000/.test(issue)
    ),
    `expected a maxContextSize policy issue, got: ${JSON.stringify(audit.results[0].policyIssues)}`
  );
  assert.ok(audit.results[0].contextChars > 5000);
});

function mockArchiveFile(pathSuffix, body, declaredSize) {
  return {
    path: `packs/unpack-limit-pack/${pathSuffix}`,
    body,
    ...(declaredSize === undefined ? {} : { declaredSize })
  };
}

function mockArchivePackFiles({ skillText, promptText } = {}) {
  const packManifest = {
    name: "unpack-limit-pack",
    description: "Pack delivered through a mock github-archive source.",
    version: "0.1.0",
    targets: ["claude-code"],
    permissions: { shell: "none", filesystem: "required", network: "none", browser: "none" },
    skills: [
      {
        id: "review",
        path: "skills/review",
        description: "Review changes when the user asks for risk analysis."
      }
    ],
    prompts: [{ id: "launch", path: "prompts/launch.md", description: "Launch the review workflow." }]
  };

  return [
    mockArchiveFile("packsmith.json", Buffer.from(JSON.stringify(packManifest, null, 2), "utf8")),
    mockArchiveFile(
      "skills/review/SKILL.md",
      Buffer.from(
        skillText ??
          `---
name: review
description: Review changes when the user asks for risk analysis.
---

# review

Use this skill when the user asks for code review, risk analysis, or missing tests.
`,
        "utf8"
      )
    ),
    mockArchiveFile("prompts/launch.md", Buffer.from(promptText ?? "# launch\n\nReview the current change.\n", "utf8"))
  ];
}

async function withGithubArchiveServer(files, callback) {
  const routes = new Map();
  const server = createServer((request, response) => {
    const route = routes.get(request.url);

    if (!route) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": route.contentType });
    response.end(route.body);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const entries = files.map((file) => ({
      name: path.posix.basename(file.path),
      path: file.path,
      type: "file",
      size: file.declaredSize ?? Buffer.byteLength(file.body),
      download_url: `${origin}/raw/${file.path}`
    }));

    routes.set("/github-api/repos/mock/packs/contents/packs/unpack-limit-pack?ref=v0.1.0", {
      contentType: "application/json",
      body: JSON.stringify(entries)
    });

    for (const file of files) {
      routes.set(`/raw/${file.path}`, { contentType: "application/octet-stream", body: file.body });
    }

    return await callback(origin);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function writeGithubArchiveCatalog(catalogPath, apiBaseUrl) {
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: "2026-09-01T00:00:00.000Z",
        packs: [
          {
            id: "unpack-limit-pack",
            name: "Unpack Limit Pack",
            description: "Pack delivered through a mock github-archive source.",
            version: "0.1.0",
            author: "packsmith",
            publisher: { id: "packsmith", verified: true },
            category: "code-quality",
            tags: ["github"],
            targets: ["claude-code"],
            permissions: { shell: "none", filesystem: "required", network: "none", browser: "none" },
            riskLevel: "low",
            estimatedContextSize: 1200,
            verified: true,
            source: {
              type: "github-archive",
              repo: "mock/packs",
              path: "packs/unpack-limit-pack",
              ref: "v0.1.0",
              apiBaseUrl
            }
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
}

async function withAllowedFetchHosts(callback) {
  const previous = process.env.PACKSMITH_ALLOWED_FETCH_HOSTS;
  process.env.PACKSMITH_ALLOWED_FETCH_HOSTS = "127.0.0.1,localhost";

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.PACKSMITH_ALLOWED_FETCH_HOSTS;
    } else {
      process.env.PACKSMITH_ALLOWED_FETCH_HOSTS = previous;
    }
  }
}

test("github-archive install is refused when unpacked content exceeds the 50MB default limit", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-unpack-size-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const catalogPath = path.join(tempRoot, "catalog.json");
  // 51 MB of body: well under the 100MB single-response HTTP cap, but over the
  // 50MB unpacked default. The listing lies about the file size (1000 bytes),
  // so the refusal must come from the bytes actually downloaded.
  const bigBody = Buffer.alloc(51 * 1024 * 1024, 0x41);
  const files = [...mockArchivePackFiles(), mockArchiveFile("assets/big-content.md", bigBody, 1000)];

  await withAllowedFetchHosts(() =>
    withGithubArchiveServer(files, async (origin) => {
      await writeGithubArchiveCatalog(catalogPath, `${origin}/github-api`);

      await assert.rejects(
        installPack("unpack-limit-pack", {
          registry: catalogPath,
          stateDir,
          homeDir,
          target: "claude-code",
          yes: true
        }),
        (error) =>
          /exceeds the maximum total unpacked size/.test(error.message) &&
          /534\d+ bytes > 52428800 bytes/.test(error.message)
      );

      const installed = await listInstalledPacks({ stateDir });
      assert.equal(installed.installed.length, 0);
    })
  );
});

test("github-archive install is refused when unpacked file count exceeds the limit", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-unpack-count-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const files = mockArchivePackFiles();

  await withAllowedFetchHosts(() =>
    withGithubArchiveServer(files, async (origin) => {
      await writeGithubArchiveCatalog(catalogPath, `${origin}/github-api`);

      await assert.rejects(
        installPack("unpack-limit-pack", {
          registry: catalogPath,
          stateDir,
          homeDir,
          target: "claude-code",
          yes: true,
          maxUnpackedFiles: 2
        }),
        /exceeds the maximum file count: 3 files > 2/
      );
    })
  );
});

test("github-archive install succeeds within the caps and the cache marker records totals", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-unpack-ok-"));
  const stateDir = path.join(tempRoot, "state");
  const homeDir = path.join(tempRoot, "home");
  const catalogPath = path.join(tempRoot, "catalog.json");
  const files = mockArchivePackFiles();

  await withAllowedFetchHosts(() =>
    withGithubArchiveServer(files, async (origin) => {
      await writeGithubArchiveCatalog(catalogPath, `${origin}/github-api`);

      const result = await installPack("unpack-limit-pack", {
        registry: catalogPath,
        stateDir,
        homeDir,
        target: "claude-code",
        yes: true,
        maxUnpackedBytes: 1024 * 1024,
        maxUnpackedFiles: 100
      });
      assert.equal(result.manifest.name, "unpack-limit-pack");

      const cacheRoots = await readdir(path.join(stateDir, "source-cache"));
      const marker = await readJson(path.join(stateDir, "source-cache", cacheRoots[0], ".packsmith-cache-ok.json"));
      assert.equal(marker.fileCount, 3);
      assert.ok(marker.totalBytes > 0);

      // Cached sources are re-checked against the *current* caps: a lowered
      // limit must refuse the cached source instead of silently reusing it.
      await assert.rejects(
        installPack("unpack-limit-pack", {
          registry: catalogPath,
          stateDir,
          homeDir,
          target: "claude-code",
          yes: true,
          maxUnpackedBytes: 1
        }),
        /exceeds the maximum total unpacked size/
      );
    })
  );
});
