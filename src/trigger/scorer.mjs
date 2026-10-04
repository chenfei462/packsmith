import { TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { validateTriggerSuite } from "./schema.mjs";

const BINARY_STATUSES = new Set(["triggered", "not_triggered"]);
const UNRESOLVED_STATUSES = ["ambiguous", "infra_error", "timeout", "unsupported"];

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Score a complete case × runtime × repeat grid. Only triggered and
 * not_triggered enter the confusion matrix. Every other execution state is
 * kept visible and makes the overall verdict incomplete unless a measured
 * false positive/negative already establishes failure. Undefined ratios are
 * null, never a manufactured 100%.
 */
export function scoreTriggerResults({ suite, runtimeIds, runs, observations }) {
  const suiteProblems = validateTriggerSuite(suite);
  if (suiteProblems.length > 0) {
    throw new TypeError(`invalid trigger suite: ${suiteProblems.join("; ")}`);
  }
  if (!Array.isArray(runtimeIds) || runtimeIds.length === 0 || runtimeIds.some((id) => typeof id !== "string" || id.length === 0) || new Set(runtimeIds).size !== runtimeIds.length) {
    throw new TypeError("runtimeIds must be a non-empty array of unique runtime ids");
  }
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new TypeError("runs must be a positive safe integer");
  }
  if (!Array.isArray(observations)) {
    throw new TypeError("observations must be an array");
  }

  const caseById = new Map(suite.cases.map((entry) => [entry.id, entry]));
  const byKey = new Map();
  for (const item of observations) {
    if (item === null || typeof item !== "object" || !runtimeIds.includes(item.runtime) || !caseById.has(item.caseId) || !Number.isSafeInteger(item.repeat) || item.repeat < 1 || item.repeat > runs || !TRIGGER_STATUSES.includes(item.status)) {
      throw new TypeError("observation has an unknown runtime, case, repeat, or execution status");
    }
    const key = `${item.runtime}\u0000${item.caseId}\u0000${item.repeat}`;
    if (byKey.has(key)) {
      throw new TypeError(`duplicate observation for ${item.runtime}/${item.caseId}/${item.repeat}`);
    }
    byKey.set(key, item);
  }

  const runtimes = {};
  for (const runtimeId of runtimeIds) {
    const confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
    const unresolved = { ambiguous: 0, infra_error: 0, timeout: 0, unsupported: 0 };
    const cases = {};
    for (const entry of suite.cases) {
      const statuses = [];
      for (let repeat = 1; repeat <= runs; repeat += 1) {
        const key = `${runtimeId}\u0000${entry.id}\u0000${repeat}`;
        const item = byKey.get(key);
        if (item === undefined) {
          throw new TypeError(`missing observation for ${runtimeId}/${entry.id}/${repeat}`);
        }
        statuses.push(item.status);
        if (item.status === "triggered") {
          confusion[entry.expect === "trigger" ? "tp" : "fp"] += 1;
        } else if (item.status === "not_triggered") {
          confusion[entry.expect === "trigger" ? "fn" : "tn"] += 1;
        } else {
          unresolved[item.status] += 1;
        }
      }
      cases[entry.id] = {
        expect: entry.expect,
        statuses,
        triggered: statuses.filter((status) => status === "triggered").length,
        validRuns: statuses.filter((status) => BINARY_STATUSES.has(status)).length
      };
    }
    const validRuns = confusion.tp + confusion.fp + confusion.tn + confusion.fn;
    const totalRuns = suite.cases.length * runs;
    runtimes[runtimeId] = {
      confusion,
      unresolved,
      validRuns,
      totalRuns,
      precision: ratio(confusion.tp, confusion.tp + confusion.fp),
      recall: ratio(confusion.tp, confusion.tp + confusion.fn),
      falsePositiveRate: ratio(confusion.fp, confusion.fp + confusion.tn),
      infrastructureErrorRate: ratio(unresolved.infra_error, totalRuns),
      cases
    };
  }

  const divergence = [];
  const incomparableCases = [];
  if (runtimeIds.length > 1) {
    for (const entry of suite.cases) {
      const counts = {};
      const comparable = runtimeIds.every((runtimeId) => runtimes[runtimeId].cases[entry.id].validRuns === runs);
      if (!comparable) {
        incomparableCases.push(entry.id);
        continue;
      }
      for (const runtimeId of runtimeIds) {
        counts[runtimeId] = runtimes[runtimeId].cases[entry.id].triggered;
      }
      if (new Set(Object.values(counts)).size > 1) {
        divergence.push({ caseId: entry.id, activationCounts: counts, runs });
      }
    }
  }

  const anyError = Object.values(runtimes).some(({ confusion }) => confusion.fp > 0 || confusion.fn > 0);
  const anyUnresolved = Object.values(runtimes).some(({ unresolved }) => UNRESOLVED_STATUSES.some((status) => unresolved[status] > 0));
  const status = anyError || divergence.length > 0 ? "fail" : anyUnresolved ? "incomplete" : "pass";
  return {
    schemaVersion: 1,
    skill: suite.skill,
    runs,
    runtimeIds: [...runtimeIds],
    status,
    exitCode: status === "pass" ? 0 : status === "fail" ? 1 : 2,
    runtimes,
    divergence,
    incomparableCases
  };
}
