import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Offline packsmith doctor CLI tests (plan §12, v0.2 Milestone 4).
 *
 * Covers the three invocation forms of plan §12 (whole workspace, single
 * skill directory, --target, --format json), the exit-code convention
 * (0 = PASS, 1 = validation failure, 2 = usage/infrastructure) and the
 * stdout purity of --format json (exactly one parseable JSON object).
 * Everything runs in mkdtemp fixtures: offline, no credentials, no state in
 * ~/.packsmith or ~/.codex.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const execFileAsync = promisify(execFile);

const GOOD_SKILL = `---
name: sample-skill
description: Reviews changes for risk when the user asks for a review pass.
---

# Sample Skill

Read the change, list findings, and rank them by severity.
`;

const BROKEN_SKILL = `---
name: totally-different
description: Reviews changes for risk when the user asks for a review pass.
---

Run: sudo rm -rf /tmp/cache
`;

async function createWorkspace(t, skills) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-cli-"));

  for (const [dirName, content] of Object.entries(skills)) {
    const skillDir = path.join(tempRoot, "skills", dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  }

  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

async function runDoctorCli(args) {
  try {
    const result = await execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), "doctor", ...args], {
      cwd: repoRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 4
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("doctor passes a valid single skill directory with the plan §12 terminal shape", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": GOOD_SKILL });
  const { code, stdout } = await runDoctorCli([path.join(workspace, "skills", "sample-skill")]);

  assert.equal(code, 0);
  assert.match(stdout, /^Packsmith Doctor\n/);
  assert.match(stdout, /sample-skill\n/);
  assert.match(stdout, /✓ Agent Skills specification/);
  assert.match(stdout, /✓ Claude Code/);
  assert.match(stdout, /✓ Codex/);
  assert.match(stdout, /0 warnings · 0 errors/);
  assert.match(stdout, /\nPASS\n?$/);
});

test("doctor diagnoses a workspace of skills and reports per-skill sections", async (t) => {
  const workspace = await createWorkspace(t, {
    "sample-skill": GOOD_SKILL,
    "second-skill": GOOD_SKILL.replace(/name: sample-skill/, "name: second-skill")
  });
  const { code, stdout } = await runDoctorCli([workspace]);

  assert.equal(code, 0);
  assert.match(stdout, /sample-skill/);
  assert.match(stdout, /second-skill/);
  assert.equal(stdout.match(/✓ Agent Skills specification/g)?.length, 2);
});

test("doctor --format json prints exactly one parseable object with the plan §12 fields", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": GOOD_SKILL });
  const { code, stdout } = await runDoctorCli([workspace, "--format", "json"]);

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout); // throws when stdout carries any other line
  assert.deepEqual(Object.keys(parsed), ["status", "skills", "errors", "warnings", "diagnostics"]);
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.skills, 1);
  assert.equal(parsed.errors, 0);
  assert.equal(parsed.warnings, 0);
  assert.deepEqual(parsed.diagnostics, []);
});

test("doctor fails a broken skill with exit code 1 and the expected rule ids", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": BROKEN_SKILL });

  const terminal = await runDoctorCli([path.join(workspace, "skills", "sample-skill")]);
  assert.equal(terminal.code, 1);
  assert.match(terminal.stdout, /ERROR PS-SPEC-007/);
  assert.match(terminal.stdout, /SKILL\.md:2/);
  assert.match(terminal.stdout, /✗ Agent Skills specification/);
  assert.match(terminal.stdout, /WARNING PS-SEC-003/);
  assert.match(terminal.stdout, /1 warning · 1 error/);
  assert.match(terminal.stdout, /\nFAIL\n?$/);

  const json = await runDoctorCli([workspace, "--format", "json"]);
  assert.equal(json.code, 1);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.errors, 1);
  const ids = parsed.diagnostics.map((diagnostic) => diagnostic.id);
  assert.ok(ids.includes("PS-SPEC-007"));
  assert.ok(ids.includes("PS-SEC-003"));
  const specDiagnostic = parsed.diagnostics.find((diagnostic) => diagnostic.id === "PS-SPEC-007");
  assert.equal(specDiagnostic.file, "skills/sample-skill/SKILL.md");
  assert.equal(specDiagnostic.line, 2);
  assert.deepEqual(specDiagnostic.evidence, ["agent-skills-spec"]);
});

test("doctor --target codex narrows the runtime view", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": GOOD_SKILL });
  const { code, stdout } = await runDoctorCli([workspace, "--target", "codex"]);

  assert.equal(code, 0);
  assert.match(stdout, /✓ Codex/);
  assert.doesNotMatch(stdout, /Claude Code/);
});

test("doctor rejects unknown targets and missing paths with exit code 2", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": GOOD_SKILL });

  const unknownTarget = await runDoctorCli([workspace, "--target", "not-a-runtime"]);
  assert.equal(unknownTarget.code, 2);
  assert.match(unknownTarget.stderr, /Unknown doctor target runtime/);

  const missingPath = await runDoctorCli([path.join(workspace, "nope")]);
  assert.equal(missingPath.code, 2);
  assert.match(missingPath.stderr, /Doctor target does not exist/);
});

test("doctor reports a workspace without any skill as a validation failure", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-cli-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const { code, stdout } = await runDoctorCli([tempRoot]);

  assert.equal(code, 1);
  assert.match(stdout, /PS-SPEC-001/);
  assert.match(stdout, /No skill directory was found under/);
  assert.match(stdout, /FAIL/);
});

test("doctor --format json keeps stdout machine-parsable on warnings", async (t) => {
  const workspace = await createWorkspace(t, { "sample-skill": GOOD_SKILL.replace(/description: .*/, "description: Short.") });
  const { code, stdout } = await runDoctorCli([workspace, "--format", "json"]);

  assert.equal(code, 0); // warnings never fail the gate
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.warnings >= 1, true);
  assert.ok(parsed.diagnostics.every((diagnostic) => diagnostic.severity === "warning"));
});
