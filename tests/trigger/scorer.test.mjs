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
  // Original activationCounts/runs contract retained.
  assert.deepEqual(report.divergence[0].activationCounts, { "claude-code": 3, codex: 2 });
  assert.equal(report.divergence[0].runs, 3);
  assert.equal(report.incomparableCases.length, 0);
  assert.equal(report.status, "fail");
  // Pair-level divergence: the third repeat is where the runtimes differ.
  assert.deepEqual(
    report.divergence[0].pairs.map((pair) => ({ repeat: pair.repeat, divergent: pair.divergent })),
    [
      { repeat: 1, divergent: false },
      { repeat: 2, divergent: false },
      { repeat: 3, divergent: true }
    ]
  );
});

test("divergence is paired per repeat: equal aggregate counts can still diverge", () => {
  // A: [triggered, not_triggered]; B: [not_triggered, triggered].
  // Aggregate counts are identical (1 each) but every repeat diverges.
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["a", "b"],
    runs: 2,
    observations: [
      observation("a", "review-security", 1, "triggered"),
      observation("a", "review-security", 2, "not_triggered"),
      observation("b", "review-security", 1, "not_triggered"),
      observation("b", "review-security", 2, "triggered"),
      observation("a", "explain-pr", 1, "not_triggered"),
      observation("a", "explain-pr", 2, "not_triggered"),
      observation("b", "explain-pr", 1, "not_triggered"),
      observation("b", "explain-pr", 2, "not_triggered")
    ]
  });
  assert.equal(report.status, "fail");
  const divergence = report.divergence.find((item) => item.caseId === "review-security");
  assert.ok(divergence, "divergence must be detected despite equal aggregate counts");
  assert.deepEqual(
    divergence.pairs.map((pair) => ({ repeat: pair.repeat, divergent: pair.divergent })),
    [
      { repeat: 1, divergent: true },
      { repeat: 2, divergent: true }
    ]
  );
});

test("partial divergence: binary repeat compared even when another repeat has an unresolved state", () => {
  // A: [triggered, infra_error]; B: [not_triggered, triggered].
  // Repeat 1 is binary and divergent; repeat 2 is excluded from metrics.
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["a", "b"],
    runs: 2,
    observations: [
      observation("a", "review-security", 1, "triggered"),
      observation("a", "review-security", 2, "infra_error"),
      observation("b", "review-security", 1, "not_triggered"),
      observation("b", "review-security", 2, "triggered"),
      observation("a", "explain-pr", 1, "not_triggered"),
      observation("a", "explain-pr", 2, "not_triggered"),
      observation("b", "explain-pr", 1, "not_triggered"),
      observation("b", "explain-pr", 2, "not_triggered")
    ]
  });
  assert.equal(report.status, "incomplete");
  assert.equal(report.exitCode, 2);
  const divergence = report.divergence.find((item) => item.caseId === "review-security");
  assert.ok(divergence, "repeat 1 divergence must survive even with an unresolved repeat 2");
  const first = divergence.pairs.find((pair) => pair.repeat === 1);
  assert.equal(first.divergent, true, "repeat 1 is binary and divergent");
  const second = divergence.pairs.find((pair) => pair.repeat === 2);
  assert.equal(second.comparable, false, "repeat 2 is not comparable (infra_error)");
});

test("mixed FP + infra_error: infra takes precedence (incomplete, exit 2), FP is retained", () => {
  const report = scoreTriggerResults({
    suite,
    runtimeIds: ["codex"],
    runs: 2,
    observations: [
      observation("codex", "review-security", 1, "not_triggered"), // expect trigger → FN, but not FP
      observation("codex", "review-security", 2, "infra_error"),
      observation("codex", "explain-pr", 1, "triggered"), // expect no-trigger → FP
      observation("codex", "explain-pr", 2, "not_triggered")
    ]
  });
  assert.equal(report.status, "incomplete");
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.runtimes.codex.confusion, { tp: 0, fp: 1, tn: 1, fn: 1 });
  assert.deepEqual(report.runtimes.codex.unresolved, { ambiguous: 0, infra_error: 1, timeout: 0, unsupported: 0 });
});

test("runtimeIds containing __proto__ are rejected instead of producing a false pass", () => {
  // A runtime id of "__proto__" would silently create a prototype slot on
  // a plain object dictionary, losing FN entries and returning pass.
  assert.throws(
    () =>
      scoreTriggerResults({
        suite,
        runtimeIds: ["__proto__"],
        runs: 1,
        observations: [
          observation("__proto__", "explain-pr", 1, "not_triggered") // expect no-trigger → tn (lost on proto)
        ]
      }),
    /invalid runtime id/
  );
  assert.throws(
    () =>
      scoreTriggerResults({
        suite,
        runtimeIds: ["constructor"],
        runs: 1,
        observations: [observation("constructor", "explain-pr", 1, "not_triggered")]
      }),
    /invalid runtime id/
  );
});

test("missing and duplicate observations are rejected instead of yielding a misleading score", () => {
  const base = [observation("codex", "review-security", 1, "triggered")];
  assert.throws(() => scoreTriggerResults({ suite, runtimeIds: ["codex"], runs: 1, observations: base }), /missing observation/);
  assert.throws(() => scoreTriggerResults({ suite, runtimeIds: ["codex"], runs: 1, observations: [...base, base[0]] }), /duplicate observation/);
});
