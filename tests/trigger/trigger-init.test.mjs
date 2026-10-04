import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Offline CLI regressions for `packsmith trigger init` (v0.2 Milestone 5,
 * plan §13). Temp fixtures only; no network, no credentials, no model calls.
 *
 * Contract (mirror of the doctor JSON contract):
 *   exit 0  = suite created;
 *   exit 1  = Skill/workspace validation failure (existing suite refused —
 *             never silently overwritten; target without SKILL.md);
 *   exit 2  = usage mistakes and infrastructure faults, with the stable
 *             error envelope on stdout whenever an explicit JSON intent
 *             (--json / --format json / --format=json) is present.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");
const loaderPath = path.join(repoRoot, "tests", "fixtures", "doctor-fault-loader.mjs");

const SKILL_BODY = `---
name: review-pr
description: Reviews pull requests for security and correctness risks whenever the user asks for a review pass.
---

# Review PR

Read the diff and rank findings by severity.
`;

async function makeSkill(t, name = "review-pr") {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-trigger-init-"));
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL_BODY, "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, skillDir };
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function parseJsonOutput(result, step) {
  assert.notEqual(result.status, null, `${step}: CLI process crashed: ${result.stderr}`);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `${step}: stdout is not a single parseable JSON document: ${result.stdout.slice(0, 200)}`);
  return parsed;
}

test("trigger init creates evals/triggers.json with a valid bilingual starter suite", async (t) => {
  const { skillDir } = await makeSkill(t);

  const result = runCli(["trigger", "init", skillDir]);

  assert.equal(result.status, 0, `init failed: ${result.stdout}\n${result.stderr}`);
  const suitePath = path.join(skillDir, "evals", "triggers.json");
  const raw = await readFile(suitePath, "utf8");
  const suite = JSON.parse(raw);

  assert.equal(suite.schemaVersion, 1);
  assert.equal(suite.skill, "review-pr");
  assert.equal(suite.cases.length, 4);
  assert.ok(suite.cases.every((entry) => ["trigger", "no-trigger"].includes(entry.expect)));
  assert.ok(suite.cases.some((entry) => /[\u4e00-\u9fff]/.test(entry.prompt)), "starter includes CJK prompts");
  // The file itself is UTF-8 round-trip safe (the CJK starter prompt survives
  // the write and the read).
  assert.ok(raw.includes("用中文描述"));
});

test("trigger init --format json prints a stable created result", async (t) => {
  const { skillDir } = await makeSkill(t, "json-skill");

  const result = runCli(["trigger", "init", skillDir, "--format", "json"]);

  assert.equal(result.status, 0);
  const parsed = parseJsonOutput(result, "created");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.status, "created");
  assert.equal(parsed.skill, "json-skill");
  assert.equal(parsed.cases, 4);
});

test("re-running trigger init refuses and never overwrites the existing suite", async (t) => {
  const { skillDir } = await makeSkill(t);
  runCli(["trigger", "init", skillDir]);
  const suitePath = path.join(skillDir, "evals", "triggers.json");
  const before = await readFile(suitePath, "utf8");

  const result = runCli(["trigger", "init", skillDir]);

  assert.equal(result.status, 1, `expected refusal exit 1, got: ${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(suitePath, "utf8"), before, "existing suite must be byte-identical after refusal");

  // JSON intent reports the refusal through the standard result shape, not
  // an error envelope: a refused init is a workspace-state problem (exit 1).
  const jsonResult = runCli(["trigger", "init", skillDir, "--format", "json"]);
  assert.equal(jsonResult.status, 1);
  const parsed = parseJsonOutput(jsonResult, "exists");
  assert.equal(parsed.status, "exists");
});

test("a target directory without SKILL.md is a validation failure (exit 1)", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-trigger-init-"));
  const plainDir = path.join(root, "not-a-skill");
  await mkdir(plainDir, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  const textResult = runCli(["trigger", "init", plainDir]);
  assert.equal(textResult.status, 1);

  const jsonResult = runCli(["trigger", "init", plainDir, "--format", "json"]);
  assert.equal(jsonResult.status, 1);
  const parsed = parseJsonOutput(jsonResult, "invalid target");
  assert.equal(parsed.status, "invalid-target");
});

test("nonexistent target with --format json prints a usage envelope and exits 2", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-trigger-init-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = runCli(["trigger", "init", path.join(root, "missing"), "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "nonexistent target");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
  assert.equal(result.stderr.trim(), "");
});

test("missing <skill-dir> argument with --format json prints a usage envelope and exits 2", () => {
  const result = runCli(["trigger", "init", "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "missing argument");
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
});

test("unknown flag with --json prints a usage envelope and exits 2", async (t) => {
  const { skillDir } = await makeSkill(t);

  const result = runCli(["trigger", "init", skillDir, "--json", "--bogus"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "unknown flag");
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(result.stderr.trim(), "");
});

test("stat EACCES on the target skill is infrastructure, not a validation failure", async (t) => {
  const { skillDir } = await makeSkill(t);
  const loaderUrl = pathToFileURL(loaderPath).href;

  const result = spawnSync(
    process.execPath,
    ["--import", loaderUrl, cliPath, "trigger", "init", skillDir, "--format", "json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PACKSMITH_DOCTOR_FAULT_STAT: skillDir }
    }
  );

  assert.equal(result.status, 2, `expected exit 2, stdout: ${result.stdout.slice(0, 200)}`);
  const envelope = parseJsonOutput(result, "stat EACCES");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "infrastructure_error");
  assert.equal(envelope.error.exitCode, 2);
});

test("trigger subcommands other than init are usage errors", async (t) => {
  const result = runCli(["trigger", "run", "somewhere"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /trigger init/);
});

// ---------------------------------------------------------------------------
// Codex M5 reviewer findings: every trigger usage failure under an explicit
// JSON intent emits the single JSON envelope (stdout, exit 2, empty stderr),
// extra positionals are not silently ignored, --quiet is honored, and skill
// directories with spaces / CJK names work.
// ---------------------------------------------------------------------------

test("unknown trigger subcommand with --format json prints a usage envelope and exits 2", async (t) => {
  const { skillDir } = await makeSkill(t);

  const result = runCli(["trigger", "run", skillDir, "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "unknown subcommand");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(envelope.error.exitCode, 2);
  assert.equal(result.stderr.trim(), "");
});

test("bare trigger with --format=json prints a usage envelope and exits 2", () => {
  const result = runCli(["trigger", "--format=json"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "no subcommand");
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(result.stderr.trim(), "");
});

test("extra positional arguments are rejected without writing anything", async (t) => {
  const { skillDir } = await makeSkill(t);

  const result = runCli(["trigger", "init", skillDir, "extra", "--format", "json"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "extra positional");
  assert.equal(envelope.error.code, "usage_error");
  let evalsStat = null;
  try {
    evalsStat = await import("node:fs/promises").then((fs) => fs.stat(path.join(skillDir, "evals")));
  } catch {
    evalsStat = null;
  }
  assert.equal(evalsStat, null, "evals/ must not be created when the invocation is rejected");
});

test("a later non-json --format value keeps the earlier JSON intent as an envelope", async (t) => {
  const { skillDir } = await makeSkill(t);

  const result = runCli(["trigger", "init", skillDir, "--format=json", "--format=xml"]);

  assert.equal(result.status, 2);
  const envelope = parseJsonOutput(result, "repeated format");
  assert.equal(envelope.error.code, "usage_error");
  assert.equal(result.stderr.trim(), "");
});

test("--quiet suppresses text output but keeps the exit code", async (t) => {
  const { skillDir } = await makeSkill(t);

  const created = runCli(["trigger", "init", skillDir, "--quiet"]);
  assert.equal(created.status, 0);
  assert.equal(created.stdout.trim(), "", "--quiet must suppress the success line");

  const refused = runCli(["trigger", "init", skillDir, "--quiet"]);
  assert.equal(refused.status, 1);
  assert.equal(refused.stdout.trim(), "", "--quiet must suppress the refusal line");
});

test("skill directories with spaces and CJK names work", async (t) => {
  const { skillDir } = await makeSkill(t, "中文 技能");

  const result = runCli(["trigger", "init", skillDir, "--format", "json"]);

  assert.equal(result.status, 0, `init failed: ${result.stdout}\n${result.stderr}`);
  const parsed = parseJsonOutput(result, "cjk skill");
  assert.equal(parsed.status, "created");
  assert.equal(parsed.skill, "中文 技能");
  const suite = JSON.parse(await readFile(path.join(skillDir, "evals", "triggers.json"), "utf8"));
  assert.equal(suite.skill, "中文 技能");
});

// ---------------------------------------------------------------------------
// Codex M5 adversarial findings: the evals/ directory must never be a
// symlink/junction escaping the skill root, an author file appearing after
// the existence probe must never be overwritten (atomic exclusive create),
// and a failed partial write must leave no residue blocking later retries.
// ---------------------------------------------------------------------------

function runCliWithLoader(args, faultEnv) {
  return spawnSync(
    process.execPath,
    ["--import", pathToFileURL(loaderPath).href, cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ...faultEnv }
    }
  );
}

async function makeJunction(target, linkPath) {
  if (process.platform === "win32") {
    // mklink /J needs no administrator or developer-mode privilege, unlike
    // fs.symlink on locked-down Windows installs.
    const result = spawnSync("cmd.exe", ["/d", "/c", "mklink", "/J", linkPath, target], { encoding: "utf8" });
    if (result.status !== 0) {
      throw Object.assign(new Error(result.stderr.trim() || result.stdout.trim() || "mklink failed"), { code: "EPERM" });
    }
    return;
  }
  await symlink(target, linkPath, "dir");
}

test("an evals junction pointing outside the skill is refused and nothing is written outside", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const outsideDir = path.join(root, "outside");
  await mkdir(outsideDir, { recursive: true });
  try {
    await makeJunction(outsideDir, path.join(skillDir, "evals"));
  } catch (error) {
    t.skip(`junction creation unavailable on this platform (${error.code ?? error.message})`);
    return;
  }

  const result = runCli(["trigger", "init", skillDir, "--format", "json"]);

  assert.equal(result.status, 1, `expected refusal, stdout: ${result.stdout.slice(0, 200)}`);
  const parsed = parseJsonOutput(result, "junction escape");
  assert.equal(parsed.status, "invalid-target");
  assert.match(parsed.message, /evals/i);
  let escaped = true;
  try {
    await stat(path.join(outsideDir, "triggers.json"));
  } catch {
    escaped = false;
  }
  assert.equal(escaped, false, "triggers.json must not be written through the junction");
});

test("a dangling triggers.json symlink is refused, not followed", async (t) => {
  const { skillDir } = await makeSkill(t);
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  const suitePath = path.join(evalsDir, "triggers.json");
  const danglingTarget = path.join(evalsDir, "does-not-exist-yet.md");

  try {
    await symlink(danglingTarget, suitePath, "file");
  } catch (error) {
    t.skip(`symbolic link privilege unavailable on this platform (${error.code ?? error.message})`);
    return;
  }

  const result = runCli(["trigger", "init", skillDir, "--format", "json"]);

  assert.equal(result.status, 1);
  let parsed;
  parsed = parseJsonOutput(result, "dangling symlink");
  assert.ok(["exists", "invalid-target"].includes(parsed.status));
  // The dangling link target must not have been created through the link.
  let createdThroughLink = false;
  try {
    await stat(danglingTarget);
    createdThroughLink = true;
  } catch {
    createdThroughLink = false;
  }
  assert.equal(createdThroughLink, false, "wx must not create through a dangling symlink");
});

test("a suite file appearing after the existence probe is never overwritten (TOCTOU)", async (t) => {
  const { skillDir } = await makeSkill(t);
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  const suitePath = path.join(evalsDir, "triggers.json");
  const sentinel = "{\n  \"author\": \"sentinel that must survive\"\n}\n";
  await writeFile(suitePath, sentinel, "utf8");

  // lstat is forced to report ENOENT, so the implementation believes the
  // path is free; only an atomic exclusive create can save the sentinel.
  const result = runCliWithLoader(["trigger", "init", skillDir, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_LSTAT_MISSING: suitePath
  });

  assert.equal(result.status, 1, `expected refusal, stdout: ${result.stdout.slice(0, 300)}`);
  const parsed = parseJsonOutput(result, "TOCTOU");
  assert.equal(parsed.status, "exists");
  assert.equal(await readFile(suitePath, "utf8"), sentinel, "author content must be byte-identical");
});

test("a partial write is cleaned up and a retry succeeds", async (t) => {
  const { skillDir } = await makeSkill(t);
  const suitePath = path.join(skillDir, "evals", "triggers.json");

  const failed = runCliWithLoader(["trigger", "init", skillDir, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_WRITE_EIO: suitePath
  });

  assert.equal(failed.status, 2, `expected infrastructure exit 2, stdout: ${failed.stdout.slice(0, 300)}`);
  const envelope = parseJsonOutput(failed, "partial write");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "infrastructure_error");
  let residue = true;
  try {
    await stat(suitePath);
  } catch {
    residue = false;
  }
  assert.equal(residue, false, "the failed artifact must be removed, not left to block retries");

  const retry = runCli(["trigger", "init", skillDir, "--format", "json"]);
  assert.equal(retry.status, 0, `retry after cleanup failed: ${retry.stdout.slice(0, 200)}`);
  const suite = JSON.parse(await readFile(suitePath, "utf8"));
  assert.equal(suite.schemaVersion, 1);
});

// ---------------------------------------------------------------------------
// Codex round-2 integrity review: the evals/ directory must be re-verified
// AFTER mkdir (a junction can be planted inside the race window), the
// publish must be an atomic exclusive link — never a covering rename and
 // never an rm of the final path by ownership assumption — and temp-file
// cleanup failures must surface instead of being swallowed.
// ---------------------------------------------------------------------------

async function junctionCreationAvailable(dir) {
  try {
    await makeJunction(path.join(dir, "probe-target"), path.join(dir, "probe-junction"));
  } catch {
    return false;
  }
  await rm(path.join(dir, "probe-junction"), { force: true });
  return true;
}

test("a suite file really created inside the publish window wins the race", async (t) => {
  const { skillDir } = await makeSkill(t);
  const suitePath = path.join(skillDir, "evals", "triggers.json");

  // The loader hook creates the author file at the moment of publish, so
  // the implementation faces a genuine EEXIST backed by a real file. On the
  // older write-overwrite implementation this test failed (sentinel lost).
  const result = runCliWithLoader(["trigger", "init", skillDir, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_RACE_CREATE: suitePath
  });

  assert.equal(result.status, 1, `expected refusal, stdout: ${result.stdout.slice(0, 300)}`);
  const parsed = parseJsonOutput(result, "publish race");
  assert.equal(parsed.status, "exists");
  const sentinel = await readFile(suitePath, "utf8");
  assert.match(sentinel, /author/, "the author file created in the race window must survive");
  const evalsEntries = await readdir(path.join(skillDir, "evals"));
  assert.ok(evalsEntries.every((entry) => !entry.includes(".tmp-")), "no temp file residue may remain");
});

test("a junction planted inside the mkdir race window is rejected by the post-mkdir verification", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const outsideDir = path.join(root, "outside");
  await mkdir(outsideDir, { recursive: true });

  if (!(await junctionCreationAvailable(root))) {
    t.skip("junction creation unavailable on this platform");
    return;
  }

  const result = runCliWithLoader(["trigger", "init", skillDir, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_MKDIR_JUNCTION_SWAP: `${path.join(skillDir, "evals")}|${outsideDir}`
  });

  assert.equal(result.status, 1, `expected refusal, stdout: ${result.stdout.slice(0, 300)}`);
  const parsed = parseJsonOutput(result, "mkdir race");
  assert.equal(parsed.status, "invalid-target");
  let escaped = true;
  try {
    await stat(path.join(outsideDir, "triggers.json"));
  } catch {
    escaped = false;
  }
  assert.equal(escaped, false, "triggers.json must not be written through the raced junction");
});

test("a temp cleanup failure surfaces as infrastructure instead of being swallowed", async (t) => {
  const { skillDir } = await makeSkill(t);
  const suitePath = path.join(skillDir, "evals", "triggers.json");

  const result = runCliWithLoader(["trigger", "init", skillDir, "--format", "json"], {
    PACKSMITH_DOCTOR_FAULT_WRITE_EIO: suitePath,
    PACKSMITH_DOCTOR_FAULT_RM: suitePath
  });

  assert.equal(result.status, 2, `expected infrastructure exit 2, stdout: ${result.stdout.slice(0, 300)}`);
  const envelope = parseJsonOutput(result, "cleanup failure");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "infrastructure_error");
  assert.doesNotMatch(envelope.error.message, /was removed/i, "a failed cleanup must not claim the file was removed");
  assert.match(envelope.error.message, /could not remove|remains/i, "the message must disclose the leftover temp file");
});
