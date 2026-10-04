#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTriggerResult } from "../src/runtimes/base.mjs";
import { runTriggerEvaluation } from "../src/trigger/runner.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-trigger-run-smoke-"));
try {
  const skillDir = path.join(root, "review-pr");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: review-pr\ndescription: Use for explicit PR reviews.\n---\nReview PRs.\n");
  await writeFile(path.join(skillDir, "evals", "triggers.json"), JSON.stringify({
    schemaVersion: 1,
    skill: "review-pr",
    cases: [
      { id: "review-security", prompt: "Review this PR for security", expect: "trigger" },
      { id: "explain-pr", prompt: "Explain a pull request", expect: "no-trigger" }
    ]
  }));

  // Exercise all six isolated case runs without any real model. The mock
  // adapter returns fixed normalized results; the real isolation layer still
  // creates separate git workspaces, files and private runtime state.
  const report = await runTriggerEvaluation({
    targetPath: skillDir,
    runtimeIds: ["codex"],
    runs: 3,
    runsRoot: path.join(root, "runs"),
    adapters: {
      codex: {
        runTriggerCase: async ({ prompt }) => buildTriggerResult({
          status: prompt.startsWith("Review") ? "triggered" : "not_triggered",
          runtime: "codex",
          runtimeVersion: "mock-1",
          evidence: []
        })
      }
    },
    runtimeOptions: {
      codex: {
        binaryPath: process.execPath,
        binaryArgs: [path.join(here, "..", "tests", "fixtures", "mock-runtime-cli.mjs")],
        env: { MOCK_AUDIT_SKILL_NAME: "review-pr" }
      }
    }
  });
  assert.equal(report.status, "pass");
  assert.deepEqual(report.score.runtimes.codex.confusion, { tp: 3, fp: 0, tn: 3, fn: 0 });
  assert.equal(new Set(report.observations.map((entry) => entry.runDir)).size, 6);
  for (const entry of report.observations) {
    const retained = JSON.parse(await readFile(path.join(entry.runDir, "result.json"), "utf8"));
    assert.equal(retained.status, entry.status);
  }

  // The CLI path is exercised with a static-only runtime, so it proves
  // JSON/exit behavior without contacting an account or model service.
  const cli = path.join(here, "..", "src", "cli.mjs");
  const child = spawnSync(process.execPath, [cli, "trigger", skillDir, "--runtime", "cursor", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000
  });
  assert.equal(child.status, 2, child.stderr);
  const cliReport = JSON.parse(child.stdout);
  assert.equal(cliReport.status, "incomplete");
  assert.equal(cliReport.score.runtimes.cursor.validRuns, 0);
  assert.equal(cliReport.score.runtimes.cursor.recall, null);

  console.log("SMOKE TRIGGER RUN: PASS (six isolated mock cases, exact score, static CLI unsupported without invented 100%)");
} finally {
  await rm(root, { recursive: true, force: true });
}
