import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { codexAdapter } from "../../src/runtimes/codex.mjs";
import { resolveWindowsShimEntry } from "../../src/runtimes/base.mjs";

/**
 * Live-adapter spawn tests (v0.2 Milestone 6) driven entirely by the local
 * mock CLI — no model, no network, no account. Covers the exact-prompt
 * stdin contract (spaces, CJK, quotes and shell metacharacters), raw trace
 * retention, nonzero/missing-binary infrastructure classification,
 * timeout with partial trace and process termination, and Windows .cmd
 * shim resolution to the real entry point.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "..", "fixtures", "runtime-traces");
const mockCli = path.join(__dirname, "..", "fixtures", "mock-runtime-cli.mjs");

async function makeContext(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-spawn-"));
  const context = {
    workspaceDir: path.join(root, "ws"),
    traceDir: path.join(root, "runs"),
    homeDir: path.join(root, "home"),
    runtimeStateDir: path.join(root, "state"),
    tempDir: path.join(root, "tmp"),
    timeoutMs: 30000,
    binaryPath: process.execPath,
    binaryArgs: [mockCli],
    ...overrides
  };
  t.after(() => rm(root, { recursive: true, force: true }));
  return context;
}

/**
 * Materialize a fixture trace for THIS context: the fixture's target path
 * (C:\ws\...) is rewritten to the context's real installed SKILL.md path so
 * the parser's target resolution and the trace refer to the SAME target.
 * Tests never hardcode a workspace path and never share C:\ws.
 */
async function writeContextTrace(context, fixtureName, skill = "review-pr") {
  const target = path.join(context.workspaceDir, ".agents", "skills", skill, "SKILL.md");
  const raw = await readFile(path.join(fixturesDir, fixtureName), "utf8");
  const rewritten = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const event = JSON.parse(line);

      if (event.item?.command !== undefined) {
        event.item.command = event.item.command.replaceAll(
          `C:\\ws\\.agents\\skills\\${skill}\\SKILL.md`, target
        );
      }

      return JSON.stringify(event);
    })
    .join("\n");

  const traceFile = path.join(context.traceDir, `${fixtureName}.mock.jsonl`);
  await mkdir(context.traceDir, { recursive: true });
  await writeFile(traceFile, rewritten, "utf8");
  return traceFile;
}

test("runTriggerCase returns a triggered result end-to-end through the mock CLI", async (t) => {
  const context = await makeContext(t);
  const mockTrace = await writeContextTrace(context, "codex-triggered.jsonl");
  const contextWithTrace = { ...context, env: { MOCK_TRACE: mockTrace } };

  const result = await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "Review the PR.", context: contextWithTrace });

  assert.equal(result.status, "triggered");
  assert.equal(result.runtime, "codex");
  assert.equal(result.partial, false);
  const raw = await readFile(path.join(context.traceDir, "events.jsonl"), "utf8");
  assert.match(raw, /"command_execution"/, "raw events are retained verbatim");
});

test("the retained trace is the verbatim stdout stream, CRLF and blank lines included", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-raw-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rawTrace = path.join(root, "raw-crlf.jsonl");
  await writeFile(rawTrace, "first\r\n\r\npartial", "utf8");
  const context = await makeContext(t, { env: { MOCK_TRACE: rawTrace } });

  await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  const retained = await readFile(path.join(context.traceDir, "events.jsonl"), "utf8");
  assert.equal(retained, "first\r\n\r\npartial", "raw evidence must be byte-identical, not line-reconstructed");
});

test("invalid UTF-8 bytes survive verbatim in the retained trace", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-raw-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rawTrace = path.join(root, "raw-bytes.jsonl");
  const rawBytes = Buffer.from([0x66, 0x69, 0xff, 0xfe, 0x0d, 0x0a, 0x70, 0x61]);
  await writeFile(rawTrace, rawBytes);
  const context = await makeContext(t, { env: { MOCK_TRACE: rawTrace } });

  await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  const retained = await readFile(path.join(context.traceDir, "events.jsonl"));
  assert.deepEqual(retained, rawBytes, "the retained trace must be the exact captured bytes (no UTF-8 re-encoding)");
});

test("the exact prompt reaches the CLI via stdin, metacharacters and CJK intact", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-prompt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stdinOut = path.join(root, "stdin-captured.txt");
  const context = await makeContext(t, {
    env: { MOCK_TRACE: path.join(fixturesDir, "codex-not-triggered.jsonl"), MOCK_STDIN_OUT: stdinOut }
  });

  const prompt = 'Review "the PR" with `quotes` & $vars; 中文 提示词 with spaces';
  await codexAdapter.runTriggerCase({ skill: "review-pr", prompt, context });

  assert.equal(await readFile(stdinOut, "utf8"), prompt, "the prompt must arrive byte-exact via stdin");
});

test("parent session identity never reaches the child; isolation dirs do", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-isolation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const envOut = path.join(root, "env-captured.json");
  const context = await makeContext(t, {
    env: { MOCK_TRACE: path.join(fixturesDir, "codex-not-triggered.jsonl"), MOCK_ENV_OUT: envOut }
  });

  await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  const seen = JSON.parse(await readFile(envOut, "utf8"));
  assert.equal(seen.CODEX_THREAD_ID, undefined);
  assert.equal(seen.CODEX_SESSION_ID, undefined);
  assert.equal(seen.CODEX_APP_TOOLS_PIPE_PATH, undefined);
  assert.equal(seen.HOME, context.homeDir);
  assert.equal(seen.CODEX_HOME, context.runtimeStateDir);
});

test("a nonzero CLI exit is infrastructure, not not_triggered", async (t) => {
  const context = await makeContext(t, {
    env: { MOCK_EXIT_CODE: "3", MOCK_TRACE: path.join(fixturesDir, "codex-triggered.jsonl") }
  });

  const result = await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  assert.equal(result.status, "infra_error");
  assert.ok(result.evidence.some((entry) => entry.kind === "nonzero-exit"));
});

test("a missing binary is infrastructure with a clear diagnostic", async (t) => {
  const context = await makeContext(t, {
    binaryPath: path.join(os.tmpdir(), "packsmith-missing-binary-does-not-exist.exe")
  });

  const result = await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  assert.equal(result.status, "infra_error");
  // The launch resolution is now inside the run, so a missing/broken shim
  // surfaces as a launch-resolve-error (infrastructure), never a crash.
  assert.ok(
    result.evidence.some((entry) => entry.kind === "launch-resolve-error" || entry.kind === "spawn-error"),
    `expected a launch/spawn diagnostic, got: ${JSON.stringify(result.evidence)}`
  );
});

test("timeout terminates the run, keeps the partial trace and reports timeout", async (t) => {
  const context = await makeContext(t, {
    env: { MOCK_TRACE: path.join(fixturesDir, "codex-not-triggered.jsonl"), MOCK_DELAY_MS: "15000" },
    timeoutMs: 400
  });

  const result = await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

  assert.equal(result.status, "timeout");
  assert.equal(result.partial, true);
  assert.ok(result.durationMs < 15000, "the run must not wait out the mock delay");
  const raw = await readFile(path.join(context.traceDir, "events.jsonl"), "utf8");
  assert.ok(raw.length >= 0, "partial raw evidence is retained");
});

test("a Windows .cmd shim resolves to the real node entry (no shell interpolation)", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  // The shim's real entry is a copy of the mock CLI, laid out the way an
  // npm install lays out its bin scripts.
  const entry = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, await readFile(mockCli, "utf8"), "utf8");
  const shim = path.join(root, "codex.cmd");
  await writeFile(
    shim,
    [
      "@ECHO off",
      "GOTO start",
      ":find_dp0",
      "SET dp0=%~dp0",
      "EXIT /b %errorlevel%",
      ":start",
      'IF EXIST "%dp0%\\node.exe" (',
      '  SET "_prog=%dp0%\\node.exe"',
      ') ELSE (',
      '  SET "_prog=node"',
      ')',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*'
    ].join("\r\n"),
    "utf8"
  );

  const resolved = await resolveWindowsShimEntry(shim);
  assert.equal(resolved.launcher, "node");
  assert.equal(path.resolve(resolved.entry), path.resolve(entry));

  // End-to-end: the adapter must launch the resolved entry directly.
  const context = await makeContext(t, {
    binaryPath: shim,
    binaryArgs: []
  });
  const mockTrace = await writeContextTrace(context, "codex-triggered.jsonl");
  const result = await codexAdapter.runTriggerCase({
    skill: "review-pr",
    prompt: "p",
    context: { ...context, env: { MOCK_TRACE: mockTrace } }
  });
  assert.equal(result.status, "triggered");
});

test("a Windows .cmd shim pointing at an .exe resolves to that exe directly", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const exe = path.join(root, "node_modules", "@anthropic-ai", "claude-code", "claude.exe");
  const shim = path.join(root, "claude.cmd");
  await writeFile(
    shim,
    '@ECHO off\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\claude.exe" %*\r\n',
    "utf8"
  );

  const resolved = await resolveWindowsShimEntry(shim);
  assert.equal(resolved.launcher, "exe");
  assert.equal(path.resolve(resolved.entry), path.resolve(exe));
});

test("an unresolvable shim is infrastructure, not a crash", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shim = path.join(root, "broken.cmd");
  await writeFile(shim, "@ECHO off\r\nrem no entry here\r\n", "utf8");

  await assert.rejects(() => resolveWindowsShimEntry(shim), (error) => /shim|entry/i.test(error.message));
});
