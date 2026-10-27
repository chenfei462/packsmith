import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Runtime adapter base (v0.2 Milestone 6, plan §14).
 *
 * The adapter contract is { id, detect, version, capabilities,
 * prepareWorkspace, runTriggerCase, parseTrace }. Only Claude Code and
 * Codex implement live trigger runs in v0.2 (plan §15); Cursor, Gemini CLI
 * and OpenCode are static-compatibility adapters.
 *
 * Execution states (plan §13/§14) — the ONLY outcomes a trigger run may
 * produce: triggered / not_triggered / ambiguous / infra_error / timeout /
 * unsupported. Hard requirement (plan §4.4): infrastructure failures are
 * never folded into not_triggered, and ambiguous/infra/timeout/unsupported
 * are reported separately from the TP/FP/TN/FN metrics (M8).
 *
 * The trigger context is EXPLICIT: callers must pass every isolation
 * location (Milestone 7 builds genuinely isolated workspace/home/state/
 * cache directories). A missing context is a caller bug, never a silent
 * global run. Child processes never inherit parent session identity
 * (CODEX_* / CLAUDE_* desktop bindings), never receive a shell string, and
 * always receive the prompt via stdin.
 */

/** The only allowed trigger-run outcomes (plan §13/§14). */
export const TRIGGER_STATUSES = Object.freeze([
  "triggered",
  "not_triggered",
  "ambiguous",
  "infra_error",
  "timeout",
  "unsupported"
]);

/** Runtimes Packsmith can take a view on (plan §9/§15). */
export const RUNTIME_IDS = Object.freeze(["claude-code", "codex", "cursor", "gemini-cli", "opencode"]);

/** Runtimes with live trigger runners in v0.2 (plan §15). */
export const LIVE_RUNTIME_IDS = Object.freeze(["claude-code", "codex"]);

/** Grace period after tree termination before a timed-out run is finished
 * forcibly with the partial evidence (a kill failure or a grandchild still
 * holding the pipes must never make the run wait forever). */
const KILL_GRACE_MS = 5000;

/** Raised when the CALLER violates the adapter contract — a bug, not a run
 * outcome (analogous to the doctor usage/infra split, but pre-run). */
export class RuntimeContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeContractError";
    this.isContractError = true;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEvidenceEntry(value) {
  return isPlainObject(value) && typeof value.kind === "string" && value.kind.length > 0;
}

/**
 * Build one validated, frozen normalized trigger result (plan §14 shape).
 * Keys are emitted in a fixed order so recorded JSON is stable for CI.
 */
export function buildTriggerResult({
  status,
  runtime,
  runtimeVersion = null,
  durationMs = null,
  evidence = [],
  tracePath = null,
  partial = false
} = {}) {
  if (!TRIGGER_STATUSES.includes(status)) {
    throw new RuntimeContractError(`trigger result status must be one of ${TRIGGER_STATUSES.join("|")}, got ${JSON.stringify(status)}`);
  }

  if (!RUNTIME_IDS.includes(runtime)) {
    throw new RuntimeContractError(`trigger result runtime must be one of ${RUNTIME_IDS.join("|")}, got ${JSON.stringify(runtime)}`);
  }

  if (!Array.isArray(evidence) || !evidence.every(isEvidenceEntry)) {
    throw new RuntimeContractError("trigger result evidence must be an array of { kind, detail } objects");
  }

  return Object.freeze({
    status,
    runtime,
    runtimeVersion: runtimeVersion ?? null,
    durationMs: durationMs ?? null,
    evidence: Object.freeze(evidence.map((entry) => Object.freeze({ ...entry }))),
    tracePath: tracePath ?? null,
    partial: partial === true
  });
}

/**
 * Validate the EXPLICIT trigger context. Every isolation field is required
 * — an absent location is a contract violation, never a reason to run
 * against the developer's real environment (plan §17; Milestone 7 supplies
 * genuinely isolated directories). `binaryPath`/`binaryArgs` override the
 * resolved CLI for tests and special installs; `env` carries extra child
 * environment entries (Milestone 7's minimal-auth bridge), never copied
 * credentials in artifacts.
 */
export function requireTriggerContext(context) {
  if (!isPlainObject(context)) {
    throw new RuntimeContractError("runTriggerCase requires an explicit trigger context object");
  }

  const required = ["workspaceDir", "traceDir", "homeDir", "runtimeStateDir", "tempDir", "timeoutMs"];
  const missing = required.filter((field) => context[field] === undefined || context[field] === null);

  if (missing.length > 0) {
    throw new RuntimeContractError(
      `trigger context is missing explicit isolation fields (Milestone 7 contract): ${missing.join(", ")}`
    );
  }

  // Every isolation location must be a non-empty ABSOLUTE path: an empty or
  // relative path would silently fall back to the developer's real project
  // or home — the exact failure an explicit context exists to prevent.
  const invalidPaths = required
    .filter((field) => field !== "timeoutMs")
    .filter((field) => typeof context[field] !== "string" || context[field].length === 0 || !path.isAbsolute(context[field]));

  if (invalidPaths.length > 0) {
    throw new RuntimeContractError(
      `trigger context isolation paths must be non-empty absolute paths: ${invalidPaths.join(", ")}`
    );
  }

  if (!Number.isFinite(context.timeoutMs) || context.timeoutMs <= 0) {
    throw new RuntimeContractError(`trigger context timeoutMs must be a positive number, got ${JSON.stringify(context.timeoutMs)}`);
  }

  if (context.env !== undefined && !isPlainObject(context.env)) {
    throw new RuntimeContractError("trigger context env must be an object when present");
  }

  return { ...context };
}

/** Environment namespaces and keys that must NEVER reach a child process
 * from the parent (session identity, desktop bindings, credentials, node
 * execution hooks). Matching is case-insensitive: Windows environment keys
 * are case-insensitive and lower-case variants would otherwise leak. */
const CHILD_ENV_DENIED_PREFIXES = ["CODEX_", "CLAUDE_", "ANTHROPIC_", "OPENAI_"];
const CHILD_ENV_DENIED_KEYS = new Set(["NODE_OPTIONS", "NODE_PATH"]);

function isDeniedEnvKey(key) {
  const upper = key.toUpperCase();
  return CHILD_ENV_DENIED_PREFIXES.some((prefix) => upper.startsWith(prefix)) || CHILD_ENV_DENIED_KEYS.has(upper);
}

/** Protected isolation keys: whichever case-variant exists is normalized to
 * the canonical spelling below. */
const CHILD_ENV_PROTECTED_KEYS = new Set(["HOME", "USERPROFILE", "TMP", "TEMP", "CODEX_HOME", "CLAUDE_CONFIG_DIR"]);

function stripProtectedVariants(env) {
  for (const key of Object.keys(env)) {
    if (CHILD_ENV_PROTECTED_KEYS.has(key.toUpperCase()) && !Object.hasOwn(env, key.toUpperCase())) {
      delete env[key];
    }
  }
}

/**
 * Build the child process environment. Parent session identity, desktop
 * bindings and vendor credential/config namespaces (every CODEX_, CLAUDE_,
 * ANTHROPIC_ or OPENAI_ key, plus NODE_OPTIONS/NODE_PATH execution hooks)
 * never reach the child — matching is CASE-INSENSITIVE. The isolation
 * locations come from the explicit trigger context and cannot be overridden
 * (including case variants from context.env); ordinary system environment
 * (PATH, …) is preserved; context.env entries are applied last but may not
 * smuggle denied namespaces or isolation keys. Milestone 7's minimal-auth
 * bridge is the only way authentication enters, and it must do so through
 * its own controlled fields.
 */
export function buildChildEnv(parentEnv, context) {
  const env = {};

  for (const [key, value] of Object.entries(parentEnv)) {
    if (isDeniedEnvKey(key)) {
      continue;
    }
    env[key] = value;
  }

  env.HOME = context.homeDir;
  env.USERPROFILE = context.homeDir;
  env.CODEX_HOME = context.runtimeStateDir;
  env.CLAUDE_CONFIG_DIR = context.runtimeStateDir;
  env.TMP = context.tempDir;
  env.TEMP = context.tempDir;

  if (isPlainObject(context.env)) {
    for (const [key, value] of Object.entries(context.env)) {
      if (isDeniedEnvKey(key) || CHILD_ENV_PROTECTED_KEYS.has(key.toUpperCase())) {
        continue;
      }
      env[key] = value;
    }
  }

  stripProtectedVariants(env);

  return env;
}

/**
 * Terminate a spawned CLI process tree. On Windows the tree is killed via
 * `taskkill /T /F` (npm shims wrap real processes) — resolved from the
 * absolute System32 location first, because a stripped PATH must not make
 * termination silently fail (with a PATH fallback for MSYS-style setups);
 * elsewhere the detached process group receives SIGKILL. The caller keeps
 * whatever raw evidence was already captured (plan verification record §7)
 * and reports kill failures honestly instead of claiming a termination.
 */
export function terminateProcessTree(child) {
  if (!child || child.pid === undefined || (child.exitCode !== null || child.signalCode !== null)) {
    return false;
  }

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
    const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
    let result = spawnSync(taskkill, ["/pid", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });

    if (result.error || result.status !== 0) {
      result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true
      });
    }

    return !result.error && result.status === 0;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
    return true;
  } catch {
    try {
      child.kill("SIGKILL");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Resolve a Windows npm .cmd shim to the REAL entry it wraps (a Node script
 * or a native .exe). Windows cannot spawn .cmd shims without a shell, and
 * the adapters never interpolate a shell command — so the shim text is
 * parsed for its quoted `%~dp0\...` target instead. Returns
 * `{ launcher: "node" | "exe", entry }`; throws (infrastructure) when the
 * shim names no entry — a broken install is never guessed around.
 */
export async function resolveWindowsShimEntry(shimPath) {
  if (path.extname(shimPath).toLowerCase() === ".exe") {
    return { launcher: "exe", entry: shimPath };
  }

  const content = await readFile(shimPath, "utf8");
  const patterns = [
    /"%~dp0\\([^"]*?\.(?:js|mjs|cjs))"/i,
    /%dp0%\\([^"]*?\.(?:js|mjs|cjs))/i,
    /"%~dp0\\([^"]*?\.exe)"/i,
    /%dp0%\\([^"]*?\.exe)"/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);

    if (match) {
      const entry = path.resolve(path.dirname(shimPath), ...match[1].split(/[\\/]/));
      return { launcher: entry.toLowerCase().endsWith(".exe") ? "exe" : "node", entry };
    }
  }

  const error = new Error(
    `Windows shim ${shimPath} does not name a real entry point (.js/.exe); refusing to guess a shell command`
  );
  error.name = "RuntimeInfrastructureError";
  error.isInfrastructureError = true;
  throw error;
}

/**
 * Resolve the launch command for the configured binary: a plain executable
 * spawns directly; a Windows .cmd shim spawns its REAL entry (node script
 * via the current Node binary, or the .exe) — never the shim through a
 * shell.
 */
export async function resolveLaunchEntry(context) {
  const binaryPath = context.binaryPath;

  if (binaryPath.toLowerCase().endsWith(".cmd")) {
    const resolved = await resolveWindowsShimEntry(binaryPath);

    if (resolved.launcher === "node") {
      return { command: process.execPath, args: [resolved.entry, ...(context.binaryArgs ?? [])] };
    }

    return { command: resolved.entry, args: [...(context.binaryArgs ?? [])] };
  }

  return { command: binaryPath, args: [...(context.binaryArgs ?? [])] };
}

/**
 * Offline `--version` probe for one runtime (no model, no account). Returns
 * `{ version }`, or null when the binary is missing/fails — detection
 * failure is a fact about the machine, not a run outcome.
 */
export async function probeRuntimeVersion(context, versionArgs) {
  requireTriggerContext(context);
  const entry = await resolveLaunchEntry(context);
  // The (already validated) workspace location must exist for the child cwd
  // to be valid on Windows; creating it is idempotent.
  await mkdir(context.workspaceDir, { recursive: true });
  const envBuilder = typeof context.buildChildEnv === "function" ? context.buildChildEnv : buildChildEnv;
  const result = spawnSync(entry.command, [...entry.args, ...versionArgs], {
    cwd: context.workspaceDir,
    env: envBuilder(process.env, context),
    encoding: "utf8",
    shell: false,
    timeout: 15000,
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return { version: result.stdout.trim() };
}

/**
 * Validate one adapter object against the plan §14 contract.
 */
export function adapterContract(adapter) {
  if (!isPlainObject(adapter)) {
    throw new RuntimeContractError("runtime adapter must be an object");
  }

  if (!RUNTIME_IDS.includes(adapter.id)) {
    throw new RuntimeContractError(`runtime adapter id must be one of ${RUNTIME_IDS.join("|")}, got ${JSON.stringify(adapter.id)}`);
  }

  const methods = ["detect", "version", "capabilities", "prepareWorkspace", "runTriggerCase", "parseTrace"];
  const missing = methods.filter((method) => typeof adapter[method] !== "function");

  if (missing.length > 0) {
    throw new RuntimeContractError(`runtime adapter ${adapter.id} is missing: ${missing.join(", ")}`);
  }

  return adapter;
}

/**
 * Shared runTriggerCase engine for the two live adapters: exclusive-context
 * validation, safe spawn (argv array, prompt via stdin, shell:false), raw
 * trace retention, timeout with process-tree termination and partial
 * evidence, and the exit-code/infra classification. The trace parser itself
 * stays a pure per-runtime function; the runner's spawn/nonzero/timeout
 * outcomes take precedence over any parse classification.
 */
export async function runLiveTriggerCase(adapter, { skill, prompt, context, buildArgs, parseTrace }) {
  requireTriggerContext(context);

  if (typeof skill !== "string" || skill.length === 0) {
    throw new RuntimeContractError("runTriggerCase requires a non-empty skill name");
  }

  if (typeof prompt !== "string" || prompt.length === 0) {
    throw new RuntimeContractError("runTriggerCase requires a non-empty prompt string");
  }

  const startedAt = Date.now();
  const tracePath = path.join(context.traceDir, "events.jsonl");

  const captured = await new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let timer = null;
    let hardTimer = null;
    let killRetryTimer = null;
    let settled = false;
    let timedOut = false;
    let killFailed = false;
    let child = null;

    const finish = (outcome) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const pendingTimer of [timer, hardTimer, killRetryTimer]) {
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer);
        }
      }
      resolve(outcome);
    };

    let launchEntry = null;

    // Shim resolution happens INSIDE the run: a missing or broken shim is
    // an infrastructure outcome with a diagnostic, never a crash.
    resolveLaunchEntry(context).then(
      (resolved) => {
        launchEntry = resolved;
        continueRun(launchEntry);
      },
      (error) => {
        finish({ kind: "launch-resolve-error", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: null, resolveError: error, timedOut: false });
      }
    );

    function continueRun(resolved) {
      const argv = [...resolved.args, ...buildArgs()];
      // The isolation layer (Milestone 7) supplies context.buildChildEnv so
      // the ACTUAL child process receives the isolated environment; without
      // it the standard reduction applies.
      const envBuilder = typeof context.buildChildEnv === "function" ? context.buildChildEnv : buildChildEnv;
      const env = envBuilder(process.env, context);

      // The workspace location is explicit and validated; it must EXIST for
      // the child cwd to be valid on Windows (Milestone 7 populates the real
      // isolated tree; the runner only materializes the directory).
      mkdir(context.workspaceDir, { recursive: true })
        .then(() => {
          spawnChild(argv, env);
        })
        .catch((error) => {
          finish({ kind: "workspace-create-error", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), resolveError: error, timedOut: false });
        });
    }

    function spawnChild(argv, env) {
      try {
        child = spawn(launchEntry.command, argv, {
          cwd: context.workspaceDir,
          env,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          ...(process.platform === "win32" ? {} : { detached: true })
        });
      } catch (error) {
        finish({ kind: "spawn-error", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), spawnError: error, timedOut: false });
        return;
      }

      child.on("error", (error) => {
        finish({ kind: "spawn-error", stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), spawnError: error, timedOut: false });
      });

      // Soft deadline: terminate the whole process tree. If the kill FAILS
      // it is retried once and, failing that, honestly reported — the run
      // never claims a termination that did not happen.
      timer = setTimeout(() => {
        timedOut = true;
        killFailed = !terminateProcessTree(child);

        if (killFailed) {
          killRetryTimer = setTimeout(() => {
            killFailed = !terminateProcessTree(child);
            releasePipes();
          }, 250);
        } else {
          releasePipes();
        }
      }, context.timeoutMs);

      // Hard deadline: if the tree cannot be killed, or the parent already
      // exited and a grandchild still holds the pipes, do NOT wait for close
      // forever — finish forcibly with whatever raw evidence was captured.
      hardTimer = setTimeout(() => {
        timedOut = true;
        releasePipes();
        finish({ kind: "exit", stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode: null, timedOut, killFailed, forced: true });
      }, context.timeoutMs + KILL_GRACE_MS);

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk);
      });

      child.on("close", (exitCode) => {
        finish({ kind: "exit", stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode, timedOut, killFailed, forced: false });
      });

      child.stdin.on("error", () => {});
      child.stdin.end(prompt, "utf8");
    }

    function releasePipes() {
      if (child === null) {
        return;
      }
      // Destroy the parent-side pipe handles so a dead-but-unreaped tree
      // cannot keep this run waiting on stream close events.
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  });

  // Raw evidence is always retained VERBATIM as captured bytes — invalid
  // UTF-8, CRLF, blank lines and trailing state are never re-encoded (plan
  // verification record §7). The structured event stream (events.jsonl)
  // and the raw stdout.log carry the SAME verbatim bytes; stderr.log is
  // always present (empty when the CLI wrote nothing). Parsers decode
  // their own copy.
  const stdoutText = captured.stdout.toString("utf8");
  try {
    await mkdir(context.traceDir, { recursive: true });
    await writeFile(tracePath, captured.stdout);
    await writeFile(path.join(context.traceDir, "stdout.log"), captured.stdout);
    await writeFile(path.join(context.traceDir, "stderr.log"), captured.stderr);
  } catch (error) {
    return buildTriggerResult({
      status: "infra_error",
      runtime: adapter.id,
      durationMs: Date.now() - startedAt,
      evidence: [{ kind: "trace-write-failure", detail: error.message }],
      partial: true
    });
  }

  const durationMs = Date.now() - startedAt;
  const runtimeVersion = await probeRuntimeVersion(context, adapter.versionArgs).then((info) => info?.version ?? null).catch(() => null);

  if (captured.kind === "launch-resolve-error" || captured.kind === "workspace-create-error") {
    return buildTriggerResult({
      status: "infra_error",
      runtime: adapter.id,
      runtimeVersion: null,
      durationMs,
      evidence: [{ kind: captured.kind, detail: captured.resolveError.message }],
      tracePath,
      partial: true
    });
  }

  if (captured.kind === "spawn-error") {
    return buildTriggerResult({
      status: "infra_error",
      runtime: adapter.id,
      runtimeVersion,
      durationMs,
      evidence: [{ kind: "spawn-error", detail: captured.spawnError.message }],
      tracePath,
      partial: true
    });
  }

  if (captured.timedOut === true) {
    return buildTriggerResult({
      status: "timeout",
      runtime: adapter.id,
      runtimeVersion,
      durationMs,
      evidence: [
        captured.killFailed === true
          ? { kind: "timeout-kill-failed", detail: `run exceeded ${context.timeoutMs}ms and process-tree termination FAILED; the CLI process may still be running and the result is based on ${captured.stdout.length} captured bytes` }
          : { kind: "timeout", detail: `terminated after ${context.timeoutMs}ms with ${captured.stdout.length} captured bytes` }
      ],
      tracePath,
      partial: true
    });
  }

  if (captured.exitCode !== 0) {
    return buildTriggerResult({
      status: "infra_error",
      runtime: adapter.id,
      runtimeVersion,
      durationMs,
      evidence: [
        { kind: "nonzero-exit", detail: `exit code ${captured.exitCode}` },
        ...(captured.stderr.length > 0 ? [{ kind: "stderr", detail: captured.stderr.slice(0, 2000) }] : [])
      ],
      tracePath
    });
  }

  const parsed = parseTrace(stdoutText);
  return buildTriggerResult({
    status: parsed.status,
    runtime: adapter.id,
    runtimeVersion,
    durationMs,
    evidence: parsed.evidence,
    tracePath
  });
}
