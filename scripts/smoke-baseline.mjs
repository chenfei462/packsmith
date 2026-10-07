#!/usr/bin/env node
"use strict";

// M10 portable baseline smoke: exercises `packsmith trigger --save-baseline`
// end-to-end through the REAL CLI process with zero model/network/auth usage.
//
// Machinery (proven in the Wave-3 M10 independent review):
//   - an owned APPDATA with npm/codex.cmd resolving (via %~dp0) to a local
//     Node fake client that only serves `--version` and the no-model
//     `debug prompt-input` skill audit;
//   - a `node --import` preload that replaces codexAdapter.runTriggerCase
//     with a synthetic binary-result adapter (the adapter object is mutable;
//     DEFAULT_ADAPTERS only freezes the map) and injects source drift on the
//     first adapter call for the drift controls;
//   - owned HOME/USERPROFILE so no real credentials are ever read.
//
// Controls: normal save exit0, measured-FN save exit1, unresolved exit2,
// suite/SKILL/baseline drift refusals exit2, bad output parent usage2 before
// any adapter call, --baseline without --save-baseline usage2 before any
// adapter call. Exits 0 only if every row passes.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const cliEntry = path.join(repoRoot, "src", "cli.mjs");
const codexModule = path.join(repoRoot, "src", "runtimes", "codex.mjs");
const baselineModule = path.join(repoRoot, "src", "trigger", "baseline.mjs");
const scorerModule = path.join(repoRoot, "src", "trigger", "scorer.mjs");

const FAKE_CLIENT = `import path from 'node:path';
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('mock-codex 1.0.0'); }
else if (a.includes('debug') && a.includes('prompt-input')) {
  const p = path.join(process.cwd(), '.agents', 'skills', 'review-pr', 'SKILL.md').replaceAll('\\\\', '/');
  console.log(JSON.stringify([{ role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>\\n- review-pr: synthetic (file: ' + p + ')\\n</skills_instructions>' }] }]));
} else {
  console.error('smoke fake client: runTriggerCase must be preloaded; never launches a model');
  process.exit(3);
}`;

const PRELOAD = `import fs from 'node:fs/promises';
import path from 'node:path';
import { codexAdapter } from ${JSON.stringify(pathToFileURL(codexModule).href)};
let called = 0;
codexAdapter.runTriggerCase = async ({ prompt }) => {
  called += 1;
  await fs.appendFile(process.env.QA_CALLS, JSON.stringify({ called, promptLength: prompt.length }) + '\\n');
  const mode = process.env.QA_MODE;
  if (called === 1 && mode === 'suite-drift') {
    const p = path.join(process.env.QA_SKILL, 'evals', 'triggers.json');
    const s = JSON.parse(await fs.readFile(p, 'utf8'));
    s.cases[0].prompt += ' changed after preflight snapshot';
    await fs.writeFile(p, JSON.stringify(s));
  }
  if (called === 1 && mode === 'skill-drift') {
    await fs.appendFile(path.join(process.env.QA_SKILL, 'SKILL.md'), '\\nChanged during execution.\\n');
  }
  if (called === 1 && mode === 'baseline-drift') {
    const p = path.join(process.env.QA_SKILL, 'packsmith-baseline.json');
    await fs.writeFile(p, '{"note":"edited-during-run"}\\n', 'utf8');
  }
  const status = mode === 'fn' ? 'not_triggered'
    : mode === 'unresolved' ? 'infra_error'
    : prompt.includes('Review') ? 'triggered' : 'not_triggered';
  return { runtime: 'codex', runtimeVersion: 'mock-codex 1.0.0', status, durationMs: 0, evidence: [] };
};`;

async function writeHarness(root) {
  const app = path.join(root, "appdata", "npm");
  const home = path.join(root, "home");
  await fs.mkdir(app, { recursive: true });
  await fs.mkdir(home);
  await fs.writeFile(path.join(app, "fake-client.mjs"), FAKE_CLIENT, "utf8");
  // The shim resolver picks the FIRST "%~dp0\<file>.mjs" occurrence, so the
  // .exe token before it is ignored and the client is launched via node.
  await fs.writeFile(path.join(app, "codex.cmd"), '@echo off\r\n"%~dp0\\node.exe" "%~dp0\\fake-client.mjs" %*\r\n', "utf8");
  const preload = path.join(root, "preload.mjs");
  await fs.writeFile(preload, PRELOAD, "utf8");
  return { app, home, preload };
}

async function writeCase(root, id, { priorBaseline = false } = {}) {
  const work = path.join(root, id);
  const skill = path.join(work, "review-pr");
  await fs.mkdir(path.join(skill, "evals"), { recursive: true });
  await fs.writeFile(path.join(skill, "SKILL.md"),
    "---\nname: review-pr\ndescription: Review PR security when asked; do not activate for arithmetic.\n---\nReview the supplied changes.\n", "utf8");
  const suite = {
    schemaVersion: 1,
    skill: "review-pr",
    cases: [
      { id: "positive", prompt: "Review this PR", expect: "trigger" },
      { id: "negative", prompt: "Arithmetic", expect: "no-trigger" }
    ]
  };
  await fs.writeFile(path.join(skill, "evals", "triggers.json"), JSON.stringify(suite), "utf8");
  const baselinePath = path.join(skill, "packsmith-baseline.json");
  let priorText = null;
  if (priorBaseline) {
    // A real, valid baseline for THIS suite, as a previous save would leave it.
    const { buildBaseline } = await import(pathToFileURL(baselineModule).href);
    const { scoreTriggerResults } = await import(pathToFileURL(scorerModule).href);
    const observations = suite.cases.map((c) => ({
      runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
      status: c.expect === "trigger" ? "triggered" : "not_triggered",
      runtimeVersion: "mock-codex 1.0.0"
    }));
    const report = {
      schemaVersion: 1, skill: suite.skill, runtimeIds: ["codex"], runs: 1,
      observations,
      score: scoreTriggerResults({ suite, runtimeIds: ["codex"], runs: 1, observations })
    };
    priorText = JSON.stringify(buildBaseline({ report, suite }), null, 2) + "\n";
    await fs.writeFile(baselinePath, priorText, "utf8");
  }
  return { work, skill, baselinePath, priorText };
}

const rows = [];
const root = await fs.mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-baseline-"));
const { app, home, preload } = await writeHarness(root);

for (const [id, mode, extra, expectedExit, opts] of [
  ["normal-save", "normal", [], 0, {}],
  ["fn-save", "fn", [], 1, {}],
  ["unresolved", "unresolved", [], 2, {}],
  ["suite-drift", "suite-drift", [], 2, { priorBaseline: true }],
  ["skill-drift", "skill-drift", [], 2, { priorBaseline: true }],
  ["baseline-drift", "baseline-drift", [], 2, { priorBaseline: true }],
  ["bad-output-parent", "normal", ["--baseline", path.join(root, "missing-parent", "baseline.json")], 2, {}],
  ["baseline-without-save", "normal", ["--baseline", path.join(root, "unrequested.json")], 2, {}]
]) {
  const { work, skill, baselinePath, priorText } = await writeCase(root, id, opts);
  const calls = path.join(work, "calls.jsonl");
  const withSave = !["baseline-without-save"].includes(id);
  const args = [cliEntry, "trigger", skill, "--runtime", "codex", "--runs", "1",
    ...(withSave ? ["--save-baseline"] : []), ...extra, "--format=json"];
  const child = spawnSync(process.execPath, args, {
    cwd: work, encoding: "utf8", timeout: 60000, windowsHide: true,
    env: {
      ...process.env,
      HOME: home, USERPROFILE: home,
      APPDATA: path.dirname(app), LOCALAPPDATA: path.join(root, "local"),
      QA_ROOT: root, QA_SKILL: skill, QA_MODE: mode, QA_CALLS: calls,
      NODE_OPTIONS: "--import=" + pathToFileURL(preload).href
    }
  });

  let json = null;
  try { json = JSON.parse(child.stdout); } catch { /* non-JSON output is a failure signal */ }
  const callLog = (await fs.readFile(calls, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
  const adapterCalls = callLog.length;
  const contents = await fs.readFile(baselinePath, "utf8").catch(() => null);
  const saved = contents !== null && (priorText === null || contents !== priorText);
  const priorPreserved = priorText === null ? true
    : id === "baseline-drift" ? contents === '{"note":"edited-during-run"}\n'
    : contents === priorText;
  const shouldSave = ["normal-save", "fn-save"].includes(id);
  const noAdapterCall = ["bad-output-parent", "baseline-without-save"].includes(id);

  const checks = {
    nativeExit: child.status === expectedExit,
    jsonParsed: json !== null,
    stderrSilent: child.stderr === "",
    envelopeExitMatches: !json?.error || json.error.exitCode === child.status,
    ...(shouldSave ? { baselineSaved: saved } : {}),
    ...(!shouldSave && priorText !== null ? { priorPreserved } : {}),
    ...(noAdapterCall ? { zeroAdapterCalls: adapterCalls === 0 } : {}),
    // Drift refusals are infrastructure_error; the unresolved run is a
    // buildBaseline refusal (validation_error) whose exitCode must equal the
    // native exit 2 — the exact envelope/native agreement this smoke pins.
    ...(["suite-drift", "skill-drift", "baseline-drift"].includes(id)
      ? { refusalCode: json?.error?.code === "infrastructure_error", adapterCallsTwo: adapterCalls === 2 } : {}),
    ...(id === "unresolved" ? { unresolvedRefusal: json?.error?.code === "validation_error" && json?.error?.exitCode === 2, adapterCallsTwo: adapterCalls === 2 } : {}),
    ...(id === "baseline-without-save" ? { usageCode: json?.error?.code === "usage_error" } : {})
  };
  rows.push({ id, nativeExit: child.status, expectedExit, adapterCalls,
    code: json?.error?.code ?? null, errorExitCode: json?.error?.exitCode ?? null,
    message: json?.error?.message ?? null,
    saved, priorPreserved, passed: Object.values(checks).every(Boolean),
    failedChecks: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
    stderr: child.stderr.slice(0, 200) });
}

await fs.rm(root, { recursive: true, force: true });
console.log(JSON.stringify({ smoke: "baseline", repoRoot, rows, actualModelCalls: 0, actualAuthReads: 0 }, null, 2));
process.exitCode = rows.every((row) => row.passed) ? 0 : 1;
