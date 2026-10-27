import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import {
  TRIGGER_STATUSES,
  RUNTIME_IDS,
  LIVE_RUNTIME_IDS,
  buildTriggerResult,
  requireTriggerContext,
  buildChildEnv,
  adapterContract
} from "../../src/runtimes/base.mjs";

/**
 * Runtime adapter base contract tests (v0.2 Milestone 6, plan §14).
 *
 * The six trigger statuses are the ONLY execution states (plan §13/§14);
 * infrastructure failures are represented, never folded into
 * not_triggered (plan §4.4). The trigger context must be EXPLICIT — a
 * missing isolation context is a caller bug, never a silent global run
 * (M7 supplies genuinely isolated directories; M6 only enforces the shape).
 */

test("the six trigger statuses and runtime id sets follow the plan", () => {
  assert.deepEqual([...TRIGGER_STATUSES], [
    "triggered",
    "not_triggered",
    "ambiguous",
    "infra_error",
    "timeout",
    "unsupported"
  ]);
  assert.deepEqual([...RUNTIME_IDS].sort(), ["claude-code", "codex", "cursor", "gemini-cli", "opencode"]);
  assert.deepEqual([...LIVE_RUNTIME_IDS].sort(), ["claude-code", "codex"]);
});

test("buildTriggerResult produces the normalized plan §14 shape", () => {
  const result = buildTriggerResult({
    status: "triggered",
    runtime: "codex",
    runtimeVersion: "codex-cli 0.148.0",
    durationMs: 4321,
    evidence: [{ kind: "command-execution", detail: "type SKILL.md" }],
    tracePath: "C:\\runs\\events.jsonl"
  });

  assert.deepEqual(
    { ...result, evidence: result.evidence.map((entry) => ({ ...entry })) },
    {
      status: "triggered",
      runtime: "codex",
      runtimeVersion: "codex-cli 0.148.0",
      durationMs: 4321,
      evidence: [{ kind: "command-execution", detail: "type SKILL.md" }],
      tracePath: "C:\\runs\\events.jsonl",
      partial: false
    }
  );
});

test("buildTriggerResult rejects unknown statuses, runtimes and evidence shapes", () => {
  assert.throws(() => buildTriggerResult({ status: "passed", runtime: "codex" }));
  assert.throws(() => buildTriggerResult({ status: "triggered", runtime: "vscode" }));
  assert.throws(() => buildTriggerResult({ status: "triggered", runtime: "codex", evidence: ["not-an-object"] }));
});

test("requireTriggerContext demands every explicit isolation field", () => {
  assert.throws(
    () => requireTriggerContext({ workspaceDir: "C:\\ws" }),
    (error) => /workspaceDir|homeDir|runtimeStateDir|tempDir|traceDir|timeoutMs/.test(error.message)
  );

  const context = requireTriggerContext({
    workspaceDir: path.join(os.tmpdir(), "ws"),
    traceDir: path.join(os.tmpdir(), "runs"),
    homeDir: path.join(os.tmpdir(), "home"),
    runtimeStateDir: path.join(os.tmpdir(), "state"),
    tempDir: path.join(os.tmpdir(), "tmp"),
    timeoutMs: 1000
  });
  assert.equal(context.workspaceDir, path.join(os.tmpdir(), "ws"));
  assert.equal(context.timeoutMs, 1000);
});

test("isolation paths must be non-empty absolute paths — no fallback to the real project", () => {
  const base = { workspaceDir: "C:\\ws", traceDir: "C:\\runs", homeDir: "C:\\home", runtimeStateDir: "C:\\state", tempDir: "C:\\tmp", timeoutMs: 1000 };

  assert.throws(
    () => requireTriggerContext({ ...base, workspaceDir: "" }),
    (error) => /non-empty absolute/.test(error.message)
  );
  assert.throws(
    () => requireTriggerContext({ ...base, workspaceDir: "relative/ws" }),
    (error) => /non-empty absolute/.test(error.message)
  );
  assert.throws(
    () => requireTriggerContext({ ...base, homeDir: "" }),
    (error) => /non-empty absolute/.test(error.message)
  );
});

test("buildChildEnv drops parent session identity and sets explicit isolation dirs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-env-"));
  const context = {
    workspaceDir: path.join(root, "ws"),
    traceDir: path.join(root, "runs"),
    homeDir: path.join(root, "home"),
    runtimeStateDir: path.join(root, "state"),
    tempDir: path.join(root, "tmp"),
    timeoutMs: 1000
  };

  const env = buildChildEnv(
    {
      PATH: "C:\\Windows\\system32",
      CODEX_THREAD_ID: "parent-thread",
      CODEX_SESSION_ID: "parent-session",
      CODEX_APP_TOOLS_PIPE_PATH: "\\\\.\\pipe\\parent",
      CODEX_HOME: "C:\\users\\real\\.codex",
      CLAUDE_CONFIG_DIR: "C:\\users\\real\\.claude",
      ANTHROPIC_API_KEY: "sk-parent-anthropic-sentinel",
      OPENAI_API_KEY: "sk-parent-openai-sentinel",
      ANTHROPIC_BASE_URL: "https://parent-endpoint.example"
    },
    context
  );

  assert.equal(env.CODEX_THREAD_ID, undefined, "parent session identity must not leak into the child");
  assert.equal(env.CODEX_SESSION_ID, undefined);
  assert.equal(env.CODEX_APP_TOOLS_PIPE_PATH, undefined, "parent app pipe must not leak");
  assert.equal(env.ANTHROPIC_API_KEY, undefined, "parent credentials must not be inherited wholesale");
  assert.equal(env.OPENAI_API_KEY, undefined, "parent credentials must not be inherited wholesale");
  assert.equal(env.ANTHROPIC_BASE_URL, undefined, "parent endpoint config is not inherited by default");
  assert.equal(env.CODEX_HOME, context.runtimeStateDir, "runtime state dir is set explicitly from the context");
  assert.equal(env.CLAUDE_CONFIG_DIR, context.runtimeStateDir);
  assert.equal(env.HOME, context.homeDir);
  assert.equal(env.USERPROFILE, context.homeDir);
  assert.equal(env.TMP, context.tempDir);
  assert.equal(env.TEMP, context.tempDir);
  assert.equal(env.PATH, "C:\\Windows\\system32", "ordinary system environment is preserved");
});

test("context.env cannot override isolation dirs or smuggle session identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-runtime-env2-"));
  const context = {
    workspaceDir: path.join(root, "ws"),
    traceDir: path.join(root, "runs"),
    homeDir: path.join(root, "home"),
    runtimeStateDir: path.join(root, "state"),
    tempDir: path.join(root, "tmp"),
    timeoutMs: 1000,
    env: {
      CODEX_SESSION_ID: "smuggled-session",
      HOME: "C:\\smuggled-home",
      ANTHROPIC_API_KEY: "smuggled-key",
      PACKSMITH_TEST_MARKER: "allowed"
    }
  };

  const env = buildChildEnv({ PATH: "system" }, context);

  assert.equal(env.CODEX_SESSION_ID, undefined, "session identity cannot be smuggled through context.env");
  assert.equal(env.ANTHROPIC_API_KEY, undefined, "credentials cannot be smuggled through context.env");
  assert.equal(env.HOME, context.homeDir, "isolation home cannot be overridden by context.env");
  assert.equal(env.PACKSMITH_TEST_MARKER, "allowed", "ordinary extra env entries are honored");
});

test("adapterContract validates the plan §14 method set", () => {
  assert.doesNotThrow(() =>
    adapterContract({
      id: "codex",
      detect: () => {},
      version: () => {},
      capabilities: () => {},
      prepareWorkspace: () => {},
      runTriggerCase: () => {},
      parseTrace: () => {}
    })
  );
  assert.throws(() => adapterContract({ id: "codex" }), (error) => /runTriggerCase|parseTrace|detect/.test(error.message));
  assert.throws(() => adapterContract({ id: "not-a-runtime", detect() {}, version() {}, capabilities() {}, prepareWorkspace() {}, runTriggerCase() {}, parseTrace() {} }));
});
