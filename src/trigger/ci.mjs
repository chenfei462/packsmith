import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { RUNTIME_IDS, TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { runDoctor } from "../doctor.mjs";
import { loadKnowledgeBase } from "../knowledge/loader.mjs";
import { parseTriggerSuiteJson } from "./schema.mjs";
import { readBaselineSnapshot, computeSkillContentHash, BaselineValidationError } from "./baseline.mjs";
import { compareBaselineToReport, measureCurrentEvidence, RegressionValidationError } from "./regression.mjs";
import { runTriggerEvaluation } from "./runner.mjs";

// `packsmith ci <path>` — the trigger regression gate (Wave 3 M11).
// Combines static validation (doctor), freshly observed behavior (M8 runner,
// default) or explicitly imported M8 results (`--results`, labeled
// "imported"), and baseline comparison (M10 strict reader + the M11
// comparator). Comparison semantics: docs/regression-gate.md.
//
// Exit codes: 0 pass; 1 validation failure or measured behavioral
// regression; 2 infrastructure / incomplete / comparison unable to run.
// `ci` never writes or updates a baseline.
//
// Structure: TWO PHASES. Phase 1 pref lights EVERY discovered skill (suite,
// baseline, evidence shape) before phase 2 executes anything — a missing or
// invalid later skill must never spend model calls on an earlier one.
// Fresh execution verifies suite/SKILL/baseline snapshots after the run so a
// mid-run edit produces an unable gate with measured diagnostics retained,
// never a comparison of mixed revisions.

export class CiUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiUsageError";
    this.isUsageError = true;
  }
}

export class CiValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiValidationError";
    this.isValidationError = true;
  }
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/** InfrastructureError whose message was constructed at this boundary with
 * relative references and error codes only. The CLI envelope may trust it;
 * anything else is replaced by a generic sanitized message. */
function safeInfra(message, { cause } = {}) {
  const error = new InfrastructureError(message, { cause });
  error.safeMessage = true;
  return error;
}

/** Sanitized SKILL.md hash read: the raw fs fault (absolute path, injected
 * bytes) stays a local cause, never an uploadable value. */
async function skillHash(skillDir, skillRef) {
  try {
    return await computeSkillContentHash(skillDir);
  } catch (error) {
    throw safeInfra(`cannot read SKILL.md for ${skillRef} (${error.code ?? "read fault"})`, { cause: error });
  }
}

function resolveExitCode(skillExitCodes, staticErrors) {
  let exitCode = 0;
  if (staticErrors > 0) {
    exitCode = 1;
  }
  for (const code of skillExitCodes) {
    if (code === 2) {
      return 2;
    }
    if (code === 1) {
      exitCode = 1;
    }
  }
  return exitCode;
}

/** Deliberate relative reference anchored to the target — never a .replace
 * hack. Uploadable reports carry no absolute machine paths. When the target
 * and the file live on different roots (path.relative yields an absolute
 * result), fall back to the bare file name: still no private root leak. */
function relativeToTarget(resolvedTarget, absolutePath) {
  const rel = path.relative(resolvedTarget, absolutePath);
  if (rel === "") {
    return ".";
  }
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel;
  }
  return path.basename(absolutePath);
}

/**
 * Uploadable static diagnostics: a deliberate whitelist (rule id, severity,
 * category, title, relative file, line, and the STABLE knowledge-base rule
 * message). The instance-specific diagnostic message may embed parser source
 * excerpts or source-derived values, so it is never uploaded; the KB rule
 * message for the same id is. Unknown rule ids fail closed to a null
 * message. Local doctor output is unchanged.
 */
function sanitizeStaticDiagnostics(diagnostics, knowledgeBase) {
  const ruleById = new Set(knowledgeBase ? knowledgeBase.rules.map((r) => r.id) : []);
  const rulesById = new Map(knowledgeBase ? knowledgeBase.rules.map((r) => [r.id, r]) : []);
  return diagnostics.map((d) => {
    const rule = rulesById.get(d.id);
    return {
      id: d.id,
      severity: d.severity,
      category: d.category,
      title: d.title,
      message: ruleById.has(d.id) ? rule.message : null,
      file: path.isAbsolute(d.file) ? null : d.file,
      line: d.line ?? null
    };
  });
}

async function readSuite(skillDir, skillName, relativeDir) {
  const suitePath = path.join(skillDir, "evals", "triggers.json");
  const suiteRef = path.join(relativeDir, "evals", "triggers.json");
  let raw;
  try {
    raw = await fs.readFile(suitePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return { missing: true, suiteRef };
    }
    // Sanitized boundary: the raw fs error (absolute path, injected
    // sentinels) stays a local cause, never an uploadable value.
    throw safeInfra(`cannot read trigger suite ${suiteRef} (${error.code ?? "read fault"})`, { cause: error });
  }
  const parsed = parseTriggerSuiteJson(raw, { expectedSkill: skillName });
  if (!parsed.ok) {
    throw new CiValidationError(`invalid trigger suite ${suiteRef}: ${parsed.problems.join("; ")}`);
  }
  return { missing: false, suiteRef, suitePath, suite: parsed.suite, suiteRaw: raw };
}

/**
 * Schema/identity validation for current evidence (fresh runner output or an
 * imported report). These are MALFORMED-input failures (exit 1): schema
 * version, known/unique runtimes, runs range, observation objects, valid
 * statuses, suite identity, expect agreement, unique grid slots. Messages
 * never echo arbitrary raw imported values — only positions and validated
 * enums. ABSENT expected slots (including an empty list) are NOT validation:
 * the comparator routes them to comparison-unable (exit 2).
 */
function validateEvidenceShape(report, suite) {
  const problems = [];

  if (report.schemaVersion !== 1) {
    problems.push("evidence schemaVersion must be 1");
  }
  if (!Array.isArray(report.runtimeIds) || report.runtimeIds.length === 0 ||
      report.runtimeIds.some((id) => !RUNTIME_IDS.includes(id))) {
    problems.push(`evidence runtimeIds must be a non-empty array of known runtimes (${RUNTIME_IDS.join(", ")})`);
  } else if (new Set(report.runtimeIds).size !== report.runtimeIds.length) {
    problems.push("evidence runtimeIds must be unique (no duplicates)");
  }
  if (!Number.isSafeInteger(report.runs) || report.runs < 1 || report.runs > 20) {
    problems.push("evidence runs must be an integer from 1 to 20");
  }
  if (!Array.isArray(report.observations)) {
    problems.push("evidence observations must be an array");
    return problems;
  }

  const declaredRuntimes = Array.isArray(report.runtimeIds) ? report.runtimeIds : [];
  const caseExpectById = new Map(suite.cases.map((c) => [c.id, c.expect]));
  const seenSlots = new Set();

  report.observations.forEach((obs, index) => {
    if (typeof obs !== "object" || obs === null) {
      problems.push(`observation #${index} must be an object`);
      return;
    }
    if (typeof obs.runtime !== "string" || !RUNTIME_IDS.includes(obs.runtime)) {
      problems.push(`observation #${index} runtime is not a known runtime`);
    } else if (!declaredRuntimes.includes(obs.runtime)) {
      problems.push(`observation #${index} runtime is not in the declared runtimeIds`);
    }
    if (typeof obs.caseId !== "string" || !caseExpectById.has(obs.caseId)) {
      problems.push(`observation #${index} caseId is not a case of the current suite`);
    }
    if (!Number.isSafeInteger(obs.repeat) || obs.repeat < 1 ||
        (Number.isSafeInteger(report.runs) && obs.repeat > report.runs)) {
      problems.push(`observation #${index} repeat must be an integer within 1..runs`);
    }
    if (!TRIGGER_STATUSES.includes(obs.status)) {
      problems.push(`observation #${index} status is not a valid trigger status (${TRIGGER_STATUSES.join("|")})`);
    }
    if (typeof obs.caseId === "string" && caseExpectById.has(obs.caseId) &&
        obs.expect !== undefined && obs.expect !== caseExpectById.get(obs.caseId)) {
      problems.push(`observation #${index} expect does not match the suite expectation for its case`);
    }
    if (typeof obs.runtime === "string" && RUNTIME_IDS.includes(obs.runtime) && declaredRuntimes.includes(obs.runtime) &&
        typeof obs.caseId === "string" && caseExpectById.has(obs.caseId) &&
        Number.isSafeInteger(obs.repeat) && obs.repeat >= 1) {
      const slot = `${obs.runtime}\u0000${obs.caseId}\u0000${obs.repeat}`;
      if (seenSlots.has(slot)) {
        problems.push(`duplicate observation slot ${obs.runtime}/${obs.caseId}/repeat ${obs.repeat}`);
      }
      seenSlots.add(slot);
    }
  });

  return problems;
}

async function loadImportedReport(resultsJson, resultsRef, skillName) {
  let raw;
  try {
    raw = await fs.readFile(resultsJson, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new CiUsageError(`results file does not exist: ${resultsRef}`);
    }
    // Sanitized boundary: a read fault (EIO, EACCES, …) must not echo the
    // raw underlying message (absolute path, injected bytes). The raw error
    // stays attached as a local cause only.
    throw safeInfra(`cannot read results file ${resultsRef} (${error.code ?? "read fault"})`, { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CiValidationError("results file is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CiValidationError("results file must contain a JSON object");
  }
  if (typeof parsed.skill !== "string" || parsed.skill.length === 0) {
    throw new CiValidationError("results file must carry a skill name");
  }
  if (parsed.skill !== skillName) {
    throw new CiValidationError(`results file skill does not match the gated skill "${skillName}"`);
  }
  return parsed;
}

function baselineSummary(baseline, baselineRef, skillContentChanged) {
  return {
    path: baselineRef,
    suiteFingerprint: baseline.suiteFingerprint,
    runs: baseline.runs,
    runtimes: [...baseline.runtimes],
    runtimeVersions: { ...baseline.runtimeVersions },
    skillContentHashPresent: typeof baseline.skillContentHash === "string",
    skillContentChanged
  };
}

/**
 * Re-read the three preflight snapshots (suite bytes, SKILL.md hash, baseline
 * bytes) and report any revision change. Used BOTH immediately before model
 * execution and after it: the gate must never compare against, or run on, a
 * revision other than the one it validated. Author replacements are refused,
 * never overwritten. `when` labels the drift reasons ("before execution" /
 * "during evaluation").
 */
async function snapshotDrift(item, when) {
  const drift = [];
  try {
    const suiteRawNow = await fs.readFile(item.suitePath, "utf8");
    if (sha256Text(suiteRawNow) !== item.suiteRawHash) {
      drift.push(`trigger suite ${item.suiteRef} changed ${when}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      drift.push(`trigger suite ${item.suiteRef} was removed ${when}`);
    } else {
      throw safeInfra(`cannot re-read trigger suite ${item.suiteRef} (${error.code ?? "read fault"})`, { cause: error });
    }
  }
  const skillMdHashNow = await skillHash(item.skillDir, item.directory);
  if (skillMdHashNow !== item.skillMdHash) {
    drift.push(`SKILL.md changed ${when}`);
  }
  try {
    const baselineRawNow = await fs.readFile(item.baselinePath, "utf8");
    if (sha256Text(baselineRawNow) !== item.baselineRawHash) {
      drift.push(`baseline ${item.baselineRef} changed ${when}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      drift.push(`baseline ${item.baselineRef} was removed ${when}`);
    } else {
      throw safeInfra(`cannot re-read baseline ${item.baselineRef} (${error.code ?? "read fault"})`, { cause: error });
    }
  }
  return drift;
}

/**
 * Gate every discovered skill under `targetPath`. See docs/regression-gate.md
 * for the defined comparison semantics and exit-code mapping.
 */
export async function runCi({ targetPath, resultsJson, runs }) {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new CiUsageError("ci requires one <path> argument");
  }
  if (runs !== undefined && (!Number.isSafeInteger(runs) || runs < 1 || runs > 20)) {
    throw new CiUsageError("--runs must be an integer from 1 to 20");
  }

  const resolvedPath = path.resolve(targetPath);

  // Discovery + static validation reuse the doctor exactly.
  const doctorReport = await runDoctor({ targetPath: resolvedPath });
  const skillRoots = doctorReport.skills.map((s) => ({ name: s.name, directory: s.directory }));
  if (skillRoots.length === 0) {
    throw new CiUsageError(`no skill found at ${resolvedPath}`);
  }

  const globalErrors = doctorReport.diagnostics.filter((d) => d.severity === "error");

  // Imported evidence is single-skill by definition: a multi-skill path has
  // no way to attribute one report to every skill honestly.
  let importedReport = null;
  let importedRef = null;
  if (resultsJson !== undefined) {
    if (skillRoots.length > 1) {
      throw new CiUsageError(
        `--results applies to a single-skill path; the target discovers ${skillRoots.length} skills (${skillRoots.map((s) => s.name).join(", ")})`
      );
    }
    if (runs !== undefined) {
      throw new CiUsageError("--runs applies to fresh execution only; an imported report carries its own sample count");
    }
    importedRef = relativeToTarget(resolvedPath, path.resolve(resultsJson));
    importedReport = await loadImportedReport(resultsJson, importedRef, skillRoots[0].name);
  }

  // ---- Phase 1: preflight EVERY discovered skill before ANY adapter ----
  const prepared = [];
  const preflightResults = [];

  for (const skillRoot of skillRoots) {
    const relativeDir = skillRoot.directory;
    const skillDir = path.resolve(resolvedPath, relativeDir === "." ? "" : relativeDir);
    const preflight = { skill: skillRoot.name, directory: relativeDir };

    const doctorSkill = doctorReport.skills.find((s) => s.name === skillRoot.name);
    const structuralError = doctorSkill?.diagnostics.find(
      (d) => d.severity === "error" && ["PS-SPEC-001", "PS-SPEC-002", "PS-SPEC-003"].includes(d.id)
    );
    if (structuralError) {
      preflightResults.push({
        skill: skillRoot.name, directory: relativeDir, gated: false,
        reason: `SKILL.md has structural errors (${structuralError.id}); fix the frontmatter before running ci`,
        exitCode: 1
      });
      continue;
    }

    let suiteData;
    try {
      suiteData = await readSuite(skillDir, skillRoot.name, relativeDir);
    } catch (error) {
      if (error instanceof CiValidationError) {
        // Generic sanitized reason: the local suite-validation detail stays
        // local; the uploadable report carries the reference, not the content.
        preflightResults.push({
          ...preflight, gated: false,
          reason: `invalid trigger suite at ${path.join(relativeDir, "evals", "triggers.json")}; inspect it with packsmith doctor or trigger init locally`,
          exitCode: 1
        });
        continue;
      }
      throw error;
    }

    if (suiteData.missing) {
      preflightResults.push({
        ...preflight, gated: false,
        reason: `no trigger suite at ${suiteData.suiteRef} and no baseline; nothing under this path may silently skip the gate`,
        exitCode: 2
      });
      continue;
    }

    // Baseline via the M10 strict reader: fingerprint vs CURRENT suite and
    // metric recomputation happen before any model execution.
    const baselinePath = path.join(skillDir, "packsmith-baseline.json");
    const baselineRef = path.join(relativeDir, "packsmith-baseline.json");
    try {
      const stat = await fs.lstat(baselinePath);
      if (stat.isSymbolicLink()) {
        preflightResults.push({
          ...preflight, gated: false,
          reason: `baseline path is a symlink/junction: ${baselineRef}`, exitCode: 2
        });
        continue;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        preflightResults.push({
          ...preflight, gated: false, gatedSuite: suiteData.suiteRef,
          reason: `baseline missing at ${baselineRef}; run packsmith trigger <skill-dir> --save-baseline first`,
          exitCode: 2
        });
        continue;
      }
      throw safeInfra(`cannot inspect baseline ${baselineRef} (${error.code ?? "read fault"})`, { cause: error });
    }

    let baseline;
    let baselineRawHash;
    try {
      // SINGLE-READ snapshot: the validated baseline and its drift-check
      // hash come from the exact same bytes. A replacement racing between a
      // validation read and a hash read can never hide behind a stale hash.
      const snapshot = await readBaselineSnapshot(baselinePath, { suite: suiteData.suite, expectedSkill: skillRoot.name });
      baseline = snapshot.baseline;
      baselineRawHash = snapshot.rawHash;
    } catch (error) {
      if (error instanceof BaselineValidationError) {
        // Includes the suite-fingerprint mismatch: the suite changed since
        // the baseline was saved. Validation failure, exit 1. The reader's
        // message embeds the absolute baseline path, so the uploadable
        // reason is structural: the relative reference plus the stable hint.
        preflightResults.push({
          ...preflight, gated: false, gatedSuite: suiteData.suiteRef,
          reason: `baseline failed strict validation at ${baselineRef}; re-save it with packsmith trigger <skill-dir> --save-baseline or inspect it locally`,
          exitCode: 1
        });
        continue;
      }
      throw error;
    }

    // ONE SKILL.md read in preflight: the SAME hash serves both the optional
    // historical provenance comparison and the drift snapshot.
    const skillMdHash = await skillHash(skillDir, relativeDir);
    let skillContentChanged = false;
    if (typeof baseline.skillContentHash === "string") {
      skillContentChanged = skillMdHash !== baseline.skillContentHash;
    }

    // Evidence shape: malformed identity/schema (exit 1) is rejected in
    // preflight for BOTH modes; absent slots stay with the comparator
    // (unable, exit 2).
    const evidence = importedReport;
    if (evidence !== null) {
      const shapeProblems = validateEvidenceShape(evidence, suiteData.suite);
      if (shapeProblems.length > 0) {
        preflightResults.push({
          ...preflight, gated: false, gatedSuite: suiteData.suiteRef, mode: "imported",
          reason: `invalid imported results: ${shapeProblems.join("; ")}`, exitCode: 1
        });
        continue;
      }
    }

    // Snapshots for the drift check (fresh mode): suite bytes hash, the
    // preflight SKILL.md hash (single read, also used for provenance), and
    // the baseline hash captured from the SAME single read that was
    // validated above.
    const suiteRawHash = sha256Text(suiteData.suiteRaw);

    prepared.push({
      skill: skillRoot.name,
      directory: relativeDir,
      skillDir,
      suite: suiteData.suite,
      suiteRef: suiteData.suiteRef,
      suitePath: suiteData.suitePath,
      baseline,
      baselineRef,
      baselinePath,
      skillContentChanged,
      suiteRawHash,
      skillMdHash,
      baselineRawHash
    });
  }

  // ---- Phase 2: execution, only if preflight permits (no failures) ----
  const skillResults = [...preflightResults];

  if (preflightResults.length > 0) {
    // Preflight found failures somewhere on the path: the gate is already
    // failed at that severity. No adapter runs — a missing/invalid later
    // skill must not spend model calls on an earlier one.
    for (const item of prepared) {
      skillResults.push({
        skill: item.skill, directory: item.directory, gated: true, prepared: true, executed: false,
        mode: importedReport !== null ? "imported" : "fresh",
        reason: "not executed: preflight failures elsewhere on this path must be resolved first",
        exitCode: 0
      });
    }
  } else {
    for (const item of prepared) {
      let report;
      const mode = importedReport !== null ? "imported" : "fresh";

      if (importedReport !== null) {
        report = importedReport;
      } else {
        // PRE-MODEL snapshot recheck: the same suite / SKILL.md / baseline
        // bytes that preflight validated must still be on disk before any
        // adapter runs. A replacement racing the preflight boundary (e.g. an
        // author document swapped in behind a validated stale read) is
        // refused here — zero adapter calls, author replacements preserved.
        const preModelDrift = await snapshotDrift(item, "before execution");
        if (preModelDrift.length > 0) {
          skillResults.push({
            skill: item.skill, directory: item.directory, gated: true, executed: false, mode,
            baseline: baselineSummary(item.baseline, item.baselineRef, item.skillContentChanged),
            comparison: { comparable: false, unableReasons: preModelDrift, diagnostics: null },
            verdict: "unable",
            exitCode: 2
          });
          continue;
        }

        report = await runTriggerEvaluation({
          targetPath: item.skillDir,
          runtimeIds: [...item.baseline.runtimes],
          runs: runs ?? item.baseline.runs
        });

        // Mid-run drift: suite, SKILL.md or baseline edited during the run
        // must produce an unable gate with the measured diagnostics of the
        // run retained — never a comparison of mixed revisions.
        const drift = await snapshotDrift(item, "during evaluation");

        if (drift.length > 0) {
          skillResults.push({
            skill: item.skill, directory: item.directory, gated: true, executed: true, mode,
            gate: { runs: report.runs, runtimeIds: [...report.runtimeIds] },
            baseline: baselineSummary(item.baseline, item.baselineRef, item.skillContentChanged),
            comparison: {
              comparable: false,
              unableReasons: drift,
              diagnostics: measureCurrentEvidence(report, item.suite)
            },
            verdict: "unable",
            exitCode: 2
          });
          continue;
        }

        const shapeProblems = validateEvidenceShape(report, item.suite);
        if (shapeProblems.length > 0) {
          skillResults.push({
            skill: item.skill, directory: item.directory, gated: false, gatedSuite: item.suiteRef, mode,
            reason: `invalid fresh evaluation report: ${shapeProblems.join("; ")}`, exitCode: 1
          });
          continue;
        }
      }

      let comparison;
      try {
        comparison = compareBaselineToReport({
          baseline: item.baseline,
          suite: item.suite,
          report,
          skillContentChanged: item.skillContentChanged
        });
      } catch (error) {
        if (error instanceof RegressionValidationError) {
          // Structural sanitized reason — never echo imported values.
          skillResults.push({
            skill: item.skill, directory: item.directory, gated: false, gatedSuite: item.suiteRef, mode,
            reason: "current evidence identity does not match the baseline (skill identity mismatch)",
            exitCode: 1
          });
          continue;
        }
        throw error;
      }

      const exitCode = comparison.comparable === false ? 2 : comparison.pass === false ? 1 : 0;

      skillResults.push({
        skill: item.skill,
        directory: item.directory,
        gated: true,
        executed: importedReport === null,
        mode,
        gate: { runs: report.runs, runtimeIds: [...report.runtimeIds] },
        baseline: baselineSummary(item.baseline, item.baselineRef, item.skillContentChanged),
        comparison,
        verdict: comparison.comparable === false
          ? "unable"
          : comparison.pass === false ? "regression" : "pass",
        exitCode
      });
    }
  }

  const staticErrors = globalErrors.length;
  const knowledgeBase = await loadKnowledgeBase();
  const exitCode = resolveExitCode(skillResults.map((r) => r.exitCode), staticErrors);

  return {
    schemaVersion: 1,
    command: "ci",
    skills: skillResults,
    staticValidation: {
      errors: staticErrors,
      warnings: doctorReport.counts.warnings,
      globalErrors: sanitizeStaticDiagnostics(globalErrors, knowledgeBase)
    },
    exitCode,
    ...(importedRef !== null ? { resultsFile: importedRef } : {})
  };
}
