import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseSkill } from "../core/skill-parser.mjs";
import { RUNTIME_IDS, TRIGGER_STATUSES } from "../runtimes/base.mjs";
import { claudeCodeAdapter } from "../runtimes/claude-code.mjs";
import { codexAdapter } from "../runtimes/codex.mjs";
import { cursorAdapter } from "../runtimes/cursor.mjs";
import { geminiCliAdapter } from "../runtimes/gemini-cli.mjs";
import { opencodeAdapter } from "../runtimes/opencode.mjs";
import { withIsolatedTriggerRun } from "./isolation.mjs";
import { parseTriggerSuiteJson } from "./schema.mjs";
import { scoreTriggerResults } from "./scorer.mjs";

const DEFAULT_ADAPTERS = Object.freeze({
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  "gemini-cli": geminiCliAdapter,
  opencode: opencodeAdapter
});
const DEFAULT_RUNTIME_IDS = Object.freeze(["claude-code", "codex"]);
const MAX_RUNS = 20;

export class TriggerRunUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "TriggerRunUsageError";
    this.isUsageError = true;
    this.exitCode = 2;
  }
}

export class TriggerRunValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TriggerRunValidationError";
    this.isValidationError = true;
    this.exitCode = 1;
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function defaultRunsRoot(skillDir) {
  const normal = path.join(process.cwd(), ".packsmith", "runs");
  return isWithin(skillDir, normal) ? path.join(path.dirname(skillDir), ".packsmith", "runs") : normal;
}

function defaultBinaryPath(runtimeId) {
  const command = runtimeId === "claude-code" ? "claude" : runtimeId;
  if (process.platform !== "win32") return command;
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "npm", `${command}.cmd`);
}

async function inspectSkillTarget(targetPath) {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new TriggerRunUsageError("trigger requires one <skill-dir> path");
  }
  const skillDir = path.resolve(targetPath);
  let target;
  try {
    target = await fs.stat(skillDir);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new TriggerRunUsageError(`trigger target does not exist: ${skillDir}`);
    }
    throw error;
  }
  if (!target.isDirectory()) {
    throw new TriggerRunUsageError(`trigger target must be a directory: ${skillDir}`);
  }
  try {
    const skillFile = await fs.stat(path.join(skillDir, "SKILL.md"));
    if (!skillFile.isFile()) throw new TriggerRunValidationError(`SKILL.md is not a file in ${skillDir}`);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new TriggerRunValidationError(`SKILL.md is missing from ${skillDir}`);
    }
    throw error;
  }
  const suitePath = path.join(skillDir, "evals", "triggers.json");
  let raw;
  try {
    raw = await fs.readFile(suitePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new TriggerRunValidationError(`trigger suite is missing: ${suitePath}; run packsmith trigger init first`);
    }
    throw error;
  }
  const parsed = parseTriggerSuiteJson(raw, { expectedSkill: path.basename(skillDir) });
  if (!parsed.ok) {
    // JSON.parse error messages can echo malformed input. Do not place an
    // author prompt or secret excerpt in CLI diagnostics.
    const problems = parsed.problems.some((problem) => problem.startsWith("trigger suite is not valid JSON"))
      ? ["trigger suite is not valid JSON"]
      : parsed.problems;
    throw new TriggerRunValidationError(`invalid trigger suite ${suitePath}: ${problems.join("; ")}`);
  }

  // Validate the actual SKILL.md frontmatter BEFORE creating any artifacts
  // or calling any adapter: the skill's declared name must match the
  // suite's `skill` field AND the containing directory name. Bad YAML,
  // missing frontmatter and name mismatches are validation failures
  // (exit 1) — never a wasted adapter invocation with misidentified skills.
  const skill = await parseSkill(skillDir);

  if (skill.parse.status === "missing-skill-file") {
    throw new TriggerRunValidationError(`SKILL.md is missing from ${skillDir}`);
  }

  if (skill.parse.status === "invalid-yaml") {
    // Sanitized: never echo the YAML parse error message, which may quote
    // user-authored content from the frontmatter.
    throw new TriggerRunValidationError("SKILL.md contains invalid YAML; fix the frontmatter before running");
  }

  if (skill.parse.status === "missing-frontmatter" || skill.parse.status === "empty-frontmatter" || skill.parse.status === "frontmatter-not-mapping") {
    throw new TriggerRunValidationError(`SKILL.md has no usable frontmatter (status: ${skill.parse.status})`);
  }

  const declaredName = skill.frontmatter?.name;

  if (typeof declaredName !== "string" || declaredName.trim().length === 0) {
    throw new TriggerRunValidationError("SKILL.md frontmatter is missing a usable name field");
  }

  const declaredDescription = skill.frontmatter?.description;

  if (typeof declaredDescription !== "string" || declaredDescription.trim().length === 0) {
    throw new TriggerRunValidationError("SKILL.md frontmatter is missing a usable description field");
  }

  const directoryName = path.basename(skillDir);
  const suiteSkill = parsed.suite.skill;

  if (declaredName !== suiteSkill) {
    throw new TriggerRunValidationError(
      `SKILL.md frontmatter name "${declaredName}" does not match the trigger suite skill "${suiteSkill}"; fix the suite or the skill frontmatter before running`
    );
  }

  if (declaredName !== directoryName) {
    throw new TriggerRunValidationError(
      `SKILL.md frontmatter name "${declaredName}" does not match the containing directory "${directoryName}"`
    );
  }

  return { skillDir, suitePath, suite: parsed.suite };
}

/** Execute every declared case for each selected runtime and repeat. A
 * failure of one case is an infra_error observation, not a missing row or a
 * false negative; later cases still execute in fresh isolation. Tests may
 * supply adapter and runtime-option overrides, while production defaults to
 * the verified Claude/Codex adapters and local CLI entry points.
 *
 * `caseIds` (optional, programmatic only) restricts execution to an explicit
 * subset of the suite's cases. It is validated against THIS read of the
 * suite BEFORE any adapter runs: unknown, duplicate or empty selections are
 * usage errors, so the caller's model-call budget is enforced at the
 * execution boundary — the loop below iterates the selected cases only and
 * can never be expanded by a suite file that changes after the caller's own
 * validation. Omitting `caseIds` keeps the full-suite default. */
export async function runTriggerEvaluation({
  targetPath,
  runtimeIds = DEFAULT_RUNTIME_IDS,
  runs = 1,
  runsRoot,
  timeoutMs = 300000,
  adapters = DEFAULT_ADAPTERS,
  runtimeOptions = {},
  caseIds
} = {}) {
  if (!Array.isArray(runtimeIds) || runtimeIds.length === 0 || new Set(runtimeIds).size !== runtimeIds.length || runtimeIds.some((id) => !RUNTIME_IDS.includes(id))) {
    throw new TriggerRunUsageError(`--runtime must name one or more distinct runtimes: ${RUNTIME_IDS.join(",")}`);
  }
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new TriggerRunUsageError(`--runs must be an integer from 1 to ${MAX_RUNS}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TriggerRunUsageError("timeoutMs must be positive");
  }
  const { skillDir, suitePath, suite } = await inspectSkillTarget(targetPath);
  const resolvedRunsRoot = path.resolve(runsRoot ?? defaultRunsRoot(skillDir));
  if (isWithin(skillDir, resolvedRunsRoot)) {
    throw new TriggerRunUsageError("runsRoot must be outside the skill source directory");
  }

  // Execution-boundary case selection (see the doc comment above). The
  // selected suite drives BOTH the execution loop and the scorer: the score
  // is coherent for exactly the cases that ran, never a full-suite score
  // over a partial grid.
  let selectedSuite = suite;
  let selected = false;
  if (caseIds !== undefined) {
    if (!Array.isArray(caseIds) || caseIds.length === 0 ||
        caseIds.some((id) => typeof id !== "string" || id.length === 0) ||
        new Set(caseIds).size !== caseIds.length) {
      throw new TriggerRunUsageError("caseIds must be a non-empty array of unique case ids");
    }
    const suiteCaseIds = new Set(suite.cases.map((entry) => entry.id));
    const unknownCount = caseIds.filter((id) => !suiteCaseIds.has(id)).length;
    if (unknownCount > 0) {
      throw new TriggerRunUsageError(`caseIds must reference cases of the current suite (${unknownCount} unknown)`);
    }
    const selection = new Set(caseIds);
    selectedSuite = { ...suite, cases: suite.cases.filter((entry) => selection.has(entry.id)) };
    selected = true;
  }

  const observations = [];
  for (const runtimeId of runtimeIds) {
    const adapter = adapters[runtimeId];
    if (!adapter || typeof adapter.runTriggerCase !== "function") {
      throw new TriggerRunUsageError(`no adapter for runtime ${runtimeId}`);
    }
    const configuration = runtimeOptions[runtimeId] ?? {};
    for (const entry of selectedSuite.cases) {
      for (let repeat = 1; repeat <= runs; repeat += 1) {
        const started = Date.now();
        try {
          const isolated = await withIsolatedTriggerRun({
            runsRoot: resolvedRunsRoot,
            runtimeId,
            skillDir,
            timeoutMs,
            binaryPath: configuration.binaryPath ?? defaultBinaryPath(runtimeId),
            ...(configuration.binaryArgs !== undefined ? { binaryArgs: configuration.binaryArgs } : {}),
            ...(configuration.env !== undefined ? { env: configuration.env } : {}),
            ...(configuration.codexAuthPath !== undefined ? { codexAuthPath: configuration.codexAuthPath } : {}),
            ...(configuration.claudeSettingsPath !== undefined ? { claudeSettingsPath: configuration.claudeSettingsPath } : {}),
            run: async ({ context }) => {
              const result = await adapter.runTriggerCase({ skill: suite.skill, prompt: entry.prompt, context });
              if (!result || !TRIGGER_STATUSES.includes(result.status) || result.runtime !== runtimeId) {
                throw new TypeError(`runtime ${runtimeId} returned an invalid trigger result`);
              }
              return result;
            }
          });
          const result = isolated.result;
          observations.push({
            runtime: runtimeId,
            caseId: entry.id,
            repeat,
            expect: entry.expect,
            status: result.status,
            runtimeVersion: result.runtimeVersion ?? null,
            durationMs: result.durationMs ?? Date.now() - started,
            tracePath: result.tracePath ?? null,
            runDir: isolated.runDir,
            evidence: result.evidence ?? []
          });
        } catch (error) {
          observations.push({
            runtime: runtimeId,
            caseId: entry.id,
            repeat,
            expect: entry.expect,
            status: "infra_error",
            runtimeVersion: null,
            durationMs: Date.now() - started,
            tracePath: null,
            runDir: error.runDir ?? null,
            evidence: [{ kind: "infrastructure-error", detail: error.name ?? "Error" }]
          });
        }
      }
    }
  }

  const score = scoreTriggerResults({ suite: selectedSuite, runtimeIds, runs, observations });
  return {
    schemaVersion: 1,
    skill: suite.skill,
    suitePath,
    runsRoot: resolvedRunsRoot,
    runtimeIds: [...runtimeIds],
    runs,
    ...(selected ? { caseIds: selectedSuite.cases.map((entry) => entry.id) } : {}),
    status: score.status,
    exitCode: score.exitCode,
    observations,
    score
  };
}
