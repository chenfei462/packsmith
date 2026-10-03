#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline smoke test for `packsmith doctor` (v0.2 Milestone 4, plan §12).
 *
 * Zero dependencies, isolated temporary directories only, repeatable, no
 * network, no credentials, no model calls. The orchestration runs this
 * repeatedly; every failure prints a clear step name and exits 1.
 *
 * Verified:
 *   (a) a known-good example / fixture skill exits 0;
 *   (b) `--format json` stdout parses as JSON and contains the plan §12
 *       fields status/skills/errors/warnings/diagnostics;
 *   (c) a deliberately broken temp fixture exits 1 with the expected rule
 *       ids among the diagnostics;
 *   (d) `--target codex` works;
 *   (e) normal invocations never exit 2.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

const GOOD_SKILL = `---
name: smoke-good-skill
description: Reviews changes for security and correctness risks when the user asks for a review pass.
---

# Smoke Good Skill

Read the changed files, list findings, and rank them by severity.
`;

const BROKEN_SKILL = `---
name: name-does-not-match
description: Reviews changes for security and correctness risks when the user asks for a review pass.
---

Setup commands:

\`\`\`bash
sudo rm -rf /tmp/smoke-cache
\`\`\`
`;

function fail(step, message) {
  console.error(`SMOKE DOCTOR FAIL [${step}] ${message}`);
  process.exit(1);
}

function runDoctor(args) {
  const result = spawnSync(process.execPath, [cliPath, "doctor", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function assertEqual(step, actual, expected, description) {
  if (actual !== expected) {
    fail(step, `${description}: expected ${expected}, got ${actual}`);
  }
}

function assertMatch(step, text, pattern, description) {
  if (!pattern.test(text)) {
    fail(step, `${description}: expected /${pattern.source}/ in:\n${text.slice(0, 2000)}`);
  }
}

async function writeSkillTree(root, skills) {
  for (const [dirName, content] of Object.entries(skills)) {
    const skillDir = path.join(root, "skills", dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-doctor-"));

  try {
    await writeSkillTree(tempRoot, { "smoke-good-skill": GOOD_SKILL, "smoke-bad-skill": BROKEN_SKILL });
    const goodSkillDir = path.join(tempRoot, "skills", "smoke-good-skill");
    const goodWorkspace = path.join(tempRoot, "good-workspace");
    const badWorkspace = path.join(tempRoot, "bad-workspace");

    await mkdir(goodWorkspace, { recursive: true });
    await writeSkillTree(goodWorkspace, { "smoke-good-skill": GOOD_SKILL });
    await mkdir(badWorkspace, { recursive: true });
    await writeSkillTree(badWorkspace, { "smoke-bad-skill": BROKEN_SKILL });

    const exampleWorkspace = path.join(repoRoot, "examples", "research-launchpad");

    // (a) known-good example and fixture skill exit 0
    for (const [step, target] of [
      ["a-example", exampleWorkspace],
      ["a-fixture", goodSkillDir]
    ]) {
      const run = runDoctor([target]);
      assertEqual(step, run.exitCode, 0, "doctor on known-good skill must exit 0");
      assertMatch(step, run.stdout, /^Packsmith Doctor\n/, "terminal header");
      assertMatch(step, run.stdout, /\nPASS\n?$/, "terminal verdict PASS");
    }

    // (b) --format json prints exactly one parseable object with the plan §12 fields
    const jsonRun = runDoctor([exampleWorkspace, "--format", "json"]);
    assertEqual("b-json", jsonRun.exitCode, 0, "doctor --format json must exit 0");
    let parsed;
    try {
      parsed = JSON.parse(jsonRun.stdout);
    } catch (error) {
      fail("b-json", `stdout is not a single JSON object: ${error.message}\n${jsonRun.stdout.slice(0, 500)}`);
    }
    for (const field of ["status", "skills", "errors", "warnings", "diagnostics"]) {
      if (!Object.hasOwn(parsed, field)) {
        fail("b-json", `JSON output is missing required field "${field}"`);
      }
    }
    assertEqual("b-json", parsed.status, "pass", "example status");
    assertEqual("b-json", parsed.errors, 0, "example error count");
    if (!Array.isArray(parsed.diagnostics)) {
      fail("b-json", "diagnostics must be an array");
    }

    // (c) a deliberately broken fixture exits 1 with the expected rule ids
    const badRun = runDoctor([badWorkspace]);
    assertEqual("c-broken", badRun.exitCode, 1, "doctor on broken skill must exit 1");
    assertMatch("c-broken", badRun.stdout, /PS-SPEC-007/, "name/directory mismatch reported");
    assertMatch("c-broken", badRun.stdout, /PS-SEC-003/, "destructive shell pattern reported");
    assertMatch("c-broken", badRun.stdout, /\nFAIL\n?$/, "terminal verdict FAIL");
    const badJson = runDoctor([badWorkspace, "--format", "json"]);
    assertEqual("c-broken-json", badJson.exitCode, 1, "broken skill JSON run must exit 1");
    const badParsed = JSON.parse(badJson.stdout);
    const badIds = new Set(badParsed.diagnostics.map((diagnostic) => diagnostic.id));
    if (!badIds.has("PS-SPEC-007") || !badIds.has("PS-SEC-003")) {
      fail("c-broken-json", `expected PS-SPEC-007 and PS-SEC-003 among diagnostics, got: ${[...badIds].join(", ")}`);
    }

    // (d) --target codex narrows the runtime view and still passes
    const targetRun = runDoctor([goodWorkspace, "--target", "codex"]);
    assertEqual("d-target", targetRun.exitCode, 0, "doctor --target codex must exit 0");
    assertMatch("d-target", targetRun.stdout, /✓ Codex/, "codex section present");
    if (/Claude Code/.test(targetRun.stdout)) {
      fail("d-target", "codex view must not render the Claude Code section");
    }

    // (e) normal invocations never exit 2 (infrastructure failures are
    // reserved for Packsmith faults, plan §4.4/§8)
    for (const [step, args] of [
      ["e-no-infra-good", [goodWorkspace]],
      ["e-no-infra-bad", [badWorkspace]],
      ["e-no-infra-json", [goodWorkspace, "--format", "json"]],
      ["e-no-infra-target", [goodWorkspace, "--target", "cursor"]]
    ]) {
      const run = runDoctor(args);
      if (run.exitCode !== 0 && run.exitCode !== 1) {
        fail(step, `normal doctor run must exit 0 or 1, got ${run.exitCode} (stderr: ${run.stderr.slice(0, 300)})`);
      }
    }

    console.log("SMOKE DOCTOR PASS: doctor example/fixture/json/broken/target checks all succeeded");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`SMOKE DOCTOR FAIL [unexpected] ${error?.stack ?? error}`);
  process.exit(1);
});
