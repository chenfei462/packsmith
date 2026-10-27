#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Offline smoke for the runtime adapter layer (v0.2 Milestone 6, plan
 * §14–16). Drives the adapters end-to-end against the local mock CLI —
 * no model, no network, no credentials, isolated temp directories only,
 * repeatable, exits 0/1.
 *
 * Verified:
 *   (a) codex live run: triggered and not_triggered through the mock CLI,
 *       raw trace retained;
 *   (b) claude-code live run: triggered through the mock CLI;
 *   (c) timeout classification with partial trace;
 *   (d) static runtimes (cursor) report unsupported;
 *   (e) the explicit-context contract rejects a missing isolation field.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mockCli = path.join(repoRoot, "tests", "fixtures", "mock-runtime-cli.mjs");
const fixturesDir = path.join(repoRoot, "tests", "fixtures", "runtime-traces");

function fail(step, message) {
  console.error(`SMOKE RUNTIMES FAIL [${step}] ${message}`);
  process.exit(1);
}

function importSpecifier(target) {
  return JSON.stringify(pathToFileURL(target).href);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-runtimes-"));

try {
  // The adapters run inside a child process so the smoke also proves the
  // modules load and execute in a fresh interpreter.
  const harnessSource = `
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { codexAdapter } from ${importSpecifier(path.join(repoRoot, "src", "runtimes", "codex.mjs"))};
import { claudeCodeAdapter } from ${importSpecifier(path.join(repoRoot, "src", "runtimes", "claude-code.mjs"))};
import { cursorAdapter } from ${importSpecifier(path.join(repoRoot, "src", "runtimes", "cursor.mjs"))};

const workspaceDir = ${JSON.stringify(path.join(tempRoot, "ws"))};
const traceDir = ${JSON.stringify(path.join(tempRoot, "runs"))};
await mkdir(path.dirname(path.join(workspaceDir, ".agents", "skills", "review-pr", "SKILL.md")), { recursive: true });

async function contextFixture(fixtureName) {
  const raw = await readFile(${JSON.stringify(fixturesDir)} + "/" + fixtureName, "utf8");
  const rewritten = raw.trimEnd().split("\\n").map((line) => {
    const event = JSON.parse(line);
    if (event.item?.command !== undefined) {
      event.item.command = event.item.command.split("C:\\\\ws").join(workspaceDir);
    }
    return JSON.stringify(event);
  }).join("\\n") + "\\n";
  const trace = path.join(traceDir, fixtureName + ".mock.jsonl");
  await mkdir(traceDir, { recursive: true });
  await writeFile(trace, rewritten, "utf8");
  return trace;
}

function context(traceFile, envOverrides = {}, overrides = {}) {
  return {
    workspaceDir,
    traceDir,
    homeDir: ${JSON.stringify(path.join(tempRoot, "home"))},
    runtimeStateDir: ${JSON.stringify(path.join(tempRoot, "state"))},
    tempDir: ${JSON.stringify(path.join(tempRoot, "tmp"))},
    timeoutMs: 30000,
    binaryPath: process.execPath,
    binaryArgs: [${JSON.stringify(mockCli)}],
    env: { MOCK_TRACE: traceFile, ...envOverrides },
    ...overrides
  };
}

const results = {};

const codexTriggered = await codexAdapter.runTriggerCase({
  skill: "review-pr",
  prompt: "Review the PR.",
  context: context(await contextFixture("codex-triggered.jsonl"))
});
results.codexTriggered = codexTriggered.status;
results.codexTriggeredTrace = (await readFile(path.join(traceDir, "events.jsonl"), "utf8")).includes("command_execution");

const codexNotTriggered = await codexAdapter.runTriggerCase({
  skill: "review-pr",
  prompt: "Review the PR.",
  context: context(await contextFixture("codex-not-triggered.jsonl"))
});
results.codexNotTriggered = codexNotTriggered.status;

const claudeTriggered = await claudeCodeAdapter.runTriggerCase({
  skill: "review-pr",
  prompt: "Review the PR.",
  context: context(await contextFixture("claude-triggered.jsonl"))
});
results.claudeTriggered = claudeTriggered.status;

const timedOut = await claudeCodeAdapter.runTriggerCase({
  skill: "review-pr",
  prompt: "p",
  context: context("missing-trace.jsonl", { MOCK_DELAY_MS: "15000" }, { timeoutMs: 400 })
});
results.timeout = timedOut.status;
results.timeoutEnvDump = timedOut.evidence.map((e) => e.detail.slice(0, 120)).join(" | ");
results.timeoutEvidence = JSON.stringify(timedOut.evidence);
results.timeoutPartial = timedOut.partial;

results.cursorUnsupported = (await cursorAdapter.runTriggerCase({
  skill: "review-pr",
  prompt: "p",
  context: context("codex-triggered.jsonl")
})).status;

results.contractRejected = await (async () => {
  try {
    await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context: { workspaceDir } });
    return false;
  } catch (error) {
    return error.isContractError === true;
  }
})();

console.log(JSON.stringify(results));
`;

  const harnessPath = path.join(tempRoot, "smoke-adapter-harness.mjs");
  await writeFile(harnessPath, harnessSource, "utf8");
  const spawned = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 60000 });

  if (spawned.error || spawned.status !== 0) {
    fail("adapter harness", `exit ${spawned.status}: ${spawned.stdout.slice(0, 300)} ${spawned.stderr.slice(0, 300)}`);
  }

  let results;
  try {
    results = JSON.parse(spawned.stdout);
  } catch {
    fail("adapter harness", `stdout not JSON: ${spawned.stdout.slice(0, 200)}`);
  }

  const expectations = {
    codexTriggered: "triggered",
    codexTriggeredTrace: true,
    codexNotTriggered: "not_triggered",
    claudeTriggered: "triggered",
    timeout: "timeout",
    timeoutPartial: true,
    cursorUnsupported: "unsupported",
    contractRejected: true
  };

  for (const [key, expected] of Object.entries(expectations)) {
    if (results[key] !== expected) {
      fail(key, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(results[key])}`);
    }
  }

  console.log("SMOKE RUNTIMES: PASS (codex live ×2, claude live, timeout+partial, static unsupported, explicit-context contract)");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
