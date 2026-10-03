import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { runDoctor, DoctorInfrastructureError } from "../../src/doctor.mjs";

/**
 * Wave 1 acceptance regression (Codex report P2): every doctor failure path
 * under --format json must print ONE stable, parseable JSON envelope on
 * stdout and exit 2 — usage mistakes (unknown --target, nonexistent path,
 * bad --format, missing argument) and infrastructure faults alike. Skill
 * findings stay exit 0/1 and keep the plan §12 shape.
 *
 * Offline: the CLI is spawned against temp fixtures only; no network, no
 * credentials, no model calls.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

const VALID_SKILL = `---
name: valid
description: Reviews changes for risk when the user asks for a review pass.
---

# Valid

Read the change and rank the findings by severity.
`;

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function parseEnvelope(result, step) {
  assert.notEqual(result.status, null, `${step}: CLI process crashed: ${result.stderr}`);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `${step}: stdout is not a single parseable JSON document: ${result.stdout.slice(0, 200)}`);
  return parsed;
}

test("unknown --target with --format json prints an error envelope and exits 2", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = runCli(["doctor", root, "--target", "unknown-runtime", "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseEnvelope(result, "unknown target");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
  assert.equal(typeof envelope.error.message, "string");
  assert.ok(envelope.error.message.length > 0);
});

test("nonexistent target path with --format json prints an error envelope and exits 2", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = runCli(["doctor", path.join(root, "does-not-exist"), "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseEnvelope(result, "nonexistent path");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
});

test("unsupported --format value still exits 2 as a usage error", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = runCli(["doctor", root, "--format", "yaml"]);

  assert.equal(result.status, 2);
});

test("missing <path> argument with --format json prints an error envelope and exits 2", () => {
  const result = runCli(["doctor", "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseEnvelope(result, "missing argument");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
});

test("successful doctor --format json keeps the plan §12 shape and exit 0", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-env-"));
  const skillDir = path.join(root, "valid");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL, "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = runCli(["doctor", root, "--format", "json"]);

  assert.equal(result.status, 0);
  const parsed = parseEnvelope(result, "success");
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.skills, 1);
  assert.equal(parsed.errors, 0);
  assert.ok(Array.isArray(parsed.diagnostics));
});

test("runDoctor throws an infrastructure error for a broken knowledge base", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-env-"));
  const brokenKb = await mkdtemp(path.join(os.tmpdir(), "packsmith-broken-kb-"));
  await writeFile(path.join(brokenKb, "manifest.json"), "{}", "utf8");
  t.after(async () => {
    await rm(fixture, { recursive: true, force: true });
    await rm(brokenKb, { recursive: true, force: true });
  });

  await assert.rejects(
    () => runDoctor({ targetPath: fixture, knowledgeBaseRoot: brokenKb }),
    (error) => error instanceof DoctorInfrastructureError && error.isInfrastructureError === true
  );
});
