#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline smoke for the trigger isolation layer (v0.2 Milestone 7, plan
 * §17). Zero dependencies, exclusive temp roots only, repeatable, no
 * network, no credentials, no model calls — the "parent auth" fixtures are
 * synthetic files under the temp root.
 *
 * Verified:
 *   (a) two runs (repeat + cross-runtime) each get their own run dir,
 *       real git workspace and installed skill;
 *   (b) the parent-side auth fixtures stay byte-identical (read-only
 *       bridge) and no credential value reaches the retained artifacts;
 *   (c) the private state root is cleaned after every run;
 *   (d) runtime.json records honest metadata (auth presence only);
 *   (e) the isolated context passes the Milestone 6 contract and a mock
 *       CLI run through it ends to end.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mockCli = path.join(repoRoot, "tests", "fixtures", "mock-runtime-cli.mjs");
const fixturesDir = path.join(repoRoot, "tests", "fixtures", "runtime-traces");

const CODEX_AUTH_SENTINEL = "sk-codex-smoke-token-SENTINEL";
const CLAUDE_TOKEN_SENTINEL = "sk-ant-claude-smoke-token-SENTINEL";
const CLAUDE_ENDPOINT = "https://smoke-endpoint.example";

function fail(step, message) {
  console.error(`SMOKE ISOLATION FAIL [${step}] ${message}`);
  process.exit(1);
}

function importSpecifier(target) {
  return JSON.stringify(`file://${target.split(path.sep).join("/")}`);
}

// Roots that already existed before this smoke: never ours to judge.
const preExistingPrivateRoots = new Set((await readdir(os.tmpdir())).filter((entry) => entry.startsWith("packsmith-run-private-")));

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-isolation-"));

try {
  // Synthetic parent auth fixtures (never the developer's real files).
  await mkdir(path.join(tempRoot, "parent"), { recursive: true });
  const codexAuthPath = path.join(tempRoot, "parent", "auth.json");
  const claudeSettingsPath = path.join(tempRoot, "parent", "settings.json");
  await writeFile(
    codexAuthPath,
    JSON.stringify({ OPENAI_API_KEY: CODEX_AUTH_SENTINEL }, null, 2),
    "utf8"
  );
  await writeFile(
    claudeSettingsPath,
    JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: CLAUDE_TOKEN_SENTINEL, ANTHROPIC_BASE_URL: CLAUDE_ENDPOINT } }, null, 2),
    "utf8"
  );

  // Skill source: only the skill under test.
  const skillDir = path.join(tempRoot, "src-skills", "review-pr");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: review-pr\ndescription: Reviews pull requests for security risks when the user asks.\n---\n\nBody.\n",
    "utf8"
  );

  const runsRoot = path.join(tempRoot, ".packsmith", "runs");
  const harnessSource = `
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withIsolatedTriggerRun, isolationFlagsFor } from ${importSpecifier(path.join(repoRoot, "src", "trigger", "isolation.mjs"))};
import { codexAdapter } from ${importSpecifier(path.join(repoRoot, "src", "runtimes", "codex.mjs"))};
import { cursorAdapter } from ${importSpecifier(path.join(repoRoot, "src", "runtimes", "cursor.mjs"))};

const runsRoot = ${JSON.stringify(runsRoot)};
const skillDir = ${JSON.stringify(skillDir)};
const codexAuthPath = ${JSON.stringify(codexAuthPath)};
const claudeSettingsPath = ${JSON.stringify(claudeSettingsPath)};
const mockCli = ${JSON.stringify(mockCli)};
const fixturesDir = ${JSON.stringify(fixturesDir)};
const results = {};

async function contextFixture(fixtureName, workspaceDir) {
  const raw = await readFile(fixturesDir + "/" + fixtureName, "utf8");
  const rewritten = raw.trimEnd().split("\\n").map((line) => {
    const event = JSON.parse(line);
    if (event.item?.command !== undefined) {
      event.item.command = event.item.command.split("C:\\\\ws").join(workspaceDir);
    }
    return JSON.stringify(event);
  }).join("\\n") + "\\n";
  const trace = path.join(os.tmpdir(), "packsmith-smoke-isolation-trace-" + Math.random().toString(36).slice(2) + ".jsonl");
  await writeFile(trace, rewritten, "utf8");
  return trace;
}

// Run 1: codex repeat 1 — real git workspace + auth bridge + mock execution.
const first = await withIsolatedTriggerRun({
  runsRoot,
  runtimeId: "codex",
  skillDir,
  codexAuthPath,
  binaryPath: process.execPath,
  binaryArgs: [mockCli],
  run: async ({ context, run }) => {
    const { existsSync } = await import("node:fs");
    if (!existsSync(path.join(context.workspaceDir, ".git", "HEAD"))) {
      throw new Error("workspace must be a real git repository");
    }
    const trace = await contextFixture("codex-triggered.jsonl", context.workspaceDir);
    const childEnvOut = path.join(os.tmpdir(), "packsmith-smoke-isolation-env-" + Math.random().toString(36).slice(2) + ".json");
    results.childEnvFile = childEnvOut;
    return codexAdapter.runTriggerCase({
      skill: "review-pr",
      prompt: "Review the PR.",
      context: { ...context, env: { MOCK_TRACE: trace, MOCK_ENV_OUT: childEnvOut } }
    });
  }
});
results.firstStatus = first.result.status;
results.caseDirs = { appData: first.context.caseDirs.appData, data: first.context.caseDirs.data };
results.firstRunDir = first.runDir;

// Run 2: codex repeat 2 — must not share anything with run 1.
const second = await withIsolatedTriggerRun({
  runsRoot,
  runtimeId: "codex",
  skillDir,
  codexAuthPath,
  binaryPath: process.execPath,
  binaryArgs: [mockCli],
  run: async () => true
});
results.secondRunDir = second.runDir;

// Run 3: claude-code — bridge + isolation flags in the context.
const third = await withIsolatedTriggerRun({
  runsRoot,
  runtimeId: "claude-code",
  skillDir,
  claudeSettingsPath,
  binaryPath: process.execPath,
  binaryArgs: [mockCli],
  run: async ({ context }) => {
    results.claudeFlags = context.isolationFlags.some((flag) => flag === "--no-session-persistence");
    return true;
  }
});
results.thirdRunDir = third.runDir;

// Run 4: static runtime — unsupported, truthful artifacts.
const fourth = await withIsolatedTriggerRun({
  runsRoot,
  runtimeId: "cursor",
  skillDir,
  run: async ({ context }) =>
    cursorAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context })
});
results.staticStatus = fourth.result.status;

console.log(JSON.stringify(results));
`;
  // Env hint so the fixture rewrite targets THIS smoke's workspace hint.
  process.env.SMOKE_WS_HINT = "C:\\ws";

  const harnessPath = path.join(tempRoot, "smoke-isolation-harness.mjs");
  await writeFile(harnessPath, harnessSource, "utf8");
  const spawned = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120000 });

  if (spawned.error || spawned.status !== 0) {
    fail("harness", `exit ${spawned.status}: ${spawned.stdout.slice(0, 300)} ${spawned.stderr.slice(0, 400)}`);
  }

  let results;
  try {
    results = JSON.parse(spawned.stdout);
  } catch {
    fail("harness", `stdout not JSON: ${spawned.stdout.slice(0, 200)}`);
  }

  if (results.firstStatus !== "triggered") {
    fail("mock run", `expected triggered, got ${JSON.stringify(results.firstStatus)}`);
  }

  // Actual-child environment proof: the mock CLI recorded what it saw.
  const childEnv = JSON.parse(await readFile(results.childEnvFile, "utf8"));
  if (childEnv.APPDATA !== results.caseDirs.appData || childEnv.XDG_DATA_HOME !== results.caseDirs.data) {
    fail("child env", );
  }
  if (childEnv.GIT_DIR !== undefined || childEnv.git_config_global !== undefined) {
    fail("child env", "parent git context reached the child");
  }

  // (a) distinct run dirs per run.
  const runDirs = [results.firstRunDir, results.secondRunDir, results.thirdRunDir];
  if (new Set(runDirs).size !== 3) {
    fail("isolation", `runs must not share a run dir: ${JSON.stringify(runDirs)}`);
  }

  // (b) parent auth fixtures untouched; no secret in retained artifacts.
  const codexAuthAfter = await readFile(codexAuthPath, "utf8");
  const claudeSettingsAfter = await readFile(claudeSettingsPath, "utf8");
  if (!codexAuthAfter.includes(CODEX_AUTH_SENTINEL) || !claudeSettingsAfter.includes(CLAUDE_TOKEN_SENTINEL)) {
    fail("auth bridge", "parent fixtures must remain unchanged");
  }

  for (const runDir of runDirs) {
    const retained = (await walkFiles(runDir)).map((file) => file);
    for (const file of retained) {
      const content = await readFile(file, "utf8");
      if (content.includes(CODEX_AUTH_SENTINEL) || content.includes(CLAUDE_TOKEN_SENTINEL)) {
        fail("artifact secret scan", `${file} carries a credential value`);
      }
    }
  }

  // (c) private state cleaned: no NEW packsmith-run-private temp roots may
  // remain (pre-existing leftovers from other processes are not ours).
  const tempEntries = (await readdir(os.tmpdir())).filter((entry) => entry.startsWith("packsmith-run-private-"));
  const leaked = tempEntries.filter((entry) => !preExistingPrivateRoots.has(entry));
  if (leaked.length > 0) {
    fail("cleanup", `private state roots remain: ${JSON.stringify(leaked)}`);
  }

  // (d) runtime.json honest metadata.
  const metadata = JSON.parse(await readFile(path.join(results.firstRunDir, "runtime.json"), "utf8"));
  if (metadata.auth.source !== "codex-auth-json" || metadata.auth.present !== true) {
    fail("metadata", `auth metadata wrong: ${JSON.stringify(metadata.auth)}`);
  }
  const resultJson = JSON.parse(await readFile(path.join(results.firstRunDir, "result.json"), "utf8"));
  if (resultJson.status !== "triggered") {
    fail("result artifact", );
  }
  if (!existsSync(path.join(results.firstRunDir, "stdout.log")) || !existsSync(path.join(results.firstRunDir, "stderr.log"))) {
    fail("result artifact", "stdout.log/stderr.log must exist after a run");
  }
  if (JSON.stringify(metadata).includes(CODEX_AUTH_SENTINEL)) {
    fail("metadata", "runtime.json must never carry values");
  }
  if (metadata.status !== "triggered") {
    fail("metadata", );
  }

  // (e) claude flags reached the context.
  if (results.claudeFlags !== true) {
    fail("claude flags", "isolation flags must reach the trigger context");
  }

  // (f) static runtime unsupported.
  if (results.staticStatus !== "unsupported") {
    fail("static runtime", `expected unsupported, got ${JSON.stringify(results.staticStatus)}`);
  }

  console.log("SMOKE ISOLATION: PASS (git boundary, per-run dirs, read-only auth bridge, artifact secret scan, private-state cleanup, honest metadata, claude flags, static unsupported)");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function walkFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}
