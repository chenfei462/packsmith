import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { RUNTIME_IDS, TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { scoreTriggerResults } from "./scorer.mjs";

export class BaselineUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "BaselineUsageError";
    this.isUsageError = true;
  }
}

export class BaselineValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BaselineValidationError";
    this.isValidationError = true;
  }
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export function computeSuiteFingerprint(suite) {
  const canonical = JSON.stringify(
    suite.cases
      .map((c) => ({ id: c.id, prompt: c.prompt, expect: c.expect }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
  return sha256(canonical);
}

export async function computeSkillContentHash(skillDir) {
  const content = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
  return sha256(content);
}

/**
 * Validate a complete M8 report for baseline eligibility.
 * Every observation must have a non-null, non-empty string runtimeVersion.
 * All observations per runtime must carry the SAME version string.
 * The grid must be complete.
 */
function validateReportForBaseline(report, suite) {
  const nonBinary = report.observations.filter(
    (obs) => obs.status !== "triggered" && obs.status !== "not_triggered"
  );
  if (nonBinary.length > 0) {
    const statuses = [...new Set(nonBinary.map((o) => o.status))];
    return { refusal: `non-binary observation statuses present: ${statuses.join(", ")}` };
  }

  const expectedSlots = report.runtimeIds.length * suite.cases.length * report.runs;
  if (report.observations.length !== expectedSlots) {
    return { refusal: `incomplete grid: expected ${expectedSlots} observations, got ${report.observations.length}` };
  }

  const runtimeVersions = {};
  for (const runtimeId of report.runtimeIds) {
    const versioned = report.observations.filter((o) => o.runtime === runtimeId);
    if (versioned.length === 0) {
      return { refusal: `runtime "${runtimeId}" has no observations` };
    }
    // Every observation for this runtime must have a valid non-null version.
    for (const obs of versioned) {
      if (typeof obs.runtimeVersion !== "string" || obs.runtimeVersion.trim().length === 0) {
        return { refusal: `runtime "${runtimeId}" observation ${obs.caseId}/${obs.repeat} has missing or null runtimeVersion` };
      }
    }
    const versions = [...new Set(versioned.map((o) => o.runtimeVersion))];
    if (versions.length > 1) {
      return { refusal: `runtime "${runtimeId}" has mixed versions: ${versions.join(", ")}` };
    }
    runtimeVersions[runtimeId] = versions[0];
  }

  return { runtimeVersions };
}

/**
 * Build a portable baseline from a validated M8 report. Recomputes the
 * score from raw observations. Returns null on refusal (non-binary or
 * version issues). Only whitelisted fields are retained.
 */
export function buildBaseline({ report, suite, skillContentHash }) {
  const validation = validateReportForBaseline(report, suite);
  if (validation.refusal) {
    return null;
  }

  const recomputed = scoreTriggerResults({
    suite,
    runtimeIds: [...report.runtimeIds],
    runs: report.runs,
    observations: report.observations.map((obs) => ({
      runtime: obs.runtime,
      caseId: obs.caseId,
      repeat: obs.repeat,
      status: obs.status
    }))
  });

  return {
    schemaVersion: 1,
    skill: report.skill,
    suiteFingerprint: computeSuiteFingerprint(suite),
    ...(skillContentHash ? { skillContentHash } : {}),
    timestamp: new Date().toISOString(),
    runtimes: [...report.runtimeIds],
    runtimeVersions: { ...validation.runtimeVersions },
    runs: report.runs,
    cases: suite.cases.map((c) => ({ id: c.id, expect: c.expect })),
    observations: report.observations.map((obs) => ({
      runtime: obs.runtime,
      caseId: obs.caseId,
      repeat: obs.repeat,
      expect: obs.expect,
      status: obs.status,
      runtimeVersion: obs.runtimeVersion ?? null
    })),
    score: {
      status: recomputed.status,
      exitCode: recomputed.exitCode,
      runtimes: Object.fromEntries(
        report.runtimeIds.map((runtimeId) => {
          const r = recomputed.runtimes[runtimeId];
          return [runtimeId, {
            confusion: { ...r.confusion },
            unresolved: { ...r.unresolved },
            precision: r.precision,
            recall: r.recall,
            falsePositiveRate: r.falsePositiveRate,
            infrastructureErrorRate: r.infrastructureErrorRate,
            validRuns: r.validRuns,
            totalRuns: r.totalRuns
          }];
        })
      ),
      divergence: recomputed.divergence.map((d) => ({
        caseId: d.caseId,
        activationCounts: d.activationCounts,
        runs: d.runs,
        pairs: d.pairs?.map((p) => ({
          repeat: p.repeat,
          comparable: p.comparable,
          divergent: p.divergent
        })) ?? []
      })),
      incomparableCases: [...recomputed.incomparableCases]
    }
  };
}

/**
 * Strictly validate a baseline object against the real suite.
 * All counts, ratios, confusion, unresolved and divergence are recomputed
 * and compared. Missing or extra fields are rejected. Returns an array of
 * problem strings (empty = valid).
 */
export function validateBaseline(baseline, { suite, expectedSkill }) {
  const problems = [];

  if (typeof baseline !== "object" || baseline === null || Array.isArray(baseline)) {
    return ["baseline must be a JSON object"];
  }

  const REQUIRED_TOP_KEYS = [
    "schemaVersion", "skill", "suiteFingerprint", "timestamp",
    "runtimes", "runtimeVersions", "runs", "cases", "observations", "score"
  ];
  const OPTIONAL_TOP_KEYS = ["skillContentHash"];
  const KNOWN_TOP_KEYS = new Set([...REQUIRED_TOP_KEYS, ...OPTIONAL_TOP_KEYS]);

  for (const key of Object.keys(baseline)) {
    if (!KNOWN_TOP_KEYS.has(key)) {
      problems.push(`unknown top-level field "${key}"`);
    }
  }
  for (const key of REQUIRED_TOP_KEYS) {
    if (!(key in baseline)) {
      problems.push(`missing required field "${key}"`);
    }
  }
  if ("skillContentHash" in baseline && (typeof baseline.skillContentHash !== "string" || !baseline.skillContentHash.startsWith("sha256:"))) {
    problems.push("skillContentHash must be a sha256: prefixed hash when present");
  }
  if (problems.length > 0) return problems;

  if (baseline.schemaVersion !== 1) {
    problems.push(`schemaVersion must be 1, got ${JSON.stringify(baseline.schemaVersion)}`);
  }

  if (baseline.skill !== expectedSkill) {
    problems.push(`baseline skill "${baseline.skill}" does not match expected "${expectedSkill}"`);
  }

  if (typeof baseline.suiteFingerprint !== "string" || !baseline.suiteFingerprint.startsWith("sha256:")) {
    problems.push("suiteFingerprint must be a sha256: prefixed hash");
  } else {
    const currentFingerprint = computeSuiteFingerprint(suite);
    if (baseline.suiteFingerprint !== currentFingerprint) {
      problems.push(
        `suite fingerprint mismatch: baseline vs current; the suite has changed since the baseline was saved`
      );
    }
  }

  if (typeof baseline.timestamp !== "string" || Number.isNaN(Date.parse(baseline.timestamp))) {
    problems.push("timestamp must be a valid ISO date string");
  }

  if (!Array.isArray(baseline.runtimes) || baseline.runtimes.length === 0 ||
      baseline.runtimes.some((id) => typeof id !== "string" || !RUNTIME_IDS.includes(id)) ||
      new Set(baseline.runtimes).size !== baseline.runtimes.length) {
    problems.push(`runtimes must be a non-empty unique array of known runtimes (${RUNTIME_IDS.join(", ")})`);
  }

  if (typeof baseline.runs !== "number" || baseline.runs < 1 || !Number.isSafeInteger(baseline.runs) || baseline.runs > 20) {
    problems.push(`runs must be a positive integer 1..20, got ${JSON.stringify(baseline.runs)}`);
  }

  // runtimeVersions: every declared runtime must have exactly one non-empty
  // string version that matches the observations.
  if (typeof baseline.runtimeVersions !== "object" || baseline.runtimeVersions === null || Array.isArray(baseline.runtimeVersions)) {
    problems.push("runtimeVersions must be an object keyed by runtime id");
  } else {
    for (const runtimeId of baseline.runtimes ?? []) {
      const version = baseline.runtimeVersions[runtimeId];
      if (typeof version !== "string" || version.trim().length === 0) {
        problems.push(`runtimeVersions.${runtimeId} must be a non-empty string`);
      }
    }
    for (const key of Object.keys(baseline.runtimeVersions)) {
      if (!RUNTIME_IDS.includes(key)) {
        problems.push(`runtimeVersions has unknown runtime key "${key}"`);
      }
    }
  }

  // cases: must match the suite's case IDs and expectations.
  if (Array.isArray(baseline.cases)) {
    if (baseline.cases.length !== suite.cases.length) {
      problems.push(`cases count ${baseline.cases.length} != suite case count ${suite.cases.length}`);
    } else {
      for (let i = 0; i < suite.cases.length; i++) {
        const bc = baseline.cases.find((c) => c.id === suite.cases[i].id);
        if (!bc) {
          problems.push(`cases missing case id "${suite.cases[i].id}"`);
        } else if (bc.expect !== suite.cases[i].expect) {
          problems.push(`case "${bc.id}" expect "${bc.expect}" != suite expect "${suite.cases[i].expect}"`);
        }
      }
    }
  }

  // observations: must be non-empty array, all binary, consistent with suite.
  if (!Array.isArray(baseline.observations) || baseline.observations.length === 0) {
    problems.push("observations must be a non-empty array");
  } else {
    const expectedSlots = (baseline.runtimes?.length ?? 0) * suite.cases.length * (baseline.runs ?? 0);
    if (baseline.observations.length !== expectedSlots) {
      problems.push(`observations count ${baseline.observations.length} != expected grid size ${expectedSlots}`);
    }

    const caseExpectById = new Map(suite.cases.map((c) => [c.id, c.expect]));
    const declaredRuntimes = Array.isArray(baseline.runtimes) ? new Set(baseline.runtimes) : null;

    for (const obs of baseline.observations) {
      if (typeof obs !== "object" || obs === null) {
        problems.push("observation must be an object");
        continue;
      }
      if (typeof obs.runtime !== "string" || !RUNTIME_IDS.includes(obs.runtime)) {
        problems.push(`observation runtime "${obs.runtime}" is not a known runtime`);
      } else if (declaredRuntimes !== null && !declaredRuntimes.has(obs.runtime)) {
        problems.push(`observation runtime "${obs.runtime}" is not in the declared runtimes list`);
      }
      if (typeof obs.caseId !== "string" || !caseExpectById.has(obs.caseId)) {
        problems.push(`observation caseId ${JSON.stringify(obs.caseId)} is not a suite case id`);
      }
      if (
        !Number.isSafeInteger(obs.repeat) || obs.repeat < 1 ||
        (typeof baseline.runs === "number" && baseline.runs >= 1 && obs.repeat > baseline.runs)
      ) {
        problems.push(`observation repeat ${JSON.stringify(obs.repeat)} must be an integer within 1..runs`);
      }
      if (!TRIGGER_STATUSES.includes(obs.status)) {
        problems.push(`observation status ${JSON.stringify(obs.status)} is not valid`);
      } else if (obs.status !== "triggered" && obs.status !== "not_triggered") {
        problems.push(`baseline observations must be binary; found "${obs.status}"`);
      }
      if (typeof obs.caseId === "string" && caseExpectById.has(obs.caseId)) {
        if (obs.expect !== undefined && obs.expect !== caseExpectById.get(obs.caseId)) {
          problems.push(`observation expect "${obs.expect}" != suite expect "${caseExpectById.get(obs.caseId)}" for case "${obs.caseId}"`);
        }
      }
      if (typeof obs.runtimeVersion !== "string" || obs.runtimeVersion.trim().length === 0) {
        problems.push(`observation runtimeVersion must be a non-empty string`);
      } else if (
        typeof baseline.runtimeVersions === "object" && baseline.runtimeVersions !== null &&
        !Array.isArray(baseline.runtimeVersions) &&
        typeof obs.runtime === "string" &&
        typeof baseline.runtimeVersions[obs.runtime] === "string" &&
        obs.runtimeVersion !== baseline.runtimeVersions[obs.runtime]
      ) {
        problems.push(
          `observation runtimeVersion "${obs.runtimeVersion}" for runtime "${obs.runtime}" does not match the declared runtimeVersions entry "${baseline.runtimeVersions[obs.runtime]}"`
        );
      }
    }

    // Slot completeness: every (runtime, case, repeat) slot must appear
    // exactly once; a duplicate or missing slot invalidates the grid.
    if (problems.length === 0) {
      const slots = new Set();
      for (const obs of baseline.observations) {
        const slot = `${obs.runtime}|${obs.caseId}|${obs.repeat}`;
        if (slots.has(slot)) {
          problems.push(`duplicate observation slot ${slot}`);
        }
        slots.add(slot);
      }
    }
  }

  // Recompute the score from observations and cross-check all fields.
  if (problems.length === 0 &&
      Array.isArray(baseline.observations) && baseline.observations.length > 0 &&
      Array.isArray(baseline.cases) && baseline.cases.length > 0 &&
      Array.isArray(baseline.runtimes) && baseline.runtimes.length > 0 &&
      typeof baseline.runs === "number" && baseline.runs >= 1) {
    try {
      const recomputed = scoreTriggerResults({
        suite: {
          schemaVersion: 1,
          skill: baseline.skill,
          cases: baseline.cases.map((c) => ({
            id: c.id,
            prompt: "recompute-check",
            expect: c.expect
          }))
        },
        runtimeIds: baseline.runtimes,
        runs: baseline.runs,
        observations: baseline.observations.map((obs) => ({
          runtime: obs.runtime,
          caseId: obs.caseId,
          repeat: obs.repeat,
          status: obs.status
        }))
      });

      if (baseline.score === undefined || baseline.score === null || typeof baseline.score !== "object") {
        problems.push("score must be a present object with recomputed metrics");
      } else {
        if (baseline.score.status !== recomputed.status) {
          problems.push(`score.status "${baseline.score.status}" != recomputed "${recomputed.status}"`);
        }
        if (baseline.score.exitCode !== recomputed.exitCode) {
          problems.push(`score.exitCode ${baseline.score.exitCode} != recomputed ${recomputed.exitCode}`);
        }

        for (const runtimeId of baseline.runtimes) {
          const claimed = baseline.score.runtimes?.[runtimeId];
          const actual = recomputed.runtimes[runtimeId];
          if (!actual) {
            problems.push(`recomputed score missing runtime "${runtimeId}"`);
            continue;
          }
          if (!claimed || typeof claimed !== "object") {
            problems.push(`score.runtimes.${runtimeId} is missing or not an object`);
            continue;
          }

          // Check all confusion fields.
          for (const field of ["tp", "fp", "tn", "fn"]) {
            if (claimed.confusion?.[field] !== actual.confusion[field]) {
              problems.push(`score.runtimes.${runtimeId}.confusion.${field} ${JSON.stringify(claimed.confusion?.[field])} != recomputed ${actual.confusion[field]}`);
            }
          }
          // Check all unresolved fields.
          for (const field of ["ambiguous", "infra_error", "timeout", "unsupported"]) {
            if (claimed.unresolved?.[field] !== actual.unresolved[field]) {
              problems.push(`score.runtimes.${runtimeId}.unresolved.${field} ${JSON.stringify(claimed.unresolved?.[field])} != recomputed ${actual.unresolved[field]}`);
            }
          }
          // Check derived ratios.
          for (const field of ["precision", "recall", "falsePositiveRate", "infrastructureErrorRate"]) {
            if (claimed[field] !== actual[field]) {
              problems.push(`score.runtimes.${runtimeId}.${field} ${JSON.stringify(claimed[field])} != recomputed ${JSON.stringify(actual[field])}`);
            }
          }
          // Check counts.
          if (claimed.validRuns !== actual.validRuns) {
            problems.push(`score.runtimes.${runtimeId}.validRuns ${claimed.validRuns} != recomputed ${actual.validRuns}`);
          }
          if (claimed.totalRuns !== actual.totalRuns) {
            problems.push(`score.runtimes.${runtimeId}.totalRuns ${claimed.totalRuns} != recomputed ${actual.totalRuns}`);
          }
        }

        // Divergence recomputation.
        const claimedDivCount = Array.isArray(baseline.score.divergence) ? baseline.score.divergence.length : -1;
        if (claimedDivCount !== recomputed.divergence.length) {
          problems.push(`score.divergence count ${claimedDivCount} != recomputed ${recomputed.divergence.length}`);
        }
      }
    } catch {
      problems.push("score could not be recomputed from observations");
    }
  }

  return problems;
}

/**
 * Verify that the entire parent directory chain contains no symlinks.
 */
async function assertNoSymlinkAncestors(filePath) {
  let current = path.resolve(filePath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      const stat = await fs.lstat(parent);
      if (stat.isSymbolicLink()) {
        throw new BaselineValidationError(
          `symlink/junction detected in parent chain at ${parent}; refusing to write baseline`
        );
      }
    } catch (error) {
      if (error instanceof BaselineValidationError) throw error;
      // Parent doesn't exist — skip upward.
    }
    current = parent;
  }
}

/**
 * Atomically save a baseline. Captures the existing target's content hash
 * AND identity (dev/ino) before writing; re-verifies both before the rename.
 * Only cleans up its own temp file (identity-checked).
 */
export async function saveBaseline(baselinePath, baselineObject) {
  const resolved = path.resolve(baselinePath);
  const dir = path.dirname(resolved);

  let parentStat;
  try {
    parentStat = await fs.stat(dir);
  } catch (error) {
    throw new BaselineValidationError(`baseline parent directory does not exist: ${dir} (${error.message})`);
  }
  if (!parentStat.isDirectory()) {
    throw new BaselineValidationError(`baseline parent is not a directory: ${dir}`);
  }

  await assertNoSymlinkAncestors(resolved);

  try {
    const existing = await fs.lstat(resolved);
    if (existing.isSymbolicLink()) {
      throw new BaselineValidationError(`baseline path is a symlink/junction: ${resolved}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new BaselineValidationError(`cannot inspect baseline path ${resolved}: ${error.message}`);
    }
  }

  // Capture existing target's content hash and identity.
  let existingContentHash = null;
  let existingIdentity = null;
  try {
    const existing = await fs.lstat(resolved);
    existingIdentity = { dev: existing.dev, ino: existing.ino };
    const existingContent = await fs.readFile(resolved, "utf8");
    existingContentHash = sha256(existingContent);
  } catch {
    // No existing file.
  }

  const content = `${JSON.stringify(baselineObject, null, 2)}\n`;
  const tempPath = `${resolved}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tempIdentity = null;

  // Identity-checked temp cleanup: only remove the file we created and
  // still own. A replaced temp (different dev/ino) is never deleted.
  const cleanupTemp = async () => {
    if (tempIdentity === null) return;
    try {
      const entry = await fs.lstat(tempPath);
      if (!entry.isSymbolicLink() && entry.dev === tempIdentity.dev && entry.ino === tempIdentity.ino) {
        await fs.rm(tempPath, { force: true });
      }
    } catch {
      // Temp file already gone.
    }
  };

  try {
    const parentIdentity = { dev: parentStat.dev, ino: parentStat.ino };

    const handle = await fs.open(tempPath, "wx");
    let writeFailed = false;
    try {
      // Own the temp file from the moment it exists. Identity must come
      // from the opened handle (fstat) — a path lstat could observe an
      // author replacement that raced in before open returned.
      const opened = await handle.stat();
      tempIdentity = { dev: opened.dev, ino: opened.ino };
      await handle.writeFile(content, "utf8");
    } catch (error) {
      writeFailed = true;
      throw error;
    } finally {
      if (writeFailed) {
        // Preserve the original write error; the outer catch still cleans up.
        await handle.close().catch(() => {});
      } else {
        // A close failure on the success path is a real fault: the temp
        // content is not trustworthy, so publication must be refused and
        // the error must reach the outer cleanup.
        await handle.close();
      }
    }

    // The temp file must still be the file we opened. A replaced temp
    // means another author interfered; refuse without touching their file.
    const written = await fs.lstat(tempPath);
    if (written.dev !== tempIdentity.dev || written.ino !== tempIdentity.ino) {
      throw new BaselineValidationError(
        `temporary baseline file ${tempPath} was replaced during the save; refusing to promote a file we did not write`
      );
    }

    // The parent directory must still be the directory we started in;
    // a replacement (rm+mkdir, mount, junction swap) would redirect the rename.
    const currentDir = await fs.lstat(dir);
    if (currentDir.isSymbolicLink() || currentDir.dev !== parentIdentity.dev || currentDir.ino !== parentIdentity.ino) {
      throw new BaselineValidationError(
        `baseline parent directory ${dir} was replaced during the save; refusing to rename into a directory we did not open`
      );
    }

    if (existingIdentity === null) {
      // Target was absent at preflight: it must still be absent. A file
      // that appeared meanwhile belongs to another author and is never
      // renamed over.
      let appeared = false;
      try {
        await fs.lstat(resolved);
        appeared = true;
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw new BaselineValidationError(`cannot inspect baseline path ${resolved}: ${error.message}`);
        }
      }
      if (appeared) {
        throw new BaselineValidationError(
          `baseline ${resolved} appeared during the save and was not created by this save; the other file was preserved`
        );
      }
    } else {
      // Target was present at preflight: identity and content must be
      // unchanged; only its removal (ENOENT) lets the save proceed.
      let current = null;
      let currentContent = null;
      try {
        current = await fs.lstat(resolved);
        currentContent = await fs.readFile(resolved, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw new BaselineValidationError(`cannot inspect baseline path ${resolved}: ${error.message}`);
        }
      }
      if (current !== null) {
        if (current.dev !== existingIdentity.dev || current.ino !== existingIdentity.ino) {
          throw new BaselineValidationError(
            `baseline ${resolved} was concurrently replaced (identity mismatch); the other file was preserved`
          );
        }
        if (sha256(currentContent) !== existingContentHash) {
          throw new BaselineValidationError(
            `baseline ${resolved} was concurrently modified (content mismatch); the other file was preserved`
          );
        }
      }
    }

    await fs.rename(tempPath, resolved);
  } catch (error) {
    await cleanupTemp();
    if (error instanceof BaselineValidationError) throw error;
    throw new InfrastructureError(`cannot save baseline ${resolved}: ${error.message}`, { cause: error });
  }
}

/**
 * Read and strictly validate a baseline file.
 */
export async function readBaseline(baselinePath, { suite, expectedSkill }) {
  let raw;
  try {
    raw = await fs.readFile(baselinePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new BaselineValidationError(`baseline file does not exist: ${baselinePath}`);
    }
    throw new InfrastructureError(`cannot read baseline ${baselinePath}: ${error.message}`, { cause: error });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BaselineValidationError("baseline file is not valid JSON");
  }

  const problems = validateBaseline(parsed, { suite, expectedSkill });
  if (problems.length > 0) {
    throw new BaselineValidationError(`invalid baseline ${baselinePath}: ${problems.join("; ")}`);
  }

  return parsed;
}
