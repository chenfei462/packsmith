#!/usr/bin/env node
"use strict";

// M11 portable regression-gate smoke: exercises `packsmith ci` end-to-end
// through the REAL CLI process with zero model/network/auth usage.
//
// Machinery (same as the M10 baseline smoke): an owned APPDATA with
// npm/codex.cmd resolving via %~dp0 to a Node fake client that only serves
// `--version` and the no-model `debug prompt-input` audit, plus a
// `node --import` preload replacing codexAdapter.runTriggerCase with a
// synthetic binary adapter (drift injection for the mid-run controls).
//
// Exits 0 only if every control passes AND no report leaks the private
// temp root or absolute paths.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

// The offline adapter mock uses the Windows-verified owned npm/codex.cmd
// shim. On POSIX the runner resolves `codex` from its private PATH and the
// shim is ignored — fail loudly rather than pretend coverage.
if (process.platform !== "win32") {
  console.error("smoke requires Windows: offline CLI mocking is Windows-verified; POSIX offline CLI mocking is not claimed");
  process.exit(1);
}
const cliEntry = path.join(repoRoot, "src", "cli.mjs");
const codexModule = path.join(repoRoot, "src", "runtimes", "codex.mjs");

const FAKE_CLIENT = `import path from 'node:path';
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('mock-codex 1.0.0'); }
else if (a.includes('debug') && a.includes('prompt-input')) {
  const p = path.join(process.cwd(), '.agents', 'skills', 'review-pr', 'SKILL.md').replaceAll('\\\\', '/');
  console.log(JSON.stringify([{ role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>\\n- review-pr: synthetic (file: ' + p + ')\\n</skills_instructions>' }] }]));
} else { console.error('smoke fake client: never launches a model'); process.exit(3); }`;

const PRELOAD = `import fs from 'node:fs/promises';
import path from 'node:path';
import { codexAdapter } from ${JSON.stringify(pathToFileURL(codexModule).href)};
let called = 0;
codexAdapter.runTriggerCase = async ({ prompt }) => {
  called += 1;
  await fs.appendFile(process.env.QA_CALLS, called + '\\n');
  const mode = process.env.QA_MODE;
  if (called === 1 && mode === 'suite-drift') {
    const p = path.join(process.env.QA_SKILL, 'evals', 'triggers.json');
    const s = JSON.parse(await fs.readFile(p, 'utf8'));
    s.cases[0].prompt += ' drifted mid-run';
    await fs.writeFile(p, JSON.stringify(s));
  }
  const status = mode === 'fn' ? 'not_triggered' : prompt.includes('Review') ? 'triggered' : 'not_triggered';
  return { runtime: 'codex', runtimeVersion: 'mock-codex 1.0.0', status, durationMs: 0, evidence: [] };
};`;

const SUITE = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "positive", prompt: "Review this PR", expect: "trigger" },
    { id: "negative", prompt: "Arithmetic", expect: "no-trigger" }
  ]
};

const root = await fs.mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-ci-"));
const app = path.join(root, "appdata", "npm");
const home = path.join(root, "home");
await fs.mkdir(app, { recursive: true });
await fs.mkdir(home);
await fs.writeFile(path.join(app, "fake-client.mjs"), FAKE_CLIENT, "utf8");
await fs.writeFile(path.join(app, "codex.cmd"), '@echo off\r\n"%~dp0\\node.exe" "%~dp0\\fake-client.mjs" %*\r\n', "utf8");
const preload = path.join(root, "preload.mjs");
await fs.writeFile(preload, PRELOAD, "utf8");

function env(extra = {}) {
  return {
    ...process.env,
    HOME: home, USERPROFILE: home,
    APPDATA: path.dirname(app), LOCALAPPDATA: path.join(root, "local"),
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import=" + pathToFileURL(preload).href].filter(Boolean).join(" "),
    ...extra
  };
}

// Fixture identity rule: the fake client's scope audit advertises the skill
// basename `review-pr` (the mocked client has no per-skill configuration), so
// every GATED control skill must be named review-pr in its own per-control
// parent directory. Suites carry their directory's basename so identity
// validation stays strict; ungated fixture skills (preflight failures) are
// never audited.
async function writeSkill(parentDir, basename = "review-pr", { withSuite = true, withBaseline = false } = {}) {
  const skill = path.join(parentDir, basename);
  await fs.mkdir(path.join(skill, "evals"), { recursive: true });
  await fs.writeFile(path.join(skill, "SKILL.md"),
    `---\nname: ${basename}\ndescription: Review PR security when asked; do not activate for arithmetic.\n---\nReview the supplied changes.\n`, "utf8");
  if (withSuite) {
    await fs.writeFile(path.join(skill, "evals", "triggers.json"),
      JSON.stringify({ ...SUITE, skill: basename }), "utf8");
  }
  if (withBaseline) {
    const calls = path.join(parentDir, `save-${Math.random().toString(36).slice(2)}.jsonl`);
    const child = spawnSync(process.execPath,
      [cliEntry, "trigger", skill, "--runtime", "codex", "--runs", "1", "--save-baseline", "--format=json"],
      { cwd: parentDir, encoding: "utf8", timeout: 60000, windowsHide: true, env: env({ QA_CALLS: calls }) });
    if (child.status !== 0) {
      throw new Error(`baseline save failed for ${skill}: status=${child.status} stderr=${child.stderr} stdout=${child.stdout.slice(0, 400)}`);
    }
  }
  return skill;
}

async function runCli(args, cwd, extra = {}) {
  const calls = path.join(root, `calls-${Math.random().toString(36).slice(2)}.jsonl`);
  const child = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd, encoding: "utf8", timeout: 60000, windowsHide: true, env: env({ QA_CALLS: calls, ...extra })
  });
  let json = null;
  try { json = JSON.parse(child.stdout); } catch { /* non-JSON output is a failure signal */ }
  const callCount = ((await fs.readFile(calls, "utf8").catch(() => "")) ?? "").trim().split("\n").filter(Boolean).length;
  return { child, json, callCount };
}

function validReport() {
  return {
    schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1,
    observations: SUITE.cases.map((c) => ({
      runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
      status: c.expect === "trigger" ? "triggered" : "not_triggered",
      runtimeVersion: "mock-codex 1.0.0"
    }))
  };
}

async function importControl(name, report, expectedExit, checks) {
  const skill = await writeSkill(path.join(root, `ctrl-${name}`), "review-pr", { withBaseline: true });
  const file = path.join(root, `results-${name}.json`);
  await fs.writeFile(file, JSON.stringify(report), "utf8");
  const run = await runCli(["ci", skill, "--results", file, "--format=json"], root);
  const s = run.json?.skills?.[0];
  const out = {
    id: name, nativeExit: run.child.status, expectedExit,
    verdict: s?.verdict ?? null, adapterCalls: run.callCount,
    noAbsoluteLeak: !run.child.stdout.includes(root),
    passed: run.child.status === expectedExit && run.json !== null && run.child.stderr === "" &&
      !run.child.stdout.includes(root) && (checks ? checks(run, s) : true)
  };
  out.failed = Object.entries({
    exit: run.child.status === expectedExit,
    json: run.json !== null,
    stderrSilent: run.child.stderr === "",
    noAbsoluteLeak: out.noAbsoluteLeak,
    ...(checks ? checks(run, s) : {})
  }).filter(([, ok]) => !ok).map(([k]) => k);
  return out;
}

const rows = [];

// Fresh gate: pass and regression (distinct per-control parent directories).
const freshSkill = await writeSkill(path.join(root, "ctrl-fresh"), "review-pr", { withBaseline: true });
const freshPass = await runCli(["ci", freshSkill, "--format=json"], root, { QA_SKILL: freshSkill });
rows.push({ id: "fresh-pass", nativeExit: freshPass.child.status, expectedExit: 0,
  verdict: freshPass.json?.skills?.[0]?.verdict ?? null, adapterCalls: freshPass.callCount,
  failed: freshPass.child.status === 0 && freshPass.json?.skills?.[0]?.verdict === "pass" && freshPass.callCount === 2 ? [] : ["behavior"] });

const freshRegression = await runCli(["ci", freshSkill, "--format=json"], root, { QA_SKILL: freshSkill, QA_MODE: "fn" });
rows.push({ id: "fresh-regression", nativeExit: freshRegression.child.status, expectedExit: 1,
  verdict: freshRegression.json?.skills?.[0]?.verdict ?? null, adapterCalls: freshRegression.callCount,
  failed: freshRegression.child.status === 1 &&
    freshRegression.json?.skills?.[0]?.comparison?.failedChecks?.some((c) => c.kind === "case-activation-decrease")
    ? [] : ["behavior"] });

// Imported evidence controls.
rows.push(await importControl("imported-valid", validReport(), 0,
  (run, s) => ({ modeImported: s?.mode === "imported", zeroAdapters: run.callCount === 0 })));
rows.push(await importControl("imported-unresolved",
  (() => {
    const r = validReport();
    r.observations = r.observations.map((o) =>
      o.caseId === "negative" ? { ...o, status: "infra_error" } : { ...o, status: "not_triggered" });
    return r;
  })(), 2,
  (run, s) => ({
    retainedMeasured: s?.comparison?.diagnostics?.runtimes?.codex?.measuredRegressions?.some((r) => r.caseId === "positive") === true,
    noInventedCells: s?.comparison?.diagnostics?.runtimes?.codex?.cases?.negative?.validRuns === 0
  })));
rows.push(await importControl("imported-schema2", (() => { const r = validReport(); r.schemaVersion = 2; return r; })(), 1));
rows.push(await importControl("imported-dup-slot", (() => {
  const r = validReport(); r.observations[1].repeat = 2; return r;
})(), 1));
rows.push(await importControl("imported-expect-conflict", (() => {
  const r = validReport(); r.observations[0].expect = "no-trigger"; return r;
})(), 1));
rows.push(await importControl("imported-empty", (() => { const r = validReport(); r.observations = []; return r; })(), 2));

// Mid-run suite drift (fresh).
const driftSkill = await writeSkill(path.join(root, "ctrl-drift"), "review-pr", { withBaseline: true });
const drift = await runCli(["ci", driftSkill, "--format=json"], root, { QA_SKILL: driftSkill, QA_MODE: "suite-drift" });
rows.push({ id: "suite-drift", nativeExit: drift.child.status, expectedExit: 2, adapterCalls: drift.callCount,
  failed: drift.child.status === 2 && drift.callCount === 2 &&
    drift.json?.skills?.[0]?.comparison?.unableReasons?.some((r) => /changed during evaluation/.test(r)) ? [] : ["behavior"] });

// Two-phase preflight: second skill without a baseline blocks all adapters.
const multiRoot = path.join(root, "multi");
await fs.mkdir(multiRoot, { recursive: true });
await writeSkill(multiRoot, "review-pr", { withBaseline: true });
await writeSkill(multiRoot, "other-skill", { withSuite: true, withBaseline: false });
const twoPhase = await runCli(["ci", multiRoot, "--format=json"], root);
rows.push({ id: "two-phase-preflight", nativeExit: twoPhase.child.status, expectedExit: 2, adapterCalls: twoPhase.callCount,
  failed: twoPhase.child.status === 2 && twoPhase.callCount === 0 &&
    twoPhase.json?.skills?.find((s) => s.skill === "review-pr")?.executed === false ? [] : ["behavior"] });

// Usage error.
const usage = await runCli(["ci", freshSkill, "--runs", "0", "--format=json"], root);
rows.push({ id: "usage-runs", nativeExit: usage.child.status, expectedExit: 2,
  failed: usage.child.status === 2 && usage.json?.error?.code === "usage_error" ? [] : ["behavior"] });

await fs.rm(root, { recursive: true, force: true });
console.log(JSON.stringify({ smoke: "ci", rows: rows.map(({ failed, ...rest }) => ({ ...rest, passed: failed.length === 0, failed })), actualModelCalls: 0 }, null, 2));
process.exitCode = rows.every((row) => row.failed.length === 0) ? 0 : 1;
