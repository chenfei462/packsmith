#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline smoke for `packsmith matrix` (v0.2 Milestone 9, plan §20).
 * Zero dependencies, exclusive temp root, no model calls, repeatable.
 *
 * Verified:
 *   (a) static-only matrix exits 0 and shows STATIC COMPATIBILITY;
 *   (b) --format json emits a parseable JSON object with expected fields;
 *   (c) --results with valid M8 report imports observed behavior;
 *   (d) a nonexistent results file exits 2 with a usage envelope;
 *   (e) invalid YAML exits 1 with a validation envelope.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

function fail(step, message) {
  console.error(`SMOKE MATRIX FAIL [${step}] ${message}`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000
  });
  if (result.error) fail("spawn", result.error.message);
  return result;
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-matrix-"));

try {
  const skillDir = path.join(tempRoot, "review-pr");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: review-pr\ndescription: Reviews pull requests for security risks when the user asks.\n---\n\nBody.\n",
    "utf8"
  );
  const suite = {
    schemaVersion: 1, skill: "review-pr",
    cases: [
      { id: "review-security", prompt: "Review this PR", expect: "trigger" },
      { id: "explain-pr", prompt: "What is a PR?", expect: "no-trigger" }
    ]
  };
  await writeFile(path.join(skillDir, "evals", "triggers.json"), JSON.stringify(suite, null, 2), "utf8");

  // (a) static-only terminal output
  const staticRun = run(["matrix", skillDir]);
  if (staticRun.status !== 0) fail("static", `exit ${staticRun.status}: ${staticRun.stderr.slice(0, 200)}`);
  if (!staticRun.stdout.includes("STATIC COMPATIBILITY")) fail("static", "missing section header");
  if (!staticRun.stdout.includes("OBSERVED BEHAVIOR")) fail("static", "missing observed behavior note");
  console.log("SMOKE MATRIX: static-only output OK");

  // (b) JSON output
  const jsonRun = run(["matrix", skillDir, "--format", "json"]);
  if (jsonRun.status !== 0) fail("json", `exit ${jsonRun.status}`);
  let parsed;
  try { parsed = JSON.parse(jsonRun.stdout); } catch { fail("json", "stdout not JSON"); }
  if (parsed.schemaVersion !== 1 || parsed.skill !== "review-pr") fail("json", JSON.stringify(parsed).slice(0, 200));
  if (!Array.isArray(parsed.staticCompatibility) || parsed.staticCompatibility.length < 5) fail("json", "static rows");
  if (parsed.observedBehavior !== null) fail("json", "observedBehavior must be null without --results");
  console.log("SMOKE MATRIX: JSON output OK");

  // (c) --results imports observed behavior
  const resultsPath = path.join(tempRoot, "m8-results.json");
  await writeFile(resultsPath, JSON.stringify({
    schemaVersion: 1, skill: "review-pr", runs: 1, runtimeIds: ["codex"],
    observations: [
      { runtime: "codex", caseId: "review-security", repeat: 1, status: "triggered" },
      { runtime: "codex", caseId: "explain-pr", repeat: 1, status: "not_triggered" }
    ]
  }), "utf8");
  const resultsRun = run(["matrix", skillDir, "--results", resultsPath, "--format", "json"]);
  if (resultsRun.status !== 0) fail("results", `exit ${resultsRun.status}`);
  let withResults;
  try { withResults = JSON.parse(resultsRun.stdout); } catch { fail("results", "stdout not JSON"); }
  if (!withResults.observedBehavior || !withResults.observedBehavior.behavior) fail("results", "no behavior");
  if (withResults.observedBehavior.behavior.codex["review-security"].activationRate !== 1) fail("results", "rate");
  console.log("SMOKE MATRIX: --results import OK");

  // (d) nonexistent results file → exit 2 with usage envelope
  const badResults = run(["matrix", skillDir, "--results", "/nonexistent/r.json", "--format", "json"]);
  if (badResults.status !== 2) fail("bad results", `expected exit 2, got ${badResults.status}`);
  let badEnvelope;
  try { badEnvelope = JSON.parse(badResults.stdout); } catch { fail("bad results", "stdout not JSON"); }
  if (badEnvelope.ok !== false || badEnvelope.error.code !== "usage_error") fail("bad results", JSON.stringify(badEnvelope));
  console.log("SMOKE MATRIX: nonexistent results → usage envelope OK");

  // (e) invalid YAML → exit 1 with validation envelope
  const badSkillDir = path.join(tempRoot, "bad-skill");
  await mkdir(badSkillDir, { recursive: true });
  await writeFile(path.join(badSkillDir, "SKILL.md"), "---\n{{invalid\n---\n\nBody.\n", "utf8");
  const badYaml = run(["matrix", badSkillDir, "--format", "json"]);
  if (badYaml.status !== 1) fail("bad YAML", `expected exit 1, got ${badYaml.status}`);
  let yamlEnvelope;
  try { yamlEnvelope = JSON.parse(badYaml.stdout); } catch { fail("bad YAML", "stdout not JSON"); }
  if (yamlEnvelope.ok !== false || yamlEnvelope.error.code !== "validation_error") fail("bad YAML", JSON.stringify(yamlEnvelope));
  console.log("SMOKE MATRIX: invalid YAML → validation envelope OK");

  console.log("SMOKE MATRIX: PASS (static/json/results/usage/validation)");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
