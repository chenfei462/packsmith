import test from "node:test";
import assert from "node:assert/strict";

import { scoreTriggerResults } from "../../src/trigger/scorer.mjs";

const suite = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "review-security", prompt: "Review this PR", expect: "trigger" },
    { id: "explain-pr", prompt: "What is a PR?", expect: "no-trigger" }
  ]
};

function observation(runtime, caseId, repeat, status) {
  return { runtime, caseId, repeat, status };
}

test("scores only binary outcomes and leaves undefined denominators null", () => {
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["claude-code"],
    runs: 1,
    observations: [
      observation("claude-code", "review-security", 1, "triggered"),
      observation("claude-code", "explain-pr", 1, "not_triggered")
    ]
  });
  assert.equal(report.status, "pass");
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.runtimes["claude-code"].confusion, { tp: 1, fp: 0, tn: 1, fn: 0 });
  assert.equal(report.runtimes["claude-code"].precision, 1);
  assert.equal(report.runtimes["claude-code"].recall, 1);
  assert.equal(report.runtimes["claude-code"].falsePositiveRate, 0);
  assert.equal(report.runtimes["claude-code"].infrastructureErrorRate, 0);
  assert.equal(report.runtimes["claude-code"].validRuns, 2);
});

test("infra, timeout, ambiguous and unsupported never count as negative activation", () => {
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["codex", "cursor"],
    runs: 2,
    observations: [
      observation("codex", "review-security", 1, "infra_error"),
      observation("codex", "review-security", 2, "timeout"),
      observation("codex", "explain-pr", 1, "ambiguous"),
      observation("codex", "explain-pr", 2, "not_triggered"),
      observation("cursor", "review-security", 1, "unsupported"),
      observation("cursor", "review-security", 2, "unsupported"),
      observation("cursor", "explain-pr", 1, "unsupported"),
      observation("cursor", "explain-pr", 2, "unsupported")
    ]
  });
  assert.equal(report.status, "incomplete");
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.runtimes.codex.confusion, { tp: 0, fp: 0, tn: 1, fn: 0 });
  assert.deepEqual(report.runtimes.codex.unresolved, { ambiguous: 1, infra_error: 1, timeout: 1, unsupported: 0 });
  assert.equal(report.runtimes.codex.recall, null);
  assert.equal(report.runtimes.codex.precision, null);
  assert.equal(report.runtimes.codex.infrastructureErrorRate, 0.25);
  assert.equal(report.runtimes.cursor.validRuns, 0);
  assert.equal(report.runtimes.cursor.precision, null);
  assert.equal(report.runtimes.cursor.recall, null);
  assert.equal(report.divergence.length, 0);
  assert.equal(report.incomparableCases.length, 2);
});

test("false positives and false negatives affect the correct denominators", () => {
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["codex"],
    runs: 2,
    observations: [
      observation("codex", "review-security", 1, "triggered"),
      observation("codex", "review-security", 2, "not_triggered"),
      observation("codex", "explain-pr", 1, "triggered"),
      observation("codex", "explain-pr", 2, "not_triggered")
    ]
  });
  assert.equal(report.status, "fail");
  assert.equal(report.exitCode, 1);
  assert.deepEqual(report.runtimes.codex.confusion, { tp: 1, fp: 1, tn: 1, fn: 1 });
  assert.equal(report.runtimes.codex.precision, 0.5);
  assert.equal(report.runtimes.codex.recall, 0.5);
  assert.equal(report.runtimes.codex.falsePositiveRate, 0.5);
});

test("divergence compares only complete binary samples for each runtime", () => {
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["claude-code", "codex"],
    runs: 3,
    observations: [
      ...[1, 2, 3].map((n) => observation("claude-code", "review-security", n, "triggered")),
      observation("codex", "review-security", 1, "triggered"),
      observation("codex", "review-security", 2, "triggered"),
      observation("codex", "review-security", 3, "not_triggered"),
      ...[1, 2, 3].flatMap((n) => [
        observation("claude-code", "explain-pr", n, "not_triggered"),
        observation("codex", "explain-pr", n, "not_triggered")
      ])
    ]
  });
  assert.deepEqual(report.divergence.map((item) => item.caseId), ["review-security"]);
  assert.deepEqual(report.divergence[0].activationCounts, { "claude-code": 3, codex: 2 });
  assert.equal(report.incomparableCases.length, 0);
  assert.equal(report.status, "fail");
});

test("missing and duplicate observations are rejected instead of yielding a misleading score", () => {
  const base = [observation("codex", "review-security", 1, "triggered")];
  assert.throws(() => scoreTriggerResults({ suite, runtimeIds: ["codex"], runs: 1, observations: base }), /missing observation/);
  assert.throws(() => scoreTriggerResults({ suite, runtimeIds: ["codex"], runs: 1, observations: [...base, base[0]] }), /duplicate observation/);
});
