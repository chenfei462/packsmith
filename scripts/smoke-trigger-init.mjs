#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline smoke test for `packsmith trigger init` (v0.2 Milestone 5, plan
 * §13). Zero dependencies, isolated temp directories only, repeatable, no
 * network, no credentials, no model calls.
 *
 * Verified:
 *   (a) trigger init creates a valid evals/triggers.json (schema, 4 cases,
 *       CJK starter prompts survive the UTF-8 round trip);
 *   (b) --format json prints one parseable created result;
 *   (c) a second init refuses with exit 1 and leaves the file untouched;
 *   (d) a target without SKILL.md is a validation failure (exit 1);
 *   (e) usage failures under --format json emit the stable error envelope
 *       with exit 2.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

const SKILL = `---
name: smoke-trigger-skill
description: Reviews changes for risk whenever the user asks for a review pass.
---

# Smoke Trigger Skill

Read the change and rank the findings by severity.
`;

function fail(step, message) {
  console.error(`SMOKE TRIGGER INIT FAIL [${step}] ${message}`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.error) {
    fail("spawn", result.error.message);
  }
  return result;
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-trigger-smoke-"));

try {
  // (a) create the suite
  const skillDir = path.join(tempRoot, "中文 技能");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL, "utf8");

  const created = run(["trigger", "init", skillDir]);
  if (created.status !== 0) {
    fail("init", `exit ${created.status}: ${created.stdout.slice(0, 200)} ${created.stderr.slice(0, 200)}`);
  }
  const suitePath = path.join(skillDir, "evals", "triggers.json");
  const suite = JSON.parse(await readFile(suitePath, "utf8"));
  if (suite.schemaVersion !== 1 || suite.skill !== "中文 技能" || suite.cases.length !== 4) {
    fail("suite content", JSON.stringify(suite).slice(0, 200));
  }
  if (!suite.cases.some((entry) => /[\u4e00-\u9fff]/.test(entry.prompt))) {
    fail("suite content", "CJK starter prompt missing");
  }
  console.log("SMOKE TRIGGER INIT: suite created (4 cases, CJK round-trip OK)");

  // (b) machine-readable success
  const secondSkillDir = path.join(tempRoot, "second");
  await mkdir(secondSkillDir, { recursive: true });
  await writeFile(path.join(secondSkillDir, "SKILL.md"), SKILL.replace("smoke-trigger-skill", "second"), "utf8");
  const jsonRun = run(["trigger", "init", secondSkillDir, "--format", "json"]);
  if (jsonRun.status !== 0) {
    fail("init json", `exit ${jsonRun.status}: ${jsonRun.stdout.slice(0, 200)}`);
  }
  let createdJson;
  try {
    createdJson = JSON.parse(jsonRun.stdout);
  } catch {
    fail("init json", `stdout not JSON: ${jsonRun.stdout.slice(0, 200)}`);
  }
  if (createdJson.status !== "created" || createdJson.schemaVersion !== 1 || createdJson.cases !== 4) {
    fail("init json", JSON.stringify(createdJson));
  }

  // (c) refusal, byte-identical file
  const before = await readFile(suitePath, "utf8");
  const refused = run(["trigger", "init", skillDir]);
  if (refused.status !== 1) {
    fail("refusal", `expected exit 1, got ${refused.status}`);
  }
  if ((await readFile(suitePath, "utf8")) !== before) {
    fail("refusal", "existing suite was modified");
  }

  // (d) target without SKILL.md
  const plainDir = path.join(tempRoot, "not-a-skill");
  await mkdir(plainDir, { recursive: true });
  const invalid = run(["trigger", "init", plainDir]);
  if (invalid.status !== 1) {
    fail("invalid target", `expected exit 1, got ${invalid.status}`);
  }

  // (e) usage failure with JSON intent → envelope + exit 2
  const usage = run(["trigger", "init", path.join(tempRoot, "missing"), "--format", "json"]);
  if (usage.status !== 2) {
    fail("usage envelope", `expected exit 2, got ${usage.status}`);
  }
  try {
    const envelope = JSON.parse(usage.stdout);
    if (envelope.ok !== false || envelope.error.code !== "usage_error" || envelope.error.exitCode !== 2) {
      fail("usage envelope", JSON.stringify(envelope));
    }
  } catch {
    fail("usage envelope", `stdout not JSON: ${usage.stdout.slice(0, 200)}`);
  }

  console.log("SMOKE TRIGGER INIT: PASS (create/json/refuse/invalid/usage-envelope)");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
