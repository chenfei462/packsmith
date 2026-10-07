import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

// M10 CLI baseline regressions: the REAL cli.mjs process runs with an owned
// APPDATA whose npm/codex.cmd resolves (via %~dp0) to a local Node fake
// client that only serves `--version` and the no-model `debug prompt-input`
// audit, while a `node --import` preload replaces codexAdapter.runTriggerCase
// with a synthetic binary adapter (no model, no network, no auth) and injects
// source drift on the first adapter call for the drift controls.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const cliEntry = path.join(repoRoot, "src", "cli.mjs");
const codexModule = path.join(repoRoot, "src", "runtimes", "codex.mjs");

const FAKE_CLIENT = `import path from 'node:path';
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('mock-codex 1.0.0'); }
else if (a.includes('debug') && a.includes('prompt-input')) {
  const p = path.join(process.cwd(), '.agents', 'skills', 'review-pr', 'SKILL.md').replaceAll('\\\\', '/');
  console.log(JSON.stringify([{ role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>\\n- review-pr: synthetic (file: ' + p + ')\\n</skills_instructions>' }] }]));
} else { console.error('fake client: never launches a model'); process.exit(3); }`;

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
    s.cases[0].prompt += ' changed after preflight snapshot';
    await fs.writeFile(p, JSON.stringify(s));
  }
  if (called === 1 && mode === 'skill-drift') {
    await fs.appendFile(path.join(process.env.QA_SKILL, 'SKILL.md'), '\\nChanged during execution.\\n');
  }
  if (called === 1 && mode === 'baseline-drift') {
    await fs.writeFile(path.join(process.env.QA_SKILL, 'packsmith-baseline.json'), '{"note":"edited-during-run"}\\n', 'utf8');
  }
  const status = mode === 'fn' ? 'not_triggered' : prompt.includes('Review') ? 'triggered' : 'not_triggered';
  return { runtime: 'codex', runtimeVersion: 'mock-codex 1.0.0', status, durationMs: 0, evidence: [] };
};`;

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-m10-baseline-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = path.join(root, "appdata", "npm");
  const home = path.join(root, "home");
  await mkdir(app, { recursive: true });
  await mkdir(home);
  await writeFile(path.join(app, "fake-client.mjs"), FAKE_CLIENT, "utf8");
  await writeFile(path.join(app, "codex.cmd"), '@echo off\r\n"%~dp0\\node.exe" "%~dp0\\fake-client.mjs" %*\r\n', "utf8");
  const preload = path.join(root, "preload.mjs");
  await writeFile(preload, PRELOAD, "utf8");
  return { root, app, home, preload };
}

async function writeSkill(root, id, { priorBaseline = false } = {}) {
  const work = path.join(root, id);
  const skill = path.join(work, "review-pr");
  await mkdir(path.join(skill, "evals"), { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"),
    "---\nname: review-pr\ndescription: Review PR security when asked; do not activate for arithmetic.\n---\nReview the supplied changes.\n", "utf8");
  await writeFile(path.join(skill, "evals", "triggers.json"), JSON.stringify({
    schemaVersion: 1,
    skill: "review-pr",
    cases: [
      { id: "positive", prompt: "Review this PR", expect: "trigger" },
      { id: "negative", prompt: "Arithmetic", expect: "no-trigger" }
    ]
  }), "utf8");
  const baselinePath = path.join(skill, "packsmith-baseline.json");
  let priorText = null;
  if (priorBaseline) {
    priorText = '{"note":"prior-author-baseline"}\n';
    await writeFile(baselinePath, priorText, "utf8");
  }
  return { work, skill, baselinePath, priorText };
}

async function runCase({ root, app, home, preload }, { id, mode, extra = [], withSave = true, priorBaseline = false }) {
  const { work, skill, baselinePath, priorText } = await writeSkill(root, id, { priorBaseline });
  const calls = path.join(work, "calls.jsonl");
  const child = spawnSync(process.execPath, [cliEntry, "trigger", skill, "--runtime", "codex", "--runs", "1",
    ...(withSave ? ["--save-baseline"] : []), ...extra, "--format=json"], {
    cwd: work, encoding: "utf8", timeout: 60000, windowsHide: true,
    env: {
      ...process.env,
      HOME: home, USERPROFILE: home,
      APPDATA: path.dirname(app), LOCALAPPDATA: path.join(root, "local"),
      QA_SKILL: skill, QA_CALLS: calls, QA_MODE: mode,
      NODE_OPTIONS: "--import=" + pathToFileURL(preload).href
    }
  });
  let json = null;
  try { json = JSON.parse(child.stdout); } catch { /* leave null */ }
  const adapterCalls = (await readFile(calls, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).length;
  const contents = await readFile(baselinePath, "utf8").catch(() => null);
  return { child, json, adapterCalls, contents, priorText, baselinePath };
}

test("baseline CLI: normal save exit0 and measured FN save exit1", async (t) => {
  const h = await setup(t);
  const normal = await runCase(h, { id: "normal", mode: "normal" });
  assert.equal(normal.child.status, 0, normal.child.stderr);
  assert.ok(normal.contents !== null && normal.contents.includes('"schemaVersion": 1'), "baseline saved");
  assert.equal(JSON.parse(normal.contents).score.exitCode, 0);

  const fn = await runCase(h, { id: "fn", mode: "fn" });
  assert.equal(fn.child.status, 1, "measured FN is a real failure exit, still saved");
  assert.ok(fn.contents !== null, "FN baseline saved with exitCode 1");
  assert.equal(JSON.parse(fn.contents).score.exitCode, 1);
});

test("baseline CLI: suite drift during evaluation refuses with infrastructure_error exit2 and prior preserved", async (t) => {
  const h = await setup(t);
  const { child, json, contents, priorText } = await runCase(h, { id: "suite-drift", mode: "suite-drift", priorBaseline: true });
  assert.equal(child.status, 2, child.stderr);
  assert.equal(json?.error?.code, "infrastructure_error");
  assert.equal(json?.error?.exitCode, 2);
  assert.match(json?.error?.message ?? "", /suite changed during evaluation/);
  assert.equal(contents, priorText, "prior baseline bytes preserved");
});

test("baseline CLI: baseline edited during evaluation refuses and the edit is preserved", async (t) => {
  const h = await setup(t);
  const { child, json, contents } = await runCase(h, { id: "baseline-drift", mode: "baseline-drift", priorBaseline: true });
  assert.equal(child.status, 2, child.stderr);
  assert.equal(json?.error?.code, "infrastructure_error");
  assert.equal(json?.error?.exitCode, 2);
  assert.match(json?.error?.message ?? "", /existing baseline changed during evaluation/);
  assert.equal(contents, '{"note":"edited-during-run"}\n', "the mid-run edit is not overwritten by the save");
});

test("baseline CLI: --baseline without --save-baseline is usage_error exit2 before any adapter call", async (t) => {
  const h = await setup(t);
  const { child, json, adapterCalls } = await runCase(h, {
    id: "without-save", mode: "normal", withSave: false, extra: ["--baseline", path.join(h.root, "unrequested.json")]
  });
  assert.equal(child.status, 2, child.stderr);
  assert.equal(json?.error?.code, "usage_error");
  assert.equal(json?.error?.exitCode, 2);
  assert.match(json?.error?.message ?? "", /--baseline requires --save-baseline/);
  assert.equal(adapterCalls, 0, "no adapter may run for a baseline path nobody asked to save");
});
