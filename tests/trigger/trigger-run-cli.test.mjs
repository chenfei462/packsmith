import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "cli.mjs");

async function fixture(t, suite) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-m8-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillDir = path.join(root, "review-pr");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: review-pr\ndescription: Review a PR when explicitly requested.\n---\nBody.\n");
  await writeFile(path.join(skillDir, "evals", "triggers.json"), JSON.stringify(suite ?? {
    schemaVersion: 1,
    skill: "review-pr",
    cases: [
      { id: "review-security", prompt: "Review this PR", expect: "trigger" },
      { id: "explain-pr", prompt: "Explain a PR", expect: "no-trigger" }
    ]
  }));
  return { root, skillDir };
}

function command(root, ...args) {
  return spawnSync(process.execPath, [cli, "trigger", ...args], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000 });
}

test("trigger command reports static-only runtimes as unsupported, not 100%", async (t) => {
  const { root, skillDir } = await fixture(t);
  const run = command(root, skillDir, "--runtime", "cursor", "--runs", "2", "--format", "json");
  assert.equal(run.status, 2, run.stderr);
  assert.equal(run.stderr, "");
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "incomplete");
  assert.equal(report.runs, 2);
  assert.equal(report.observations.length, 4);
  assert.ok(report.observations.every((item) => item.status === "unsupported"));
  assert.equal(report.score.runtimes.cursor.precision, null);
  assert.equal(report.score.runtimes.cursor.recall, null);
  const saved = JSON.parse(await readFile(path.join(report.observations[0].runDir, "result.json"), "utf8"));
  assert.equal(saved.status, "unsupported");
});

test("text report renders undefined metrics as n/a and shows infrastructure rate", async (t) => {
  const { root, skillDir } = await fixture(t);
  const run = command(root, skillDir, "--runtime", "cursor");
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stdout, /Recall: n\/a/);
  assert.match(run.stdout, /Infrastructure-error rate: 0%/);
  assert.doesNotMatch(run.stdout, /100%/);
});

test("trigger usage errors keep JSON output and do not create run artifacts", async (t) => {
  const { root, skillDir } = await fixture(t);
  for (const args of [
    [skillDir, "--runtime", "made-up", "--format", "json"],
    [skillDir, "--runtime", "cursor", "--runs", "0", "--format", "json"],
    [skillDir, "--runtime", "cursor", "--runs", "bad", "--format", "json"],
    [skillDir, "--runtime", "cursor", "--runs", "1e0", "--format", "json"]
  ]) {
    const run = command(root, ...args);
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.equal(run.stderr, "");
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "usage_error");
  }
  await assert.rejects(() => stat(path.join(root, ".packsmith", "runs")), { code: "ENOENT" });
});

test("invalid trigger suite exits one with a JSON validation envelope", async (t) => {
  const { root, skillDir } = await fixture(t, { schemaVersion: 1, skill: "review-pr", cases: [] });
  const run = command(root, skillDir, "--runtime", "cursor", "--format", "json");
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.equal(run.stderr, "");
  const envelope = JSON.parse(run.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "validation_error");
});
