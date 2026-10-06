import path from "node:path";
import fs from "node:fs/promises";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { RUNTIME_IDS, TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { claudeCodeAdapter } from "../runtimes/claude-code.mjs";
import { codexAdapter } from "../runtimes/codex.mjs";
import { cursorAdapter } from "../runtimes/cursor.mjs";
import { geminiCliAdapter } from "../runtimes/gemini-cli.mjs";
import { opencodeAdapter } from "../runtimes/opencode.mjs";
import { parseSkill } from "../core/skill-parser.mjs";
import { parseTriggerSuiteJson } from "./schema.mjs";

const ADAPTERS = Object.freeze({
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  "gemini-cli": geminiCliAdapter,
  opencode: opencodeAdapter
});

export class MatrixUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "MatrixUsageError";
    this.isUsageError = true;
  }
}

export class MatrixValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MatrixValidationError";
    this.isValidationError = true;
  }
}

/**
 * Build the STATIC COMPATIBILITY section from the knowledge-base runtime
 * records and adapter capabilities. Missing/optional fields are `null`
 * (unknown), never `true` or `false` by default. Provenance (source,
 * verifiedOn) is traceable to the KB record.
 */
export function buildStaticCompatibility(knowledgeBase) {
  const runtimes = knowledgeBase.runtimes.filter((r) => r.kind === "runtime");
  const rows = [];

  for (const record of runtimes) {
    const adapter = ADAPTERS[record.id];
    const capabilities = adapter ? adapter.capabilities() : null;
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    const primaryEvidence = evidence[0] ?? null;

    rows.push({
      runtime: record.id,
      staticCompatibility: typeof record.v02Scope?.staticCompatibility === "boolean"
        ? record.v02Scope.staticCompatibility
        : null,
      liveTriggerRunner: typeof record.v02Scope?.liveTriggerRunner === "boolean"
        ? record.v02Scope.liveTriggerRunner
        : null,
      skillDiscoveryEntryFile: typeof record.skillDiscovery?.entryFile === "string"
        ? record.skillDiscovery.entryFile
        : null,
      frontmatterRequired: Array.isArray(record.frontmatter?.required)
        ? record.frontmatter.required
        : null,
      evidenceSource: primaryEvidence?.source ?? null,
      evidenceVerifiedOn: primaryEvidence?.verifiedOn ?? null,
      provenance: `knowledge-base/runtimes/${record.id}.json`
    });
  }

  return rows;
}

/**
 * Validate and import an M8 trigger-evaluation report for the OBSERVED
 * BEHAVIOR section. Recomputes metrics from the raw observations; does NOT
 * trust any score fields in the file. Enforces:
 *   - report.skill matches the target skill
 *   - runtimeIds are valid known runtimes
 *   - every (runtime, caseId, repeat) is unique and within the declared grid
 *   - every status is one of the six trigger statuses
 *   - every observation's runtime/caseId exists in the suite
 * Missing rows make the affected case/runtime unobserved (null), never 100%.
 */
export function importObservedBehavior({ reportJson, suite, expectedSkill }) {
  if (typeof reportJson !== "object" || reportJson === null || Array.isArray(reportJson)) {
    throw new MatrixValidationError("--results file must contain a JSON object");
  }

  if (reportJson.skill !== expectedSkill) {
    throw new MatrixValidationError(
      `results file skill "${reportJson.skill}" does not match the target skill "${expectedSkill}"`
    );
  }

  if (!Array.isArray(reportJson.observations)) {
    throw new MatrixValidationError("results file observations must be an array");
  }

  const declaredRuntimes = reportJson.runtimeIds;
  if (!Array.isArray(declaredRuntimes) || declaredRuntimes.length === 0 ||
      declaredRuntimes.some((id) => !RUNTIME_IDS.includes(id))) {
    throw new MatrixValidationError(
      `results file runtimeIds must be a non-empty array of known runtimes (${RUNTIME_IDS.join(", ")})`
    );
  }

  const runs = reportJson.runs;
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new MatrixValidationError(`results file runs must be a positive integer, got ${JSON.stringify(runs)}`);
  }

  const suiteCaseIds = new Set(suite.cases.map((c) => c.id));
  const caseExpectById = new Map(suite.cases.map((c) => [c.id, c.expect]));

  // Validate grid: every (runtime, caseId, repeat) exactly once.
  const seen = new Set();
  const observations = [];

  for (const obs of reportJson.observations) {
    if (typeof obs !== "object" || obs === null) {
      throw new MatrixValidationError("observation must be an object");
    }
    if (!declaredRuntimes.includes(obs.runtime)) {
      throw new MatrixValidationError(`observation runtime "${obs.runtime}" is not in the declared runtimeIds`);
    }
    if (!suiteCaseIds.has(obs.caseId)) {
      throw new MatrixValidationError(
        `observation caseId "${obs.caseId}" does not exist in the current trigger suite`
      );
    }
    if (!Number.isSafeInteger(obs.repeat) || obs.repeat < 1 || obs.repeat > runs) {
      throw new MatrixValidationError(`observation repeat must be an integer 1..${runs}`);
    }
    if (!TRIGGER_STATUSES.includes(obs.status)) {
      throw new MatrixValidationError(
        `observation status ${JSON.stringify(obs.status)} is not a valid trigger status`
      );
    }

    const key = `${obs.runtime}\u0000${obs.caseId}\u0000${obs.repeat}`;
    if (seen.has(key)) {
      throw new MatrixValidationError(`duplicate observation for ${obs.runtime}/${obs.caseId}/${obs.repeat}`);
    }
    seen.add(key);
    observations.push(obs);
  }

  // Recompute activation rate per runtime per case from actual observations.
  // Only binary statuses (triggered/not_triggered) count; all others are
  // unresolved and make the cell null rather than 0% or 100%.
  const behavior = {};

  for (const runtimeId of declaredRuntimes) {
    behavior[runtimeId] = {};
    for (const entry of suite.cases) {
      const runtimeObservations = observations.filter(
        (obs) => obs.runtime === runtimeId && obs.caseId === entry.id
      );

      if (runtimeObservations.length === 0) {
        behavior[runtimeId][entry.id] = {
          activationRate: null,
          falsePositiveRate: null,
          infrastructureErrorRate: null,
          observed: false,
          triggered: null,
          validRuns: null,
          totalRuns: runs,
          statuses: []
        };
        continue;
      }

      const triggered = runtimeObservations.filter((obs) => obs.status === "triggered").length;
      const notTriggered = runtimeObservations.filter((obs) => obs.status === "not_triggered").length;
      const infraErrors = runtimeObservations.filter((obs) => obs.status === "infra_error").length;
      const validRuns = triggered + notTriggered;
      const observedRuns = runtimeObservations.length;
      const expected = caseExpectById.get(entry.id);

      behavior[runtimeId][entry.id] = {
        activationRate: validRuns === 0 ? null : triggered / validRuns,
        falsePositiveRate: entry.expect === "no-trigger" && (triggered + notTriggered) > 0
          ? triggered / validRuns
          : null,
        infrastructureErrorRate: observedRuns === 0 ? null : infraErrors / observedRuns,
        observed: true,
        triggered,
        validRuns,
        totalRuns: runs,
        statuses: runtimeObservations.map((obs) => obs.status),
        expected
      };
    }
  }

  return {
    sourceSkill: reportJson.skill,
    runs,
    runtimeIds: [...declaredRuntimes],
    observedRuntimes: new Set(observations.map((obs) => obs.runtime)),
    behavior,
    observationCount: observations.length,
    isImportedHistorical: true
  };
}

/**
 * Determine the overall matrix exit code:
 *   0 = all sections valid, no observed failures
 *   1 = static compatibility errors for the target skill (validation)
 *   2 = infrastructure problems reading results/KB
 * Inherited from the doctor convention (plan §8).
 */
export function resolveMatrixExitCode({ staticErrors = 0, observationErrors = 0 }) {
  if (observationErrors > 0) return 2;
  if (staticErrors > 0) return 1;
  return 0;
}

/**
 * Run the full matrix for one target skill directory. Combines:
 *   1. static compatibility from the KB + adapter capabilities
 *   2. observed behavior from an optional M8 report (--results)
 * Returns a structured report for the terminal/JSON reporters.
 */
export async function runMatrix({ targetPath, knowledgeBase, resultsJson }) {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new MatrixUsageError("matrix requires one <skill-dir> path");
  }

  const skillDir = path.resolve(targetPath);

  // Validate the target skill exists and has a SKILL.md.
  const skill = await parseSkill(skillDir);

  if (skill.parse.status === "missing-skill-file") {
    throw new MatrixUsageError(`SKILL.md is missing from ${skillDir}`);
  }

  if (skill.parse.status === "invalid-yaml") {
    throw new MatrixValidationError("SKILL.md contains invalid YAML; fix the frontmatter before running matrix");
  }

  if (skill.parse.status === "missing-frontmatter" || skill.parse.status === "empty-frontmatter") {
    throw new MatrixValidationError("SKILL.md has no usable frontmatter");
  }

  const declaredName = skill.frontmatter?.name;

  if (typeof declaredName !== "string" || declaredName.trim().length === 0) {
    throw new MatrixValidationError("SKILL.md frontmatter is missing a usable name field");
  }

  const directoryName = path.basename(skillDir);

  if (declaredName !== directoryName) {
    throw new MatrixValidationError(
      `SKILL.md frontmatter name "${declaredName}" does not match the containing directory "${directoryName}"`
    );
  }

  // Static compatibility from the KB.
  const staticCompatibility = buildStaticCompatibility(knowledgeBase);

  // Count static errors for the target skill: a global spec error (from
  // doctor) would be a validation concern, but the matrix's static section
  // records capability facts, not per-skill validation. We report the skill's
  // frontmatter presence as a fact and the runtime records' provenance.

  // Observed behavior from --results (optional).
  let observedBehavior = null;

  if (resultsJson !== undefined) {
    let reportRaw;
    try {
      reportRaw = await fs.readFile(resultsJson, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new MatrixUsageError(`results file does not exist: ${resultsJson}`);
      }
      throw new InfrastructureError(`cannot read results file ${resultsJson}: ${error.message}`, { cause: error });
    }

    let reportParsed;
    try {
      reportParsed = JSON.parse(reportRaw);
    } catch {
      throw new MatrixValidationError("results file is not valid JSON");
    }

    // The results file must have a trigger suite for grid validation.
    const suitePath = path.join(skillDir, "evals", "triggers.json");
    let suiteRaw;
    try {
      suiteRaw = await fs.readFile(suitePath, "utf8");
    } catch {
      throw new MatrixValidationError(
        `trigger suite is missing: ${suitePath}; run packsmith trigger init first or omit --results for static-only output`
      );
    }

    const parsed = parseTriggerSuiteJson(suiteRaw, { expectedSkill: declaredName });
    if (!parsed.ok) {
      throw new MatrixValidationError(`invalid trigger suite ${suitePath}: ${parsed.problems.join("; ")}`);
    }

    observedBehavior = importObservedBehavior({
      reportJson: reportParsed,
      suite: parsed.suite,
      expectedSkill: declaredName
    });
  }

  return {
    schemaVersion: 1,
    skill: declaredName,
    skillDir,
    staticCompatibility,
    observedBehavior,
    ...(observedBehavior !== null ? { resultsFile: path.resolve(resultsJson) } : {})
  };
}
