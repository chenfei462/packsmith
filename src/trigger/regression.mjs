import { RUNTIME_IDS } from "../runtimes/base.mjs";

// Trigger regression comparator (Wave 3 M11).
// The complete comparison definition — per-case activation decrease/increase,
// aggregate recall/precision/FPR regressions, per-case paired divergence
// normalized by comparable repeats, and the metadata/policy treatment of
// sample-count and runtime-version drift — lives in docs/regression-gate.md.
// This module implements exactly that definition and nothing more. Pure:
// no fs, no model, no clocks.

export class RegressionUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegressionUsageError";
    this.isUsageError = true;
  }
}

export class RegressionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegressionValidationError";
    this.isValidationError = true;
  }
}

const BINARY_STATUSES = ["triggered", "not_triggered"];
const UNRESOLVED_STATUSES = ["ambiguous", "infra_error", "timeout", "unsupported"];

function requireObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegressionValidationError(`${label} must be a JSON object`);
  }
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function isBinary(status) {
  return BINARY_STATUSES.includes(status);
}

/**
 * MEASURED diagnostics for one runtime: every case reports real denominators
 * (validRuns = binary observations only) — FN/TN are never invented for
 * non-binary outcomes. Aggregates are computed over valid cells only, and
 * unresolved counts stay explicit. Used both for the full comparison (where
 * all cells are valid) and for the retained diagnostics of an unable gate.
 */
function measuredRuntime(observations, runtimeId, suiteCases) {
  const cells = observations.filter((obs) => obs.runtime === runtimeId);
  const cases = {};
  let tp = 0, fn = 0, fp = 0, tn = 0;
  let positiveCases = 0, negativeCases = 0;
  const unresolved = [];

  for (const entry of suiteCases) {
    const cell = cells.filter((obs) => obs.caseId === entry.id);
    const binary = cell.filter((obs) => isBinary(obs.status));
    const activations = binary.filter((obs) => obs.status === "triggered").length;
    const invalid = cell.length - binary.length;
    for (const obs of cell) {
      if (!isBinary(obs.status)) {
        unresolved.push({ runtime: runtimeId, caseId: entry.id, repeat: obs.repeat, status: obs.status });
      }
    }

    if (entry.expect === "trigger") {
      positiveCases += 1;
      tp += activations;
      fn += binary.length - activations;
    } else {
      negativeCases += 1;
      fp += activations;
      tn += binary.length - activations;
    }

    cases[entry.id] = {
      expect: entry.expect,
      totalRuns: cell.length,
      validRuns: binary.length,
      unresolvedRuns: invalid,
      activations,
      activationRate: rate(activations, binary.length)
    };
  }

  return {
    cases,
    unresolved,
    measured: {
      tp, fp, tn, fn,
      recall: positiveCases > 0 ? rate(tp, tp + fn) : null,
      precision: rate(tp, tp + fp),
      falsePositiveRate: negativeCases > 0 ? rate(fp, fp + tn) : null
    }
  };
}

/**
 * Sanitized measured-cell summary of current evidence without any baseline
 * comparison. Used to retain measured facts (real valid-run denominators,
 * explicit unresolved states) when a mid-run source drift forces the
 * comparison itself to be refused — never to produce a pass.
 */
export function measureCurrentEvidence(report, suite) {
  requireObject(report, "report");
  requireObject(suite, "suite");
  if (!Array.isArray(report.runtimeIds) || !Array.isArray(report.observations) || !Array.isArray(suite.cases)) {
    throw new RegressionValidationError("measureCurrentEvidence requires runtimeIds, observations and suite cases");
  }
  const runtimes = {};
  for (const runtimeId of report.runtimeIds) {
    const measured = measuredRuntime(report.observations, runtimeId, suite.cases);
    runtimes[runtimeId] = {
      cases: measured.cases,
      unresolved: measured.unresolved,
      measured: measured.measured
    };
  }
  return { runtimes };
}

/** Per-case activation counts for one runtime (fully measured grid). */function caseCounts(observations, runtimeId, suiteCases, runs) {
  const byCase = {};
  for (const entry of suiteCases) {
    const activations = observations.filter(
      (obs) => obs.runtime === runtimeId && obs.caseId === entry.id && obs.status === "triggered"
    ).length;
    byCase[entry.id] = { activations, runs: runs, activationRate: rate(activations, runs) };
  }
  return byCase;
}

/**
 * Paired cross-runtime divergence per case, normalized by comparable repeats.
 * Returns { applicable: false } when fewer than two runtimes participate
 * (structurally N/A).
 */
function divergenceForRuntimes(observations, runtimeIds, suiteCases, runs) {
  if (runtimeIds.length < 2) {
    return { applicable: false, cases: [] };
  }

  const cases = [];
  for (const entry of suiteCases) {
    let comparable = 0, divergent = 0;
    for (let repeat = 1; repeat <= runs; repeat += 1) {
      const statuses = runtimeIds.map(
        (runtimeId) => observations.find((obs) => obs.runtime === runtimeId && obs.caseId === entry.id && obs.repeat === repeat)?.status ?? null
      );
      if (statuses.some((status) => !isBinary(status))) {
        continue; // not comparable at this repeat
      }
      comparable += 1;
      const activations = statuses.filter((status) => status === "triggered").length;
      if (activations > 0 && activations < statuses.length) {
        divergent += 1;
      }
    }
    cases.push({
      caseId: entry.id,
      expect: entry.expect,
      divergent,
      comparable,
      rate: rate(divergent, comparable)
    });
  }
  return { applicable: true, cases };
}

/**
 * Compare a validated M10 baseline against current M8 evidence.
 * `report` is an M8 trigger-evaluation shaped object (fresh from the runner,
 * or imported through the M9 grid validation). `skillContentChanged` is
 * provenance metadata computed by the caller; it never affects the verdict.
 *
 * Exit-code mapping (docs/regression-gate.md):
 *   - throws RegressionValidationError for malformed identity/schema
 *     (wrong skill, invalid shapes) — exit 1 upstream;
 *   - returns { comparable: false, unableReasons, diagnostics } for missing
 *     expected rows, non-binary outcomes, or missing/incoherent current
 *     runtime versions — incomplete evidence, exit 2 upstream. The
 *     diagnostics retain every fully measured cell (real valid-run
 *     denominators), measured quality over valid cells, unresolved states,
 *     and measured regression candidates — infrastructure precedence never
 *     discards measured failure evidence, but partial evidence never passes;
 *   - returns the full comparison otherwise.
 */
export function compareBaselineToReport({ baseline, suite, report, skillContentChanged = false }) {
  requireObject(baseline, "baseline");
  requireObject(suite, "suite");
  requireObject(report, "report");

  if (report.skill !== baseline.skill) {
    throw new RegressionValidationError(
      `current evidence skill "${report.skill}" does not match the baseline skill "${baseline.skill}"`
    );
  }
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new RegressionValidationError("current suite has no cases");
  }
  if (!Array.isArray(baseline.runtimes) || baseline.runtimes.length === 0) {
    throw new RegressionValidationError("baseline declares no runtimes");
  }
  if (!Array.isArray(report.runtimeIds) || report.runtimeIds.length === 0 ||
      report.runtimeIds.some((id) => !RUNTIME_IDS.includes(id))) {
    throw new RegressionValidationError("current evidence declares no valid runtimes");
  }
  if (!Number.isSafeInteger(report.runs) || report.runs < 1) {
    throw new RegressionValidationError("current evidence runs must be a positive integer");
  }
  if (!Array.isArray(report.observations)) {
    throw new RegressionValidationError("current evidence observations must be an array");
  }

  const unableReasons = [];
  if (report.observations.length === 0) {
    // An empty observation list is INCOMPLETE evidence (unable, exit 2
    // upstream), not a schema violation — no expected slot may silently pass.
    unableReasons.push("current evidence has no observations");
  }

  // A baseline runtime missing from the current evidence is a dropped
  // runtime: comparison unable, never a pass.
  const missingRuntimes = baseline.runtimes.filter((id) => !report.runtimeIds.includes(id));
  if (missingRuntimes.length > 0) {
    unableReasons.push(`baseline runtimes missing from current evidence: ${missingRuntimes.join(", ")}`);
  }

  const comparedRuntimes = baseline.runtimes.filter((id) => report.runtimeIds.includes(id));
  const unbaselinedRuntimes = report.runtimeIds.filter((id) => !baseline.runtimes.includes(id));

  // Completeness, version coherence and binary checks apply to ALL declared
  // current runtimes — including unbaselined ones — so an extra runtime with
  // unresolved or unversioned evidence cannot disappear into a pass.
  for (const runtimeId of report.runtimeIds) {
    const cells = report.observations.filter((obs) => obs.runtime === runtimeId);
    const expectedSlots = suite.cases.length * report.runs;
    if (cells.length !== expectedSlots) {
      unableReasons.push(
        `runtime "${runtimeId}" grid incomplete: expected ${expectedSlots} observations, got ${cells.length}`
      );
    }

    const missingVersion = cells.filter((obs) => typeof obs.runtimeVersion !== "string" || obs.runtimeVersion.trim().length === 0);
    if (missingVersion.length > 0) {
      unableReasons.push(
        `runtime "${runtimeId}" has ${missingVersion.length} observation(s) missing a non-empty runtimeVersion`
      );
    }
    const versions = [...new Set(cells.map((obs) => obs.runtimeVersion).filter((v) => typeof v === "string" && v.trim().length > 0))];
    if (versions.length > 1) {
      unableReasons.push(`runtime "${runtimeId}" has mixed runtime versions: ${versions.join(", ")}`);
    }

    const nonBinary = cells.filter((obs) => !isBinary(obs.status));
    if (nonBinary.length > 0) {
      const summary = nonBinary.slice(0, 8).map((obs) => `${obs.runtime}/${obs.caseId}/${obs.repeat}:${obs.status}`).join(", ");
      unableReasons.push(
        `runtime "${runtimeId}" contains ${nonBinary.length} non-binary observation(s) (unresolved states are not behavioral negatives): ${summary}`
      );
    }
  }

  // ---- Retained measured diagnostics (never a pass, never discarded) ----
  const diagnostics = {
    runtimes: {},
    measuredRegressions: []
  };
  for (const runtimeId of report.runtimeIds) {
    const measuredRuntimeData = measuredRuntime(report.observations, runtimeId, suite.cases);
    const entry = {
      unbaselined: unbaselinedRuntimes.includes(runtimeId),
      cases: measuredRuntimeData.cases,
      unresolved: measuredRuntimeData.unresolved,
      measured: measuredRuntimeData.measured
    };

    // Measured regression candidates against the baseline rates — computed
    // per fully-or-partially measured cell with real valid-run denominators,
    // retained even when other cells or runtimes are unresolved.
    if (comparedRuntimes.includes(runtimeId)) {
      const baselineCases = {};
      for (const suiteCase of suite.cases) {
        const cell = baseline.observations.filter((obs) => obs.runtime === runtimeId && obs.caseId === suiteCase.id);
        const activations = cell.filter((obs) => obs.status === "triggered").length;
        baselineCases[suiteCase.id] = { activations, runs: cell.length, activationRate: rate(activations, cell.length) };
      }
      entry.baseline = { cases: baselineCases };

      for (const suiteCase of suite.cases) {
        const prior = baselineCases[suiteCase.id];
        const current = measuredRuntimeData.cases[suiteCase.id];
        if (prior.activationRate === null || current.activationRate === null) {
          continue; // no valid current evidence for this cell
        }
        const regressed =
          (suiteCase.expect === "trigger" && current.activationRate < prior.activationRate) ||
          (suiteCase.expect === "no-trigger" && current.activationRate > prior.activationRate);
        if (regressed) {
          const check = suiteCase.expect === "trigger" ? "case-activation-decrease" : "case-activation-increase";
          entry.measuredRegressions = entry.measuredRegressions ?? [];
          entry.measuredRegressions.push({ check, caseId: suiteCase.id, baseline: prior.activationRate, current: current.activationRate });
          diagnostics.measuredRegressions.push({ kind: check, runtime: runtimeId, caseId: suiteCase.id, baseline: prior.activationRate, current: current.activationRate });
        }
      }
    }

    diagnostics.runtimes[runtimeId] = entry;
  }

  if (unableReasons.length > 0) {
    return { comparable: false, unableReasons, diagnostics, skillContentChanged };
  }

  // ---- Metadata/policy (never gate failures by themselves) ----
  const versionDrift = {};
  for (const runtimeId of comparedRuntimes) {
    const versions = [...new Set(
      report.observations.filter((obs) => obs.runtime === runtimeId).map((obs) => obs.runtimeVersion)
    )];
    const current = versions.length === 1 ? versions[0] : null;
    const prior = typeof baseline.runtimeVersions?.[runtimeId] === "string" ? baseline.runtimeVersions[runtimeId] : null;
    versionDrift[runtimeId] = { baseline: prior, current, changed: prior !== null && current !== null && prior !== current };
  }

  const runsDrift = { baseline: baseline.runs, current: report.runs, changed: baseline.runs !== report.runs };

  // ---- Per-runtime per-case and aggregate comparison (fully measured) ----
  const baselineObservations = baseline.observations;
  const comparedObservations = report.observations.filter((obs) => comparedRuntimes.includes(obs.runtime));
  const runtimes = {};
  const failedChecks = [];

  for (const runtimeId of comparedRuntimes) {
    const baselineCounts = caseCounts(baselineObservations, runtimeId, suite.cases, baseline.runs);
    const currentCounts = caseCounts(comparedObservations, runtimeId, suite.cases, report.runs);
    const cases = {};

    for (const entry of suite.cases) {
      const prior = baselineCounts[entry.id];
      const current = currentCounts[entry.id];
      let regression = false;
      let check = null;
      if (entry.expect === "trigger" && current.activationRate < prior.activationRate) {
        regression = true;
        check = "case-activation-decrease";
      } else if (entry.expect === "no-trigger" && current.activationRate > prior.activationRate) {
        regression = true;
        check = "case-activation-increase";
      }
      if (regression) {
        failedChecks.push({
          kind: check, runtime: runtimeId, caseId: entry.id,
          baseline: prior.activationRate, current: current.activationRate
        });
      }
      cases[entry.id] = {
        expect: entry.expect,
        baseline: prior,
        current,
        delta: current.activationRate - prior.activationRate,
        regression,
        ...(check !== null ? { check } : {})
      };
    }

    const baselineAgg = measuredRuntime(baselineObservations, runtimeId, suite.cases).measured;
    const currentAgg = measuredRuntime(comparedObservations, runtimeId, suite.cases).measured;
    const aggregateRegressions = [];
    for (const [field, direction, kind] of [
      ["recall", "decrease", "recall-regression"],
      ["precision", "decrease", "precision-regression"],
      ["falsePositiveRate", "increase", "fpr-regression"]
    ]) {
      const prior = baselineAgg[field];
      const current = currentAgg[field];
      if (prior === null || current === null) {
        continue; // structurally N/A on at least one side — never 100%, never 0%
      }
      const regressed = direction === "decrease" ? current < prior : current > prior;
      if (regressed) {
        aggregateRegressions.push({ check: kind, baseline: prior, current });
        failedChecks.push({ kind, runtime: runtimeId, baseline: prior, current });
      }
    }

    runtimes[runtimeId] = {
      cases,
      aggregates: { baseline: baselineAgg, current: currentAgg, regressions: aggregateRegressions }
    };
  }

  // ---- Cross-runtime paired divergence ----
  const baselineDivergence = divergenceForRuntimes(baselineObservations, comparedRuntimes, suite.cases, baseline.runs);
  const currentDivergence = divergenceForRuntimes(comparedObservations, comparedRuntimes, suite.cases, report.runs);
  const divergenceCases = [];
  if (baselineDivergence.applicable && currentDivergence.applicable) {
    for (const currentCase of currentDivergence.cases) {
      const priorCase = baselineDivergence.cases.find((c) => c.caseId === currentCase.caseId);
      const priorRate = priorCase?.rate ?? null;
      const regression = priorRate !== null && currentCase.rate !== null && currentCase.rate > priorRate;
      if (regression) {
        failedChecks.push({
          kind: "divergence-increase", caseId: currentCase.caseId,
          baseline: priorRate, current: currentCase.rate
        });
      }
      divergenceCases.push({
        caseId: currentCase.caseId,
        baseline: { divergent: priorCase?.divergent ?? null, comparable: priorCase?.comparable ?? null, rate: priorRate },
        current: { divergent: currentCase.divergent, comparable: currentCase.comparable, rate: currentCase.rate },
        regression
      });
    }
  }

  return {
    comparable: true,
    skill: baseline.skill,
    runs: { baseline: baseline.runs, current: report.runs },
    versionDrift,
    runsDrift,
    unbaselinedRuntimes,
    skillContentChanged,
    diagnostics,
    runtimes,
    divergence: {
      applicable: baselineDivergence.applicable && currentDivergence.applicable,
      cases: divergenceCases,
      regressions: divergenceCases.filter((c) => c.regression)
    },
    failedChecks,
    pass: failedChecks.length === 0
  };
}
