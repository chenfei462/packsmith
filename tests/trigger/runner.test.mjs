import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";

import { buildTriggerResult } from "../../src/runtimes/base.mjs";
import { runTriggerEvaluation } from "../../src/trigger/runner.mjs";

const mockCliPath = path.resolve("tests/fixtures/mock-runtime-cli.mjs");

async function fixture(t, suite = null) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-m8-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillDir = path.join(root, "review-pr");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: review-pr\ndescription: Review a PR when explicitly requested.\n---\nBody.\n");
  await writeFile(path.join(skillDir, "evals", "triggers.json"), JSON.stringify(suite ?? {
    schemaVersion: 1,
    skill: "review-pr",
    cases: [
      { id: "review-security", prompt: "Review this PR for security", expect: "trigger" },
      { id: "explain-pr", prompt: "Explain a PR", expect: "no-trigger" }
    ]
  }));
  return { root, skillDir, runsRoot: path.join(root, "artifacts", "runs") };
}

function fakeAdapter(run) {
  return {
    id: "codex",
    runTriggerCase: async ({ skill, prompt, context }) => {
      assert.equal(skill, "review-pr");
      assert.equal((await stat(path.join(context.workspaceDir, ".git"))).isDirectory(), true);
      assert.equal((await stat(path.join(context.workspaceDir, ".agents", "skills", skill, "SKILL.md"))).isFile(), true);
      return run({ prompt, context });
    }
  };
}

function options(skillDir, runsRoot, adapter) {
  return {
    targetPath: skillDir,
    runtimeIds: ["codex"],
    runs: 2,
    runsRoot,
    adapters: { codex: adapter },
    runtimeOptions: {
      codex: {
        binaryPath: process.execPath,
        binaryArgs: [mockCliPath],
        env: { MOCK_AUDIT_SKILL_NAME: "review-pr" }
      }
    }
  };
}

test("runner creates a fresh real isolation for every case and repeat", async (t) => {
  const { skillDir, runsRoot } = await fixture(t);
  const contexts = [];
  const adapter = fakeAdapter(({ prompt, context }) => {
    contexts.push(context);
    return buildTriggerResult({ status: prompt.startsWith("Review") ? "triggered" : "not_triggered", runtime: "codex", runtimeVersion: "mock-1", evidence: [] });
  });
  const report = await runTriggerEvaluation(options(skillDir, runsRoot, adapter));
  assert.equal(report.status, "pass");
  assert.equal(report.exitCode, 0);
  assert.equal(report.observations.length, 4);
  assert.equal(new Set(contexts.map((context) => context.workspaceDir)).size, 4);
  assert.equal(new Set(report.observations.map((entry) => entry.runDir)).size, 4);
  assert.deepEqual(report.observations.map((entry) => [entry.caseId, entry.repeat, entry.status]), [
    ["review-security", 1, "triggered"],
    ["review-security", 2, "triggered"],
    ["explain-pr", 1, "not_triggered"],
    ["explain-pr", 2, "not_triggered"]
  ]);
  for (const entry of report.observations) {
    const result = JSON.parse(await readFile(path.join(entry.runDir, "result.json"), "utf8"));
    assert.equal(result.status, entry.status);
  }
});

test("an adapter failure is recorded as infra_error and later cases still run", async (t) => {
  const { skillDir, runsRoot } = await fixture(t);
  let calls = 0;
  const adapter = fakeAdapter(({ prompt }) => {
    calls += 1;
    if (calls === 1) throw new Error("synthetic adapter failure");
    return buildTriggerResult({ status: prompt.startsWith("Review") ? "triggered" : "not_triggered", runtime: "codex", evidence: [] });
  });
  const report = await runTriggerEvaluation({ ...options(skillDir, runsRoot, adapter), runs: 1 });
  assert.equal(calls, 2);
  assert.deepEqual(report.observations.map((entry) => entry.status), ["infra_error", "not_triggered"]);
  assert.ok(report.observations[0].runDir, "failed observation points to retained evidence");
  assert.equal(JSON.parse(await readFile(path.join(report.observations[0].runDir, "result.json"), "utf8")).status, "infra_error");
  assert.equal(report.status, "incomplete");
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.score.runtimes.codex.confusion, { tp: 0, fp: 0, tn: 1, fn: 0 });
  const dirs = await readdir(runsRoot);
  assert.equal(dirs.length, 2);
  const retained = await Promise.all(dirs.map(async (name) => JSON.parse(await readFile(path.join(runsRoot, name, "result.json"), "utf8"))));
  assert.ok(retained.some((item) => item.status === "infra_error"));
});

test("invalid adapter result is retained as infra_error instead of executed", async (t) => {
  const { skillDir, runsRoot } = await fixture(t);
  const adapter = fakeAdapter(() => ({ status: "triggered", runtime: "other" }));
  const report = await runTriggerEvaluation({ ...options(skillDir, runsRoot, adapter), runs: 1 });
  assert.equal(report.status, "incomplete");
  assert.ok(report.observations.every((entry) => entry.status === "infra_error"));
  for (const entry of report.observations) {
    assert.equal(JSON.parse(await readFile(path.join(entry.runDir, "result.json"), "utf8")).status, "infra_error");
  }
});

test("invalid suites stop before any runtime artifacts are created", async (t) => {
  const { skillDir, runsRoot } = await fixture(t, { schemaVersion: 1, skill: "review-pr", cases: [] });
  const adapter = fakeAdapter(() => { throw new Error("must not execute"); });
  await assert.rejects(() => runTriggerEvaluation(options(skillDir, runsRoot, adapter)), /trigger suite.*non-empty array/);
  await assert.rejects(() => stat(runsRoot), { code: "ENOENT" });
});
