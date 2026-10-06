import path from "node:path";
import fs from "node:fs/promises";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { RUNTIME_IDS, TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { claudeCodeAdapter } from "../runtimes/claude-code.mjs";
import { codexAdapter } from "../runtimes/codex.mjs";
import { cursorAdapter } from "../runtimes/cursor.mjs";
import { geminiCliAdapter } from "../runtimes/gemini-cli.mjs";
import { opencodeAdapter } from "../runtimes/opencode.mjs";
import { runDoctor } from "../doctor.mjs";
import { parseTriggerSuiteJson } from "./schema.mjs";
import { scoreTriggerResults } from "./scorer.mjs";

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
 * records. Missing/optional fields are `null` (unknown), never defaulted.
 * Provenance (source, verifiedOn) is traceable to the KB record.
 */
export function buildStaticCompatibility(knowledgeBase) {
  const runtimes = knowledgeBase.runtimes.filter((r) => r.kind === "runtime");
  const rows = [];

  for (const record of runtimes) {
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
 * BEHAVIOR section. Enforces a COMPLETE grid — incomplete imports are
 * rejected with MatrixValidationError, not filled with synthetic ambiguous
 * observations (no runtime event is not a real ambiguous result, and a
 * huge runs value would make the fill loop a DoS vector). Delegates metric
 * computation to `scoreTriggerResults` (the M8 scorer) so precision, recall,
 * FPR, infrastructure rate and paired divergence are computed by the same
 * code path.
 */
export function importObservedBehavior({ reportJson, suite, expectedSkill }) {
  if (typeof reportJson !== "object" || reportJson === null || Array.isArray(reportJson)) {
    throw new MatrixValidationError("--results file must contain a JSON object");
  }

  if (reportJson.schemaVersion !== 1) {
    throw new MatrixValidationError(
      `results file schemaVersion must be 1, got ${JSON.stringify(reportJson.schemaVersion)}`
    );
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
      declaredRuntimes.some((id) => typeof id !== "string" || !RUNTIME_IDS.includes(id))) {
    throw new MatrixValidationError(
      `results file runtimeIds must be a non-empty array of known runtimes (${RUNTIME_IDS.join(", ")})`
    );
  }
  if (new Set(declaredRuntimes).size !== declaredRuntimes.length) {
    throw new MatrixValidationError("results file runtimeIds must be unique (no duplicates)");
  }

  const runs = reportJson.runs;
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > 20) {
    throw new MatrixValidationError(`results file runs must be an integer 1..20, got ${JSON.stringify(runs)}`);
  }

  const suiteCaseIds = new Set(suite.cases.map((c) => c.id));
  const caseExpectById = new Map(suite.cases.map((c) => [c.id, c.expect]));

  // Validate observations before grid completeness check.
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
    if (obs.expect !== undefined && obs.expect !== caseExpectById.get(obs.caseId)) {
      throw new MatrixValidationError(
        `observation expect "${obs.expect}" does not match the suite expectation "${caseExpectById.get(obs.caseId)}" for case "${obs.caseId}"`
      );
    }

    const key = `${obs.runtime}\u0000${obs.caseId}\u0000${obs.repeat}`;
    if (seen.has(key)) {
      throw new MatrixValidationError(`duplicate observation for ${obs.runtime}/${obs.caseId}/${obs.repeat}`);
    }
    seen.add(key);
    observations.push(obs);
  }

  // Enforce a COMPLETE grid: observations.length must equal
  // declaredRuntimes × suite.cases × runs. An incomplete import is rejected
  // — missing runtime events are not real ambiguous results.
  const expectedSlots = declaredRuntimes.length * suite.cases.length * runs;
  if (observations.length !== expectedSlots) {
    throw new MatrixValidationError(
      `results file grid is incomplete: expected ${expectedSlots} observations (${declaredRuntimes.length} runtimes × ${suite.cases.length} cases × ${runs} runs), got ${observations.length}`
    );
  }

  // Delegate to the M8 scorer for all metric computation.
  const score = scoreTriggerResults({ suite, runtimeIds: declaredRuntimes, runs, observations });

  // Build per-runtime per-case behavior cells from the scorer output.
  const behavior = {};
  for (const runtimeId of declaredRuntimes) {
    behavior[runtimeId] = {};
    const runtimeScore = score.runtimes[runtimeId];

    for (const entry of suite.cases) {
      const caseData = runtimeScore.cases[entry.id];
      const cellObservations = observations.filter(
        (obs) => obs.runtime === runtimeId && obs.caseId === entry.id
      );

      behavior[runtimeId][entry.id] = {
        activationRate: caseData.validRuns > 0 ? caseData.triggered / caseData.validRuns : null,
        falsePositiveRate: entry.expect === "no-trigger" && caseData.validRuns > 0
          ? cellObservations.filter((o) => o.status === "triggered").length / caseData.validRuns
          : null,
        infrastructureErrorRate: cellObservations.filter((o) => o.status === "infra_error").length / cellObservations.length,
        observed: true,
        triggered: caseData.triggered,
        validRuns: caseData.validRuns,
        totalRuns: runs,
        statuses: cellObservations.map((obs) => obs.status),
        expected: entry.expect
      };
    }
  }

  // Collect runtime versions; multiple distinct versions are listed.
  const runtimeVersions = {};
  for (const runtimeId of declaredRuntimes) {
    const versions = [...new Set(
      observations.filter((o) => o.runtime === runtimeId && o.runtimeVersion).map((o) => o.runtimeVersion)
    )];
    runtimeVersions[runtimeId] = versions.length === 1 ? versions[0] : versions.length > 1 ? versions : null;
  }

  return {
    sourceSkill: reportJson.skill,
    runs,
    runtimeIds: [...declaredRuntimes],
    observedRuntimes: [...new Set(observations.map((obs) => obs.runtime))],
    runtimeVersions,
    behavior,
    observationCount: observations.length,
    score: {
      status: score.status,
      exitCode: score.exitCode,
      runtimes: Object.fromEntries(
        declaredRuntimes.map((runtimeId) => {
          const r = score.runtimes[runtimeId];
          return [runtimeId, {
            confusion: r.confusion,
            unresolved: r.unresolved,
            precision: r.precision,
            recall: r.recall,
            falsePositiveRate: r.falsePositiveRate,
            infrastructureErrorRate: r.infrastructureErrorRate,
            validRuns: r.validRuns,
            totalRuns: r.totalRuns
          }];
        })
      ),
      divergence: score.divergence,
      incomparableCases: score.incomparableCases
    },
    isImportedHistorical: true
  };
}

/**
 * Run the full matrix for one target path (workspace, project, or single
 * skill directory). Combines:
 *   1. static validation via the existing doctor (reuses discoverSkillRoots
 *      for project/pack/multi-skill discovery)
 *   2. static compatibility from the KB + adapter capabilities
 *   3. observed behavior from an optional M8 report (--results)
 */
export async function runMatrix({ targetPath, knowledgeBase, resultsJson }) {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new MatrixUsageError("matrix requires one <path> argument");
  }

  const resolvedPath = path.resolve(targetPath);

  // Run doctor for static validation (reuses discoverSkillRoots for
  // project/pack/multi-skill support; gives spec/security/context errors).
  const doctorReport = await runDoctor({ targetPath: resolvedPath });

  // Discover skill roots (doctor already did this; reuse its parsed skills).
  const skillRoots = doctorReport.skills.map((s) => ({
    name: s.name,
    directory: s.directory
  }));

  if (skillRoots.length === 0) {
    throw new MatrixUsageError(`no skill found at ${resolvedPath}`);
  }

  // If --results is provided, read it early to determine which skill the
  // report belongs to, then find the matching skill root.
  let reportSkillName = null;
  let reportParsed = null;

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

    try {
      reportParsed = JSON.parse(reportRaw);
    } catch {
      throw new MatrixValidationError("results file is not valid JSON");
    }

    if (typeof reportParsed.skill !== "string" || reportParsed.skill.length === 0) {
      throw new MatrixValidationError("results file must carry a skill name");
    }
    reportSkillName = reportParsed.skill;
  }

  // Select the primary skill: when results are provided, match by the
  // report's skill name; otherwise use the first discovered skill.
  let primarySkill;
  if (reportSkillName !== null) {
    primarySkill = skillRoots.find((s) => s.name === reportSkillName);
    if (!primarySkill) {
      throw new MatrixValidationError(
        `results file skill "${reportSkillName}" does not match any discovered skill in ${resolvedPath} (found: ${skillRoots.map((s) => s.name).join(", ")})`
      );
    }
  } else {
    primarySkill = skillRoots[0];
  }

  const primarySkillDir = path.resolve(resolvedPath, primarySkill.directory === "." ? "" : primarySkill.directory);

  // If the primary skill's SKILL.md has structural errors, reject rather
  // than building a matrix from unparseable metadata.
  const primarySkillData = doctorReport.skills.find((s) => s.name === primarySkill.name);
  if (primarySkillData) {
    const structuralError = primarySkillData.diagnostics.find(
      (d) => d.severity === "error" && ["PS-SPEC-001", "PS-SPEC-002", "PS-SPEC-003"].includes(d.id)
    );
    if (structuralError) {
      throw new MatrixValidationError(
        `SKILL.md for "${primarySkill.name}" has structural errors (${structuralError.id}); fix the frontmatter before running matrix`
      );
    }
  }

  // Static compatibility from the KB.
  const staticCompatibility = buildStaticCompatibility(knowledgeBase);

  // Global errors from the doctor report — not just spec errors; security,
  // context and compatibility errors also count. These must NOT be treated
  // as "green" just because per-runtime sections show no runtime-bound errors.
  const globalErrors = doctorReport.diagnostics.filter(
    (d) => d.severity === "error"
  );

  // Observed behavior from --results (reportParsed is already available
  // from the early read above).
  let observedBehavior = null;

  if (resultsJson !== undefined && reportParsed !== null) {
    // The results file must match a trigger suite for grid validation.
    const suitePath = path.join(primarySkillDir, "evals", "triggers.json");
    let suiteRaw;
    try {
      suiteRaw = await fs.readFile(suitePath, "utf8");
    } catch {
      throw new MatrixValidationError(
        `trigger suite is missing: ${suitePath}; run packsmith trigger init first or omit --results for static-only output`
      );
    }

    const parsed = parseTriggerSuiteJson(suiteRaw, { expectedSkill: primarySkill.name });
    if (!parsed.ok) {
      throw new MatrixValidationError(`invalid trigger suite ${suitePath}: ${parsed.problems.join("; ")}`);
    }

    observedBehavior = importObservedBehavior({
      reportJson: reportParsed,
      suite: parsed.suite,
      expectedSkill: primarySkill.name
    });
  }

  const staticErrors = globalErrors.length;

  // Determine exit code: doctor errors and observed-behavior failures both
  // contribute. Infrastructure/incomplete (exit 2) takes precedence over
  // static/measured failures (exit 1).
  let exitCode = 0;
  if (staticErrors > 0) {
    exitCode = 1;
  }
  if (observedBehavior !== null) {
    const scoreExit = observedBehavior.score.exitCode;
    if (scoreExit === 2) {
      exitCode = 2;
    } else if (scoreExit === 1 && exitCode === 0) {
      exitCode = 1;
    }
  }

  return {
    schemaVersion: 1,
    skill: primarySkill.name,
    skillDir: primarySkillDir,
    skills: skillRoots,
    staticCompatibility,
    staticValidation: {
      errors: staticErrors,
      warnings: doctorReport.counts.warnings,
      globalErrors: globalErrors.map((d) => ({
        id: d.id, severity: d.severity, category: d.category,
        message: d.message, file: d.file, line: d.line
      }))
    },
    observedBehavior,
    exitCode,
    ...(observedBehavior !== null ? { resultsFile: path.resolve(resultsJson) } : {})
  };
}

/**
 * Determine the overall matrix exit code:
 *   0 = all sections valid, no observed failures
 *   1 = static compatibility errors for the target skill (validation)
 *   2 = infrastructure problems reading results/KB
 */
export function resolveMatrixExitCode({ staticErrors = 0, observationErrors = 0 }) {
  if (observationErrors > 0) return 2;
  if (staticErrors > 0) return 1;
  return 0;
}
