#!/usr/bin/env node
/**
 * Packsmith v0.1 baseline smoke (Milestone 0).
 *
 * Runs the five preserved v0.1 commands end to end against a freshly scaffolded
 * pack, fully isolated from the developer's machine:
 *   init -> validate -> inspect -> build -> install
 *
 * - Zero dependencies (Node built-ins only, Node 20+, ESM).
 * - Offline: no network, no API keys, no model calls.
 * - State isolation mirrors tests/pack.test.mjs createIsolatedEnv():
 *     PACKSMITH_HOME / PACKSMITH_TEST_HOME point at temp subdirectories,
 *     so the real ~/.packsmith and ~ are never touched.
 * - Repeatable: the fixed temp root under os.tmpdir() is wiped with
 *   fs.rmSync(..., { recursive: true, force: true }) before every run.
 * - Exit code: 0 when every step passes, 1 on the first failure.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

const smokeRoot = path.join(os.tmpdir(), "packsmith-smoke-v01");
const packDir = path.join(smokeRoot, "pack");
const distDir = path.join(smokeRoot, "dist");
const installRoot = path.join(smokeRoot, "installed");
const stateDir = path.join(smokeRoot, "state");
const homeDir = path.join(smokeRoot, "home");

fs.rmSync(smokeRoot, { recursive: true, force: true });
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(homeDir, { recursive: true });

const env = {
  ...process.env,
  PACKSMITH_HOME: stateDir,
  PACKSMITH_TEST_HOME: homeDir,
  NO_COLOR: "1"
};

let failed = false;

function runStep(index, total, name, args, verify) {
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd: repoRoot, env, encoding: "utf8" });
  let exitCode = result.status ?? -1;
  let detail = "";

  if (exitCode === 0) {
    try {
      detail = verify ? verify(result) : "";
    } catch (error) {
      exitCode = 1;
      detail = `output check failed: ${error.message}`;
    }
  } else if (result.stderr) {
    detail = result.stderr.trim().split(/\r?\n/).slice(-1)[0];
  } else if (result.error) {
    detail = result.error.message;
  }

  const status = exitCode === 0 ? "OK  " : "FAIL";
  console.log(`[${index}/${total}] ${name.padEnd(8)} ${status} node src/cli.mjs ${args.join(" ")}${detail ? `  -- ${detail}` : ""}`);

  if (exitCode !== 0) {
    failed = true;
  }
}

const totalSteps = 5;
const packName = path.basename(packDir);

runStep(1, totalSteps, "init", ["init", packDir], () => {
  fs.accessSync(path.join(packDir, "packsmith.json"));
  return `scaffolded ${packName}`;
});

runStep(2, totalSteps, "validate", ["validate", packDir], (result) => {
  if (!/Validated pack/.test(result.stdout)) {
    throw new Error(`unexpected stdout: ${result.stdout.trim()}`);
  }
  return result.stdout.trim();
});

runStep(3, totalSteps, "inspect", ["inspect", packDir], (result) => {
  const inspected = JSON.parse(result.stdout);
  if (inspected.name !== packName) {
    throw new Error(`expected name "${packName}", got "${inspected.name}"`);
  }
  return `name=${inspected.name} skills=${inspected.skillCount} prompts=${inspected.promptCount}`;
});

runStep(4, totalSteps, "build", ["build", packDir, "--out", distDir], () => {
  const outputRoot = path.join(distDir, packName);
  fs.accessSync(path.join(outputRoot, "claude-code", "skills", "starter-skill", "SKILL.md"));
  fs.accessSync(path.join(outputRoot, "codex", "AGENTS.md"));
  return outputRoot;
});

runStep(5, totalSteps, "install", ["install", path.join(distDir, packName), "--target", "claude-code", "--dest", installRoot], () => {
  const installDir = path.join(installRoot, packName);
  fs.accessSync(path.join(installDir, "skills", "starter-skill", "SKILL.md"));
  fs.accessSync(path.join(installDir, "manifest.json"));
  return installDir;
});

if (failed) {
  console.log(`smoke-v01: FAILED (temp root kept for inspection: ${smokeRoot})`);
  process.exit(1);
}

console.log(`smoke-v01: 5/5 steps passed (isolated temp root: ${smokeRoot})`);
process.exit(0);
