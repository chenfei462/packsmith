#!/usr/bin/env node
"use strict";

// M11 OPT-IN real-model integration run. NOT part of `npm test`.
//
// This script executes the REAL trigger evaluation against REAL runtime
// clients and REAL model accounts. Every gate below is checked BEFORE any
// model call, and the whole run is bounded by a small total budget:
//
//   PACKSMITH_INTEGRATION=1                         # explicit opt-in
//   PACKSMITH_INTEGRATION_SKILL=<skill-dir>         # skill with evals/triggers.json
//   PACKSMITH_INTEGRATION_CODEX_AUTH=<file>         # required when codex is selected
//   [PACKSMITH_INTEGRATION_CLAUDE_SETTINGS=<file>]  # required when claude-code is selected
//   [PACKSMITH_INTEGRATION_CASES=id1,id2,...]       # explicit case ids (default: first 4, hard max 4)
//   [PACKSMITH_INTEGRATION_RUNTIMES=codex]          # comma list of known runtime ids
//   [PACKSMITH_INTEGRATION_RUNS=1]                  # bounded 1..2
//   [PACKSMITH_INTEGRATION_TIMEOUT_MS=300000]       # per-case runner timeout
//
// Credential honesty: there is NO implicit workstation-login fallback. A
// selected runtime without its explicit auth source file is a refusal.
// When auth source files ARE provided, the M8 isolation bridge performs a
// PRIVATE read of those files and a private copy into the isolated runtime
// state (src/trigger/isolation.mjs bridgeAuth). This script itself never
// prints credentials, raw client output, traces or auth state; its only
// output is the whitelist summary below (or a whitelist error object).
//
// Execution uses the programmatic M8 runner API (runTriggerEvaluation) with
// an explicit timeoutMs and explicit runtimeOptions, so nothing is parsed
// out of raw child stdout. Results are labeled as REAL MODEL evidence
// (bounded sample: <=4 cases, <=2 runs, total case*runtime*repeat calls
// capped at 16) — distinct from every offline control, and not proof of
// natural activation for any runtime. Without the opt-in the script
// refuses and exits 2.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RUNTIME_IDS } from "../src/runtimes/base.mjs";
import { parseTriggerSuiteJson } from "../src/trigger/schema.mjs";
import { runTriggerEvaluation } from "../src/trigger/runner.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const MAX_CASES = 4;
const MAX_RUNS = 2;
// The total budget the suite/runtimes/runs selection is validated against
// BEFORE execution: at most 4 cases x 2 runtimes x 2 runs.
const MAX_TOTAL_MODEL_CALLS = 16;

function refuse(message) {
  console.error(`Refusing to run (exit 2, zero model calls): ${message}`);
  process.exit(2);
}

if (process.env.PACKSMITH_INTEGRATION !== "1") {
  refuse("real-model integration is opt-in; set PACKSMITH_INTEGRATION=1 plus the variables documented in the script header");
}

const skill = path.resolve(process.env.PACKSMITH_INTEGRATION_SKILL ?? "");
if (!process.env.PACKSMITH_INTEGRATION_SKILL) {
  refuse("PACKSMITH_INTEGRATION_SKILL=<skill-dir> is required");
}

// ---- Validation phase: nothing below ever launches a model call. ----

const skillStat = await fs.stat(skill).catch(() => null);
if (!skillStat || !skillStat.isDirectory()) {
  refuse("PACKSMITH_INTEGRATION_SKILL must be an existing skill directory");
}

const suitePath = path.join(skill, "evals", "triggers.json");
const suiteRaw = await fs.readFile(suitePath, "utf8").catch((error) => {
  refuse(`cannot read the trigger suite at evals/triggers.json (${error.code ?? "read fault"})`);
});
const parsed = parseTriggerSuiteJson(suiteRaw, { expectedSkill: path.basename(skill) });
if (!parsed.ok) {
  refuse(`the trigger suite failed validation; run "packsmith doctor <skill-dir>" or "trigger init" locally`);
}

const suite = parsed.suite;
const suiteCaseIds = suite.cases.map((c) => c.id);

const casesInput = process.env.PACKSMITH_INTEGRATION_CASES;
let caseIds;
if (casesInput !== undefined) {
  caseIds = casesInput.split(",").map((id) => id.trim()).filter(Boolean);
  if (new Set(caseIds).size !== caseIds.length) {
    refuse("PACKSMITH_INTEGRATION_CASES contains duplicate case ids");
  }
  for (const id of caseIds) {
    if (!suiteCaseIds.includes(id)) {
      refuse("PACKSMITH_INTEGRATION_CASES names a case that is not in this suite (check the ids in evals/triggers.json)");
    }
  }
} else {
  caseIds = suiteCaseIds.slice(0, MAX_CASES);
}
if (caseIds.length === 0) {
  refuse("no cases selected (the suite is empty or the explicit selection is empty)");
}
if (caseIds.length > MAX_CASES) {
  refuse(`at most ${MAX_CASES} cases per integration run (got ${caseIds.length}); tighten PACKSMITH_INTEGRATION_CASES`);
}

const runtimes = (process.env.PACKSMITH_INTEGRATION_RUNTIMES ?? "codex")
  .split(",").map((id) => id.trim()).filter(Boolean);
if (runtimes.length === 0) {
  refuse("PACKSMITH_INTEGRATION_RUNTIMES is empty");
}
if (new Set(runtimes).size !== runtimes.length) {
  refuse("PACKSMITH_INTEGRATION_RUNTIMES contains a duplicate runtime");
}
for (const runtimeId of runtimes) {
  if (!RUNTIME_IDS.includes(runtimeId)) {
    refuse(`PACKSMITH_INTEGRATION_RUNTIMES contains an unknown runtime (known: ${RUNTIME_IDS.join(", ")})`);
  }
}

const AUTH_ENV = {
  codex: "PACKSMITH_INTEGRATION_CODEX_AUTH",
  "claude-code": "PACKSMITH_INTEGRATION_CLAUDE_SETTINGS"
};
const runtimeOptions = {};
for (const runtimeId of runtimes) {
  const source = process.env[AUTH_ENV[runtimeId]];
  if (!source) {
    refuse(`${runtimeId} requires an explicit auth source file via ${AUTH_ENV[runtimeId]}; there is no implicit workstation-login fallback`);
  }
  const resolved = path.resolve(source);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat || !stat.isFile()) {
    refuse(`the ${runtimeId} auth source file is missing or not a regular file`);
  }
  await fs.access(resolved, fs.constants.R_OK).catch(() => {
    refuse(`the ${runtimeId} auth source file is not readable by this process`);
  });
  runtimeOptions[runtimeId] = runtimeId === "codex"
    ? { codexAuthPath: resolved }
    : { claudeSettingsPath: resolved };
}

const runs = Number(process.env.PACKSMITH_INTEGRATION_RUNS ?? "1");
if (!Number.isSafeInteger(runs) || runs < 1 || runs > MAX_RUNS) {
  refuse(`PACKSMITH_INTEGRATION_RUNS must be an integer from 1 to ${MAX_RUNS}`);
}

const totalModelCalls = caseIds.length * runtimes.length * runs;
if (totalModelCalls > MAX_TOTAL_MODEL_CALLS) {
  refuse(`the selection exceeds the total budget: ${caseIds.length} cases x ${runtimes.length} runtimes x ${runs} runs = ${totalModelCalls} model calls (cap ${MAX_TOTAL_MODEL_CALLS})`);
}

const timeoutMs = Number(process.env.PACKSMITH_INTEGRATION_TIMEOUT_MS ?? "300000");
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  refuse("PACKSMITH_INTEGRATION_TIMEOUT_MS must be a positive number");
}

// ---- Execution phase: exactly caseIds x runtimes x runs model calls. ----

console.log(`[integration] REAL MODEL run: skill=${path.basename(skill)} cases=${caseIds.length} runtimes=${runtimes.join(",")} runs=${runs}`);
console.log(`[integration] budget: ${caseIds.length} x ${runtimes.length} x ${runs} = ${totalModelCalls} real model calls (cap ${MAX_TOTAL_MODEL_CALLS})`);
console.log("[integration] auth source files are privately read/copied by the M8 bridge; nothing is printed.");

let report;
try {
  report = await runTriggerEvaluation({
    targetPath: skill,
    runtimeIds: runtimes,
    runs,
    timeoutMs,
    runtimeOptions
  });
} catch (error) {
  const body = { schemaVersion: 1, kind: "real-model-integration", error: error?.name ?? "Error", code: error?.code ?? null };
  if (error?.isUsageError || error?.isValidationError) {
    body.message = error.message;
  }
  console.error(JSON.stringify(body, null, 2));
  process.exit(2);
}

// Whitelist summary: counts, statuses and identities only. The runner
// report's suitePath/runsRoot/tracePath/runDir/evidence/score fields are
// deliberately excluded — no absolute paths, no raw traces.
const summary = {
  schemaVersion: 1,
  kind: "real-model-integration",
  skill: report.skill ?? null,
  runtimeIds: [...(report.runtimeIds ?? [])],
  runs: report.runs ?? null,
  status: report.status ?? null,
  exitCode: report.exitCode ?? null,
  totalModelCalls,
  observations: (report.observations ?? []).map((o) => ({
    runtime: o.runtime,
    caseId: o.caseId,
    repeat: o.repeat,
    status: o.status
  })),
  note: "Bounded real-model sample (<=4 cases, <=2 runs, total cap 16 calls); not comparable to offline synthetic controls and not proof of natural activation for any runtime. Explicitly provided auth source files were privately read/copied by the M8 bridge; no credentials, raw output or traces are included here."
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = 0;
