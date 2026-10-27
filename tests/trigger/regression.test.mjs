import test from "node:test";
import assert from "node:assert/strict";

import { buildBaseline } from "../../src/trigger/baseline.mjs";
import {
  compareBaselineToReport,
  RegressionValidationError
} from "../../src/trigger/regression.mjs";

// Comparator contract: docs/regression-gate.md. All fixtures are synthetic;
// no model, no fs, no clock.

const SUITE = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "case-pos", prompt: "Review this PR", expect: "trigger" },
    { id: "case-neg", prompt: "What is a PR?", expect: "no-trigger" }
  ]
};

function grid({ runtimeIds, runs, statuses, versions = {} }) {
  // statuses: Map key `${runtime}/${caseId}/${repeat}` → status; default
  // matches the suite expectation (perfect behavior).
  const observations = [];
  for (const runtime of runtimeIds) {
    for (const entry of SUITE.cases) {
      for (let repeat = 1; repeat <= runs; repeat += 1) {
        const status = statuses[`${runtime}/${entry.id}/${repeat}`] ??
          (entry.expect === "trigger" ? "triggered" : "not_triggered");
        observations.push({
          runtime,
          caseId: entry.id,
          repeat,
          expect: entry.expect,
          status,
          runtimeVersion: versions[runtime] ?? `${runtime} 1.0.0`
        });
      }
    }
  }
  return observations;
}

function makeReport({ runtimeIds = ["codex"], runs = 1, statuses = {}, versions = {} } = {}) {
  const observations = grid({ runtimeIds, runs, statuses, versions });
  return {
    schemaVersion: 1,
    skill: "review-pr",
    runtimeIds: [...runtimeIds],
    runs,
    observations,
    score: { status: "pass", exitCode: 0, runtimes: {}, divergence: [], incomparableCases: [] }
  };
}

function makeBaseline({ runtimeIds = ["codex"], runs = 1, statuses = {}, versions = {} } = {}) {
  const report = makeReport({ runtimeIds, runs, statuses, versions });
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: "sha256:provenance" });
  assert.ok(baseline, "fixture baseline must be valid");
  return baseline;
}

test("identical evidence passes with full imperfect-state visibility", () => {
  const statuses = { "codex/case-pos/1": "not_triggered" }; // measured FN in the baseline
  const baseline = makeBaseline({ statuses });
  const report = makeReport({ statuses });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.pass, true, "a stable imperfect baseline passes the regression gate");
  assert.equal(comparison.failedChecks.length, 0);
  // The FN stays visible, never claimed as a pass of every case.
  assert.equal(comparison.runtimes.codex.cases["case-pos"].baseline.activationRate, 0);
  assert.equal(comparison.runtimes.codex.cases["case-pos"].current.activationRate, 0);
  assert.equal(comparison.runtimes.codex.aggregates.current.recall, 0);
});

test("positive-case activation decrease is a behavioral regression", () => {
  const baseline = makeBaseline({});
  const report = makeReport({ statuses: { "codex/case-pos/1": "not_triggered" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.pass, false);
  const kinds = comparison.failedChecks.map((c) => c.kind);
  assert.ok(kinds.includes("case-activation-decrease"));
  assert.ok(kinds.includes("recall-regression"));
  assert.equal(comparison.runtimes.codex.aggregates.current.recall, 0);
  assert.equal(comparison.runtimes.codex.aggregates.baseline.recall, 1);
});

test("negative-case activation increase is a behavioral regression", () => {
  const baseline = makeBaseline({});
  const report = makeReport({ statuses: { "codex/case-neg/1": "triggered" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.pass, false);
  const kinds = comparison.failedChecks.map((c) => c.kind);
  assert.ok(kinds.includes("case-activation-increase"));
  assert.ok(kinds.includes("fpr-regression"));
  assert.equal(comparison.runtimes.codex.aggregates.current.falsePositiveRate, 1);
});

test("sample-count drift compares rates, not raw counts", () => {
  const baseline = makeBaseline({ runs: 1 });
  const report = makeReport({ runs: 4 });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.pass, true);
  assert.deepEqual(comparison.runsDrift, { baseline: 1, current: 4, changed: true });
});

test("runtime-version drift is metadata, not a gate failure", () => {
  const baseline = makeBaseline({ versions: { codex: "codex-cli 0.148.0" } });
  const report = makeReport({ versions: { codex: "codex-cli 0.200.0" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.pass, true);
  assert.equal(comparison.versionDrift.codex.changed, true);
  assert.equal(comparison.versionDrift.codex.baseline, "codex-cli 0.148.0");
  assert.equal(comparison.versionDrift.codex.current, "codex-cli 0.200.0");
});

test("SKILL.md content change is provenance metadata only", () => {
  const baseline = makeBaseline({});
  const report = makeReport({});

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report, skillContentChanged: true });

  assert.equal(comparison.pass, true, "skill code changes are exactly what the gate tests");
  assert.equal(comparison.skillContentChanged, true);
});

test("unresolved current evidence is comparison-unable, not a behavioral negative", () => {
  const baseline = makeBaseline({});
  const report = makeReport({ statuses: { "codex/case-pos/1": "infra_error" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.unableReasons.some((r) => /non-binary/.test(r)));
  assert.ok(comparison.unableReasons.some((r) => /codex\/case-pos\/1:infra_error/.test(r)));
});

test("a baseline runtime missing from current evidence is comparison-unable", () => {
  const baseline = makeBaseline({ runtimeIds: ["codex", "claude-code"] });
  const report = makeReport({ runtimeIds: ["codex"] });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.unableReasons.some((r) => /claude-code/.test(r)));
});

test("unbaselined current runtimes are reported metadata; comparison proceeds on the intersection", () => {
  const baseline = makeBaseline({ runtimeIds: ["codex"] });
  const report = makeReport({ runtimeIds: ["codex", "claude-code"] });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.pass, true);
  assert.deepEqual(comparison.unbaselinedRuntimes, ["claude-code"]);
  assert.ok(comparison.runtimes.codex, "intersection is compared");
  assert.equal(comparison.runtimes["claude-code"], undefined);
});

test("precision is structurally N/A without positive evidence and never fabricates 100%", () => {
  const suite = {
    schemaVersion: 1,
    skill: "review-pr",
    cases: [{ id: "case-neg", prompt: "What is a PR?", expect: "no-trigger" }]
  };
  const observationsFor = (runtime, runs) => {
    const observations = [];
    for (let repeat = 1; repeat <= runs; repeat += 1) {
      observations.push({ runtime, caseId: "case-neg", repeat, expect: "no-trigger", status: "not_triggered", runtimeVersion: `${runtime} 1.0.0` });
    }
    return observations;
  };
  const baselineReport = { schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1, observations: observationsFor("codex", 1) };
  const baseline = buildBaseline({ report: baselineReport, suite });
  assert.ok(baseline);
  const report = { schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1, observations: observationsFor("codex", 1) };

  const comparison = compareBaselineToReport({ baseline, suite, report });

  assert.equal(comparison.pass, true);
  assert.equal(comparison.runtimes.codex.aggregates.current.precision, null);
  assert.equal(comparison.runtimes.codex.aggregates.current.recall, null);
  assert.equal(comparison.runtimes.codex.aggregates.current.falsePositiveRate, 0);
});

test("cross-runtime divergence increase regresses; improvement does not", () => {
  // Baseline: runtimes agree everywhere except case-pos at repeat 1 (divergent).
  const baselineStatuses = { "claude-code/case-pos/1": "not_triggered" };
  const baseline = makeBaseline({ runtimeIds: ["codex", "claude-code"], statuses: baselineStatuses });
  const baselineComparison = compareBaselineToReport({ baseline, suite: SUITE, report: makeReport({ runtimeIds: ["codex", "claude-code"], statuses: baselineStatuses }) });
  assert.equal(baselineComparison.pass, true, "stable divergence is not a regression");
  assert.equal(baselineComparison.divergence.applicable, true);
  const stableCase = baselineComparison.divergence.cases.find((c) => c.caseId === "case-pos");
  assert.equal(stableCase.current.rate, 1, "case-pos diverges on its only repeat: rate 1, normalized by comparable repeats");
  const agreeingCase = baselineComparison.divergence.cases.find((c) => c.caseId === "case-neg");
  assert.equal(agreeingCase.current.rate, 0);

  // Current: divergence appears on a previously agreeing case.
  const currentStatuses = {
    ...baselineStatuses,
    "claude-code/case-neg/1": "triggered"
  };
  const comparison = compareBaselineToReport({
    baseline, suite: SUITE,
    report: makeReport({ runtimeIds: ["codex", "claude-code"], statuses: currentStatuses })
  });

  assert.equal(comparison.pass, false);
  const kinds = comparison.failedChecks.map((c) => c.kind);
  assert.ok(kinds.includes("case-activation-increase"), "the FP side also regresses per-case");
  assert.ok(kinds.includes("divergence-increase"));
});

test("skill identity mismatch is a validation error", () => {
  const baseline = makeBaseline({});
  const report = { ...makeReport({}), skill: "other-skill" };

  assert.throws(() => compareBaselineToReport({ baseline, suite: SUITE, report }), RegressionValidationError);
});

test("a missing current runtimeVersion on one observation is comparison-unable, not silently ignored", () => {
  const baseline = makeBaseline({});
  const report = makeReport({});
  const guilty = report.observations.find((obs) => obs.caseId === "case-neg");
  guilty.runtimeVersion = null;

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false, "one unversioned row must not borrow coherence from the others");
  assert.ok(comparison.unableReasons.some((r) => /runtimeVersion/.test(r)));
});

test("an empty current runtimeVersion is comparison-unable", () => {
  const baseline = makeBaseline({});
  const report = makeReport({});
  report.observations[0].runtimeVersion = "   ";

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.unableReasons.some((r) => /runtimeVersion/.test(r)));
});

test("mixed current runtime versions are comparison-unable", () => {
  const baseline = makeBaseline({});
  const report = makeReport({ runs: 2 });
  report.observations.find((obs) => obs.repeat === 2).runtimeVersion = "codex 9.9.9";

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.unableReasons.some((r) => /mixed runtime versions/.test(r)));
});

test("unresolved cells exit-2 but retain measured regression diagnostics with real denominators", () => {
  // Baseline: everything triggered on positives. Current: positive fully
  // measured as not_triggered (a real drop), negative infra_error.
  const baseline = makeBaseline({});
  const report = makeReport({ statuses: { "codex/case-pos/1": "not_triggered", "codex/case-neg/1": "infra_error" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false, "partial evidence never passes");
  assert.ok(comparison.unableReasons.some((r) => /non-binary/.test(r)));

  // The already-established positive regression is preserved, with real
  // valid-run denominators (not runs-activations invention).
  const diagnostic = comparison.diagnostics.runtimes.codex;
  const posCase = diagnostic.cases["case-pos"];
  assert.equal(posCase.validRuns, 1);
  assert.equal(posCase.activationRate, 0);
  const measuredRegression = diagnostic.measuredRegressions?.find((r) => r.caseId === "case-pos");
  assert.ok(measuredRegression, "measured per-case regression must survive the unable return");
  assert.equal(measuredRegression.check, "case-activation-decrease");
  assert.equal(measuredRegression.baseline, 1);
  assert.equal(measuredRegression.current, 0);

  // Measured quality: recall over valid cells is 0; the unresolved negative
  // cell contributes NOTHING to fp/tn (no invented TN).
  assert.equal(diagnostic.measured.tp, 0);
  assert.equal(diagnostic.measured.fn, 1);
  assert.equal(diagnostic.measured.fp, 0);
  assert.equal(diagnostic.measured.tn, 0);
  assert.equal(diagnostic.measured.recall, 0);
  assert.deepEqual(diagnostic.unresolved, [{ runtime: "codex", caseId: "case-neg", repeat: 1, status: "infra_error" }]);
});

test("an unbaselined runtime with unresolved evidence cannot disappear into a pass", () => {
  const baseline = makeBaseline({ runtimeIds: ["codex"] });
  const report = makeReport({ runtimeIds: ["codex", "claude-code"], statuses: { "claude-code/case-pos/1": "timeout" } });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false, "extra runtime with unresolved evidence blocks the gate");
  assert.ok(comparison.unableReasons.some((r) => /claude-code/.test(r) && /non-binary/.test(r)));
});

test("an unbaselined runtime with missing version evidence cannot disappear into a pass", () => {
  const baseline = makeBaseline({ runtimeIds: ["codex"] });
  const report = makeReport({ runtimeIds: ["codex", "claude-code"] });
  report.observations.find((obs) => obs.runtime === "claude-code").runtimeVersion = null;

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.unableReasons.some((r) => /claude-code/.test(r) && /runtimeVersion/.test(r)));
});

test("a complete coherent unbaselined runtime stays metadata and does not block the gate", () => {
  const baseline = makeBaseline({ runtimeIds: ["codex"] });
  const report = makeReport({ runtimeIds: ["codex", "claude-code"] });

  const comparison = compareBaselineToReport({ baseline, suite: SUITE, report });

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.pass, true);
  assert.deepEqual(comparison.unbaselinedRuntimes, ["claude-code"]);
  assert.equal(comparison.diagnostics.runtimes["claude-code"].unbaselined, true);
});
