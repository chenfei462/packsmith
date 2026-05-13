import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildPack, inspectPack, validatePack } from "../src/lib/pack.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const examplePack = path.join(repoRoot, "examples", "research-launchpad");
const execFileAsync = promisify(execFile);

async function runCli(args, cwd = repoRoot) {
  return execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), ...args], { cwd });
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
  assert.equal(result.skillCount, 1);
  assert.equal(result.promptCount, 1);
  assert.ok(result.estimatedContextChars > 0);
  assert.equal(result.skills[0].id, "github-demand");
});

test("buildPack emits target bundles for the example pack", async () => {
  const result = await buildPack(examplePack, "dist-test");

  assert.ok(result.outputRoot.endsWith(path.join("dist-test", "research-launchpad")));
  assert.deepEqual(result.targetsBuilt, ["claude-code", "codex"]);
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

  await assert.rejects(validatePack(packDir), /must include SKILL\.md/);
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
  const built = await buildPack(examplePack, "dist-install-test");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-"));
  const installRoot = path.join(tempRoot, "installed");

  await runCli(["install", built.outputRoot, "--target", "codex", "--dest", installRoot]);

  const agentsPath = path.join(installRoot, "research-launchpad", "AGENTS.md");
  const agentsContent = await readFile(agentsPath, "utf8");

  assert.match(agentsContent, /research-launchpad/i);
});
