#!/usr/bin/env node

// Bounded, explicit real-runtime evidence harness for the v0.2 acceptance
// closure. It never prints credentials, prompts, traces, or private paths.
// The caller must provide all paths and opt in explicitly.

import fs from "node:fs/promises";
import path from "node:path";

import { runTriggerEvaluation } from "../src/trigger/runner.mjs";

const evidenceRoot = process.env.PACKSMITH_REAL_EVIDENCE;
const targetPath = process.env.PACKSMITH_REAL_SKILL ?? path.join(evidenceRoot ?? "", "fixture", "github-demand");
const codexAuthPath = process.env.PACKSMITH_INTEGRATION_CODEX_AUTH;
const claudeSettingsPath = process.env.PACKSMITH_INTEGRATION_CLAUDE_SETTINGS;
const runtimeIds = (process.env.PACKSMITH_INTEGRATION_RUNTIMES ?? "codex,claude-code")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const caseIds = ["explicit-demand", "paraphrased-demand", "unrelated-code", "adjacent-market", "near-miss-launch"];

if (process.env.PACKSMITH_INTEGRATION !== "1") {
  throw new Error("set PACKSMITH_INTEGRATION=1 for this explicit real-runtime harness");
}
if (!targetPath || !evidenceRoot || !codexAuthPath || !claudeSettingsPath) {
  throw new Error("PACKSMITH_REAL_EVIDENCE and explicit Codex/Claude auth paths are required");
}
if (runtimeIds.some((runtime) => !["codex", "claude-code"].includes(runtime))) {
  throw new Error("this closure harness supports only codex and claude-code");
}

await fs.mkdir(evidenceRoot, { recursive: true });
if (!process.env.PACKSMITH_REAL_SKILL) {
  await fs.mkdir(path.join(targetPath, "evals"), { recursive: true });
  await fs.copyFile(
    path.resolve("examples/research-launchpad/skills/github-demand/SKILL.md"),
    path.join(targetPath, "SKILL.md")
  );
  await fs.writeFile(path.join(targetPath, "evals", "triggers.json"), JSON.stringify({
    schemaVersion: 1,
    skill: "github-demand",
    cases: [
      { id: "explicit-demand", prompt: "Research GitHub demand signals, active issues, and trend velocity before choosing a product direction.", expect: "trigger" },
      { id: "paraphrased-demand", prompt: "Investigate what GitHub users are asking for and use that evidence to recommend a narrow product opportunity.", expect: "trigger" },
      { id: "unrelated-code", prompt: "Explain how JavaScript array sorting works and show a small example.", expect: "no-trigger" },
      { id: "adjacent-market", prompt: "What are the top AI coding tools this year? Give me a short comparison.", expect: "no-trigger" },
      { id: "near-miss-launch", prompt: "Design a product launch plan from customer interviews and write a positioning brief.", expect: "no-trigger" }
    ]
  }, null, 2));
}
const report = await runTriggerEvaluation({
  targetPath,
  runtimeIds,
  runs: 1,
  caseIds,
  timeoutMs: 120000,
  runsRoot: path.join(evidenceRoot, "runs"),
  runtimeOptions: {
    codex: { codexAuthPath },
    "claude-code": { claudeSettingsPath }
  }
});

const relative = (value) => value ? path.relative(evidenceRoot, value).split(path.sep).join("/") : null;
const summary = {
  schemaVersion: 1,
  kind: "packsmith-real-runtime-evidence",
  skill: report.skill,
  runtimeIds: report.runtimeIds,
  runs: report.runs,
  status: report.status,
  exitCode: report.exitCode,
  caseIds: report.caseIds,
  observations: report.observations.map((entry) => ({
    runtime: entry.runtime,
    caseId: entry.caseId,
    repeat: entry.repeat,
    expect: entry.expect,
    status: entry.status,
    runtimeVersion: entry.runtimeVersion,
    durationMs: entry.durationMs,
    runDir: relative(entry.runDir),
    tracePath: relative(entry.tracePath),
    evidenceKinds: (entry.evidence ?? []).map((item) => item?.kind ?? "unknown")
  })),
  score: report.score,
  note: "Bounded one-run-per-case sample. Raw stdout, stderr, events, result, runtime metadata, and isolated workspace artifacts are retained below runs/. Credentials are excluded from this summary."
};
await fs.writeFile(path.join(evidenceRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  status: summary.status,
  exitCode: summary.exitCode,
  runtimeIds: summary.runtimeIds,
  observations: summary.observations.map(({ runtime, caseId, status, runtimeVersion, durationMs, runDir, tracePath }) => ({
    runtime, caseId, status, runtimeVersion, durationMs, runDir, tracePath
  }))
}, null, 2));
