import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

// M11 regression-gate CLI controls through the REAL cli.mjs process, zero
// model/network/auth usage: an owned APPDATA whose npm/codex.cmd resolves
// (via %~dp0) to a Node fake client serving only --version and the no-model
// `debug prompt-input` audit, plus a `node --import` preload that replaces
// codexAdapter.runTriggerCase with a synthetic binary adapter and can inject
// mid-run source drift. Adapter calls are counted via a QA file.

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
    s.cases[0].prompt += ' drifted mid-run';
    await fs.writeFile(p, JSON.stringify(s));
  }
  if (called === 1 && mode === 'baseline-drift') {
    await fs.appendFile(path.join(process.env.QA_SKILL, 'packsmith-baseline.json'), ' ');
  }
  if (called === 1 && mode === 'skill-drift') {
    await fs.appendFile(path.join(process.env.QA_SKILL, 'SKILL.md'), '\\nChanged mid-run.\\n');
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

async function setup(t) {
  // The owned-APPDATA npm/codex.cmd shim machinery is Windows-verified.
  // On POSIX the runner resolves `codex` from its private PATH and the shim
  // is ignored — POSIX offline CLI mocking is NOT claimed here. Skip honestly
  // instead of pretending coverage.
  if (process.platform !== "win32") {
    t.skip("CLI adapter-mock machinery is Windows-verified (owned npm/codex.cmd shim); POSIX offline CLI mocking is not claimed");
    return null;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-m11-ci-"));
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

async function writeSkillSkill(root, name, { yamlBroken = false, skillBody = "Review the supplied changes.\n" } = {}) {
  const skill = path.join(root, name);
  await mkdir(path.join(skill, "evals"), { recursive: true });
  const frontmatter = yamlBroken
    ? `---\nname: ${name}\ndescription: [SYNTHETIC_PRIVATE_FIELD_M11_041\n---\n`
    : `---\nname: ${name}\ndescription: Review PR security when asked; do not activate for arithmetic.\n---\n`;
  await writeFile(path.join(skill, "SKILL.md"), frontmatter + skillBody, "utf8");
  if (!yamlBroken) {
    await writeFile(path.join(skill, "evals", "triggers.json"),
      JSON.stringify({ ...SUITE, skill: name, cases: SUITE.cases.map((c) => ({ ...c })) }), "utf8");
  }
  return skill;
}

function childEnv(h, extra = {}) {
  // Preserve any parent NODE_OPTIONS (offline guard preloads) and append the
  // test preload — never silently drop the guard in children.
  const nodeOptions = [process.env.NODE_OPTIONS, "--import=" + pathToFileURL(h.preload).href]
    .filter(Boolean).join(" ");
  return {
    ...process.env,
    HOME: h.home, USERPROFILE: h.home,
    APPDATA: path.dirname(h.app), LOCALAPPDATA: path.join(h.root, "local"),
    NODE_OPTIONS: nodeOptions,
    ...extra
  };
}

function spawnCli(h, args, cwd, extra = {}) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd, encoding: "utf8", timeout: 60000, windowsHide: true, env: childEnv(h, extra)
  });
}

async function saveBaseline(h, skillDir, mode = null) {
  const calls = path.join(h.root, `save-calls-${Math.random().toString(36).slice(2, 6)}.jsonl`);
  const child = spawnCli(h,
    ["trigger", skillDir, "--runtime", "codex", "--runs", "1", "--save-baseline", "--format=json"],
    path.dirname(skillDir), { QA_SKILL: skillDir, QA_CALLS: calls, ...(mode ? { QA_MODE: mode } : {}) });
  // A fully measured FN baseline saves with native exit 1 — still a save.
  assert.ok(child.status === 0 || (mode === "fn" && child.status === 1),
    `baseline save failed: ${child.status} ${child.stderr}`);
}

async function runCi(h, { target, resultsFile = null, mode = null }) {
  const calls = path.join(h.root, `ci-calls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jsonl`);
  const args = ["ci", target, "--format=json"];
  if (resultsFile !== null) args.push("--results", resultsFile);
  const child = spawnCli(h, args, h.root, { QA_CALLS: calls, ...(mode ? { QA_MODE: mode } : {}), ...(target ? { QA_SKILL: target } : {}) });
  let json = null;
  try { json = JSON.parse(child.stdout); } catch { /* non-JSON output is a failure */ }
  const callCount = ((await readFile(calls, "utf8").catch(() => "")) ?? "").trim().split("\n").filter(Boolean).length;
  return { child, json, callCount };
}

test("ci fresh gate: pass and measured regression exits", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, skill);

  const pass = await runCi(h, { target: skill });
  assert.equal(pass.child.status, 0, pass.child.stderr);
  assert.equal(pass.json.skills[0].verdict, "pass");
  assert.equal(pass.json.skills[0].mode, "fresh");
  assert.equal(pass.callCount, 2, "fresh gate runs the adapter once per case");
  assert.ok(!JSON.stringify(pass.json).includes(h.root), "no absolute private root in the uploadable report");

  const regression = await runCi(h, { target: skill, mode: "fn" });
  assert.equal(regression.child.status, 1, "measured positive-case activation drop is a regression");
  assert.equal(regression.json.skills[0].verdict, "regression");
  const kinds = regression.json.skills[0].comparison.failedChecks.map((c) => c.kind);
  assert.ok(kinds.includes("case-activation-decrease"));
  assert.ok(kinds.includes("recall-regression"));
});

test("ci imported evidence is labeled and unresolved imports stay exit2 with retained measured regressions", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, skill);

  const report = {
    schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1,
    observations: SUITE.cases.map((c) => ({
      runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
      status: c.expect === "trigger" ? "triggered" : "not_triggered",
      runtimeVersion: "mock-codex 1.0.0"
    }))
  };
  const validFile = path.join(h.root, "valid-results.json");
  await writeFile(validFile, JSON.stringify(report), "utf8");
  const imported = await runCi(h, { target: skill, resultsFile: validFile });
  assert.equal(imported.child.status, 0, imported.child.stderr);
  assert.equal(imported.json.skills[0].mode, "imported");
  assert.equal(imported.callCount, 0, "imported evidence never runs adapters");
  assert.equal(imported.json.resultsFile, "valid-results.json", "results reference is target-relative");

  const unresolvedFile = path.join(h.root, "unresolved-results.json");
  const unresolved = {
    ...report,
    observations: report.observations.map((o) =>
      o.caseId === "negative" ? { ...o, status: "infra_error" } : { ...o, status: "not_triggered" }
    )
  };
  await writeFile(unresolvedFile, JSON.stringify(unresolved), "utf8");
  const unable = await runCi(h, { target: skill, resultsFile: unresolvedFile });
  assert.equal(unable.child.status, 2, "unresolved evidence is incomplete, never a pass or a behavioral negative");
  assert.equal(unable.json.skills[0].verdict, "unable");
  const diag = unable.json.skills[0].comparison.diagnostics.runtimes.codex;
  const measured = diag.measuredRegressions?.find((r) => r.caseId === "positive");
  assert.ok(measured, "measured regression on the valid cell is retained");
  assert.equal(measured.check, "case-activation-decrease");
  assert.equal(diag.cases.negative.validRuns, 0, "unresolved cell contributes no invented TN/FP");
});

test("ci two-phase preflight: a later skill without a baseline blocks ALL adapters", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const good = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, good);
  await writeSkillSkill(h.root, "other-skill");

  const run = await runCi(h, { target: h.root });
  assert.equal(run.child.status, 2, "a skill that cannot be gated makes the whole path unable, never a pass");
  assert.equal(run.callCount, 0, "preflight failure must prevent any adapter call");
  const executed = run.json.skills.find((s) => s.skill === "review-pr");
  assert.equal(executed.executed, false, "first skill is prepared but not executed");
  assert.equal(run.json.skills.find((s) => s.skill === "other-skill").exitCode, 2);
});

test("ci mid-run suite drift is unable2 with measured diagnostics, never a mixed-revision comparison", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, skill);

  const run = await runCi(h, { target: skill, mode: "suite-drift" });
  assert.equal(run.child.status, 2);
  assert.equal(run.json.skills[0].verdict, "unable");
  assert.ok(run.json.skills[0].comparison.unableReasons.some((r) => /changed during evaluation/.test(r)));
  assert.ok(run.json.skills[0].comparison.diagnostics, "measured diagnostics retained");
  assert.equal(run.callCount, 2, "the run itself executed before the drift was detected");
});

test("ci upload sanitization: malformed SKILL YAML sentinel never reaches the report", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  await writeSkillSkill(h.root, "review-pr", { yamlBroken: true });

  const run = await runCi(h, { target: h.root });
  assert.equal(run.child.status, 1, "static structural errors are validation failures");
  const serialized = run.child.stdout;
  assert.ok(!serialized.includes("SYNTHETIC_PRIVATE_FIELD_M11_041"), "no source-derived sentinel in the uploadable report");
  assert.ok(!serialized.includes(h.root), "no absolute private root in the uploadable report");
  const globalError = run.json.staticValidation.globalErrors.find((d) => d.id === "PS-SPEC-003");
  assert.ok(globalError, "the structural error is reported");
  assert.equal(typeof globalError.message, "string", "message is the stable KB rule text");
  assert.ok(!/\[SYNTHETIC/.test(globalError.message), "message is rule text, not the parser excerpt");
});

test("ci upload sanitization: malformed baseline reason is structural, no absolute path", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await writeFile(path.join(skill, "packsmith-baseline.json"), '{"schemaVersion": 1, "skill": "review-pr"', "utf8");

  const run = await runCi(h, { target: skill });
  assert.equal(run.child.status, 1, "baseline validation failure is exit 1");
  const serialized = run.child.stdout;
  assert.ok(!serialized.includes(h.root), "no absolute private path leaked from the reader message");
  assert.match(run.json.skills[0].reason, /baseline failed strict validation at .*packsmith-baseline\.json/);
});

test("ci usage errors keep JSON envelopes and relative references", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, skill);

  const missingResults = await runCi(h, { target: skill, resultsFile: path.join(h.root, "no-such-results.json") });
  assert.equal(missingResults.child.status, 2);
  assert.equal(missingResults.json.error.code, "usage_error");
  assert.ok(!missingResults.child.stdout.includes(h.root), "missing-file error references no absolute path");

  const badRuns = await runCi(h, { target: skill, mode: null });
  // no --runs given here; assert --runs validation separately via a direct spawn
  const child = spawnCli(h, ["ci", skill, "--runs", "0", "--format=json"], h.root);
  const parsed = JSON.parse(child.stdout);
  assert.equal(child.status, 2);
  assert.equal(parsed.error.code, "usage_error");
});

test("ci read-fault injection: EIO on the results file is a sanitized envelope with no raw echo", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  await saveBaseline(h, skill);

  // A REAL injected read fault: a dedicated preload patches fs.promises.readFile
  // and throws EIO with an embedded sentinel whenever the results file is read.
  // The fired counter proves the fault path ran; the uploadable envelope must
  // carry only the error code — never the raw message (absolute path, bytes).
  const faultPreload = path.join(h.root, "fault-preload.mjs");
  const faultFile = path.join(h.root, "fault-fired.txt");
  const resultsFile = path.join(h.root, "results-fault.json");
  await writeFile(resultsFile, JSON.stringify(validReportForFault()), "utf8");
  // The synthetic raw message embeds a sentinel AND an absolute-looking
  // path string; if the boundary is porous either would leak.
  await writeFile(faultPreload, `import fsMod from 'node:fs/promises';
const realRead = fsMod.readFile;
let fired = 0;
Object.defineProperty(fsMod, 'readFile', {
  value: async function patchedRead(...args) {
    if (process.env.QA_FAULT_TARGET && String(args[0]).endsWith(process.env.QA_FAULT_TARGET)) {
      fired += 1;
      await fsMod.appendFile(process.env.QA_FAULT_FILE, String(fired));
      const error = new Error('EIO: injected read fault, open <SYNTHETIC_PRIVATE_FIELD_M11_077> at ' + process.env.QA_FAULT_TARGET);
      error.code = 'EIO';
      throw error;
    }
    return realRead(...args);
  },
  configurable: true,
  writable: true
});`, "utf8");

  // Preserve the parent NODE_OPTIONS guard and append BOTH preloads.
  const nodeOptions = [process.env.NODE_OPTIONS,
    "--import=" + pathToFileURL(faultPreload).href].filter(Boolean).join(" ");
  const calls = path.join(h.root, "fault-calls.jsonl");
  const child = spawnSync(process.execPath,
    [cliEntry, "ci", skill, "--results", resultsFile, "--format=json"], {
      cwd: h.root, encoding: "utf8", timeout: 60000, windowsHide: true,
      env: {
        ...process.env,
        HOME: h.home, USERPROFILE: h.home,
        APPDATA: path.dirname(h.app), LOCALAPPDATA: path.join(h.root, "local"),
        NODE_OPTIONS: nodeOptions,
        QA_FAULT_TARGET: "results-fault.json", QA_FAULT_FILE: faultFile, QA_CALLS: calls
      }
    });

  const fired = await readFile(faultFile, "utf8").catch(() => "");
  assert.ok(fired.length > 0, "the injected read fault must actually have fired");
  assert.equal(child.status, 2, `unexpected status: ${child.status} ${child.stderr}`);
  const envelope = JSON.parse(child.stdout);
  assert.equal(envelope.error.code, "infrastructure_error");
  assert.equal(envelope.error.exitCode, 2);
  const serialized = child.stdout;
  assert.ok(!serialized.includes("SYNTHETIC_PRIVATE_FIELD_M11_077"), "raw error message bytes must not leak");
  assert.ok(!serialized.includes(h.root), "no absolute private root in the envelope");
  assert.match(envelope.error.message, /results-fault\.json \(EIO\)/);
});

function validReportForFault() {
  return {
    schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1,
    observations: SUITE.cases.map((c) => ({
      runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
      status: c.expect === "trigger" ? "triggered" : "not_triggered",
      runtimeVersion: "mock-codex 1.0.0"
    }))
  };
}

test("ci read-boundary replacement race: validated snapshot vs on-disk replacement refuses with zero adapters", async (t) => {
  const h = await setup(t);
  if (h === null) return;
  const skill = await writeSkillSkill(h.root, "review-pr");
  // Original baseline: recall 0 (positive measured not_triggered, still binary).
  await saveBaseline(h, skill, "fn");

  // Author replacement: a VALID M10 baseline with recall 1, written to disk
  // by the injected race DURING the gate's first baseline read.
  const suiteRaw = await readFile(path.join(skill, "evals", "triggers.json"), "utf8");
  const { parseTriggerSuiteJson } = await import("../../src/trigger/schema.mjs");
  const { buildBaseline } = await import("../../src/trigger/baseline.mjs");
  const suiteParsed = parseTriggerSuiteJson(suiteRaw, {}).suite;
  const winObs = SUITE.cases.map((c) => ({
    runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
    status: c.expect === "trigger" ? "triggered" : "not_triggered",
    runtimeVersion: "mock-codex 1.0.0"
  }));
  const replacement = buildBaseline({
    report: { schemaVersion: 1, skill: "review-pr", runtimeIds: ["codex"], runs: 1, observations: winObs },
    suite: suiteParsed
  });
  const replacementFile = path.join(h.root, "replacement-baseline.json");
  await writeFile(replacementFile, JSON.stringify(replacement, null, 2) + "\n", "utf8");

  // The race preload: the FIRST read of the baseline file really writes the
  // author replacement to disk, then hands back the STALE validated bytes —
  // exactly the interleaving that a second, independent hash read would hide.
  const racePreload = path.join(h.root, "race-preload.mjs");
  const raceCounter = path.join(h.root, "race-fired.txt");
  await writeFile(racePreload, `import fsMod from 'node:fs/promises';
const realRead = fsMod.readFile;
let fired = 0;
let swapped = false;
Object.defineProperty(fsMod, 'readFile', {
  value: async function raceRead(...args) {
    const result = await realRead(...args);
    const p = String(args[0]);
    if (!swapped && process.env.QA_RACE_TARGET && p.endsWith(process.env.QA_RACE_TARGET)) {
      swapped = true;
      fired += 1;
      await fsMod.appendFile(process.env.QA_RACE_COUNTER, String(fired));
      await fsMod.writeFile(p, await realRead(process.env.QA_RACE_REPLACEMENT), 'utf8');
    }
    return result;
  },
  configurable: true,
  writable: true
});`, "utf8");

  const nodeOptions = [process.env.NODE_OPTIONS,
    "--import=" + pathToFileURL(h.preload).href,
    "--import=" + pathToFileURL(racePreload).href].filter(Boolean).join(" ");
  const calls = path.join(h.root, "race-calls.jsonl");
  const child = spawnSync(process.execPath,
    [cliEntry, "ci", skill, "--format=json"], {
      cwd: h.root, encoding: "utf8", timeout: 60000, windowsHide: true,
      env: {
        ...process.env,
        HOME: h.home, USERPROFILE: h.home,
        APPDATA: path.dirname(h.app), LOCALAPPDATA: path.join(h.root, "local"),
        NODE_OPTIONS: nodeOptions,
        QA_RACE_TARGET: "packsmith-baseline.json", QA_RACE_REPLACEMENT: replacementFile,
        QA_RACE_COUNTER: raceCounter, QA_CALLS: calls, QA_SKILL: skill
      }
    });

  const fired = await readFile(raceCounter, "utf8").catch(() => "");
  assert.ok(fired.length > 0, "the injected race must actually have fired");
  assert.equal(child.status, 2, `expected unable gate, got: ${child.status} ${child.stderr}`);
  const report = JSON.parse(child.stdout);
  assert.equal(report.skills[0].verdict, "unable");
  assert.ok(report.skills[0].comparison.unableReasons.some((r) => /baseline .* changed before execution/.test(r)),
    JSON.stringify(report.skills[0].comparison.unableReasons));
  assert.equal(report.skills[0].executed, false, "refused before any adapter call");
  assert.equal(report.skills[0].comparison.diagnostics, null, "no comparison of mixed revisions is even attempted");
  assert.equal(((await readFile(calls, "utf8").catch(() => "")) ?? "").trim(), "", "zero adapter calls");
  const onDisk = await readFile(path.join(skill, "packsmith-baseline.json"), "utf8");
  assert.equal(onDisk, JSON.stringify(replacement, null, 2) + "\n", "the author replacement is preserved, never overwritten");
  assert.ok(!child.stdout.includes(h.root), "no absolute private root in the report");
});
