import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { buildChildEnv } from "../runtimes/base.mjs";

/**
 * Trigger isolation layer (v0.2 Milestone 7, plan §17).
 *
 * Every case × runtime × run receives a fully isolated environment; nothing
 * is shared between runs and nothing leaks into (or out of) the developer's
 * real machine:
 *
 *   .packsmith/runs/<uniqueid>/
 *   ├── workspace/          real git repo boundary (runtime skill
 *   │                       discovery stops scanning ancestors here)
 *   ├── runtime.json        run metadata: runtime id, ACTUAL version,
 *   │                       flags, provenance, context paths, status,
 *   │                       auth source type + presence (never values)
 *   ├── stdout.log          raw CLI stdout (verbatim bytes)
 *   ├── stderr.log          raw CLI stderr
 *   ├── events.jsonl        structured trace (parser input)
 *   └── result.json         normalized trigger result
 *
 * Private runtime state / auth / cache / temp live in an exclusive OS-temp
 * directory OUTSIDE the retained artifacts and are always cleaned up —
 * including on failure. Parent desktop identity, vendor namespaces, Node
 * hooks and git context never reach the child (case-insensitive on
 * Windows). Authentication is a minimal file bridge only: Codex gets a
 * read-only copy of the parent auth.json inside its private CODEX_HOME;
 * Claude gets a minimal settings.json carrying ONLY the explicitly
 * controlled ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL fields read from the
 * parent settings. No full config, MCP, hooks, projects, AGENTS or other
 * installed skills are ever copied; only the skill under test is installed
 * into the runtime's own discovery directory (symlink/junction escape
 * checked on source and artifact). `--ephemeral`, `--ignore-user-config`,
 * `--ignore-rules` (Codex) and Claude's session/setting flags are
 * defense-in-depth only — they are NEVER treated as isolation evidence;
 * the git boundary and private state directories are.
 */

/** Retained artifact names inside one run directory (plan §17 layout). */
export const RUN_ARTIFACT_NAMES = Object.freeze([
  "workspace",
  "runtime.json",
  "stdout.log",
  "stderr.log",
  "events.jsonl",
  "result.json"
]);

/** Keys the child may keep from the parent system environment (execution
 * essentials only — everything else is dropped). Matched case-insensitively
 * on Windows. */
const SYSTEM_ENV_ALLOWLIST = new Set([
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "PROGRAMDATA",
  "ALLUSERSPROFILE",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PROCESSOR_ARCHITECTURE"
]);

/** Claude Code tools allowed in an isolated trigger run (minimal surface;
 * Skill is the tool under test, Read/Glob/Grep let the agent discover the
 * skill file — the activation evidence path). */
export const CLAUDE_ISOLATED_TOOLS = "Read,Glob,Grep,Skill";

/** Unique run id: plan-style date prefix + random suffix. */
export function createRunId(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${date}-${randomUUID().slice(0, 6)}`;
}

/**
 * Create the retained run directory skeleton under `runsRoot`
 * (.packsmith/runs by convention — the CALLER owns that root; tests pass
 * an exclusive temp root). Returns every artifact path up front so a
 * failed run can still leave truthful, diagnosable partial artifacts.
 */
export async function createIsolatedRun({ runsRoot, prefix = "", now = new Date() } = {}) {
  if (typeof runsRoot !== "string" || runsRoot.length === 0 || !path.isAbsolute(runsRoot)) {
    throw new InfrastructureError(`isolated runs root must be an absolute path, got ${JSON.stringify(runsRoot)}`);
  }

  const runId = `${prefix}${createRunId(now)}`;
  const runDir = path.join(runsRoot, runId);
  const workspaceDir = path.join(runDir, "workspace");

  try {
    await fsPromises.mkdir(workspaceDir, { recursive: true });
  } catch (error) {
    throw new InfrastructureError(`cannot create isolated run directory ${runDir}: ${error.message}`, { cause: error });
  }

  return {
    runId,
    runDir,
    paths: Object.freeze({
      workspace: workspaceDir,
      runtimeJson: path.join(runDir, "runtime.json"),
      stdoutLog: path.join(runDir, "stdout.log"),
      stderrLog: path.join(runDir, "stderr.log"),
      eventsJsonl: path.join(runDir, "events.jsonl"),
      resultJson: path.join(runDir, "result.json")
    })
  };
}

/**
 * Make the run's workspace a REAL git repository so runtime skill/AGENTS
 * discovery stops scanning at this boundary (runtimes walk parent
 * directories up to the git root — a plain subdirectory of the project
 * would let ancestor skills leak into the run). Uses the installed git
 * binary with a fully isolated git configuration: parent GIT_* context is
 * stripped case-insensitively, global/system config point at empty
 * per-case files, an empty template prevents global hook templates, and
 * prompting is disabled. A missing git binary is an infrastructure fault —
 * the run never pretends a plain directory is a repo.
 */
export async function initializeWorkspaceRepo({ workspaceDir, gitBinary = "git" }) {
  let emptyTemplate;

  try {
    emptyTemplate = mkdtempSync(path.join(os.tmpdir(), "packsmith-git-template-"));
    await fsPromises.writeFile(path.join(emptyTemplate, "empty.gitconfig"), "", "utf8");
  } catch (error) {
    throw new InfrastructureError(`cannot prepare isolated git template: ${error.message}`, { cause: error });
  }

  const emptyConfig = path.join(emptyTemplate, "empty.gitconfig");

  const env = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase().startsWith("GIT_")) {
      continue;
    }
    env[key] = value;
  }

  env.GIT_CONFIG_GLOBAL = emptyConfig;
  env.GIT_CONFIG_SYSTEM = emptyConfig;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_TEMPLATE_DIR = emptyTemplate;

  const run = (args) => {
    const result = spawnSync(gitBinary, args, { cwd: workspaceDir, env, encoding: "utf8", timeout: 30000, windowsHide: true });

    if (result.error) {
      throw new InfrastructureError(`isolated git boundary requires the git binary (${gitBinary}): ${result.error.message}`, { cause: result.error });
    }

    return result;
  };

  const probe = run(["--version"]);

  if (probe.status !== 0) {
    throw new InfrastructureError(`git binary is not usable (exit ${probe.status})`);
  }

  const init = run(["init", "--template", emptyTemplate, workspaceDir]);

  if (init.status !== 0) {
    throw new InfrastructureError(`git init failed for the isolated workspace: ${init.stderr || init.stdout}`);
  }

  const toplevel = run(["rev-parse", "--show-toplevel"]);

  if (toplevel.status !== 0) {
    throw new InfrastructureError(`isolated workspace is not a git repository after init: ${toplevel.stderr || toplevel.stdout}`);
  }

  const resolvedRoot = path.resolve(toplevel.stdout.trim());

  if (resolvedRoot.toLowerCase() !== path.resolve(workspaceDir).toLowerCase()) {
    throw new InfrastructureError(
      `isolated workspace git root resolved to ${resolvedRoot} instead of ${workspaceDir}; refusing to continue`
    );
  }

  try {
    rmSync(emptyTemplate, { recursive: true, force: true });
  } catch {
    // The template dir is disposable; its removal must never fail the run.
  }

  return { gitRoot: path.resolve(workspaceDir), isolated: true };
}

/**
 * Build the fully isolated child environment for one run:
 *   - base.buildChildEnv(parentEnv, context) already drops parent session
 *     identity, vendor namespaces and Node hooks case-insensitively and
 *     pins HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR/TMP/TEMP;
 *   - this layer additionally strips ALL parent GIT_* context, pins
 *     APPDATA/LOCALAPPDATA and the XDG_* directories to the case's private
 *     state/cache/config dirs, and reduces PATH to the execution minimum
 *     (System32 + the running Node's directory) so parent tool directories
 *     cannot leak executables into the run.
 * `context.env` is intentionally NOT extended here: authentication travels
 * through the file bridge (bridgeAuth), never through environment keys.
 */
export function buildIsolatedChildEnv(parentEnv, context, caseDirs) {
  const env = buildChildEnv(parentEnv, context);

  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("GIT_")) {
      delete env[key];
    }
  }

  env.APPDATA = caseDirs.appData;
  env.LOCALAPPDATA = caseDirs.localAppData;
  env.XDG_CACHE_HOME = caseDirs.cache;
  env.XDG_CONFIG_HOME = caseDirs.config;
  env.XDG_STATE_HOME = caseDirs.state;

  const minimalPaths = [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32"), path.dirname(process.execPath)];
  env.PATH = minimalPaths.filter((entry) => entry.length > 0).join(path.delimiter);

  return env;
}

/**
 * Build the per-case private state directory set (created under the
 * exclusive OS-temp auth/state root): runtime state (CODEX_HOME /
 * CLAUDE_CONFIG_DIR target), cache, config, state, appdata/localappdata
 * and temp. All of it is disposable and cleaned up after the run.
 */
export async function createCaseDirs({ privateRoot }) {
  const dirs = {
    runtimeState: path.join(privateRoot, "runtime-state"),
    home: path.join(privateRoot, "home"),
    cache: path.join(privateRoot, "cache"),
    config: path.join(privateRoot, "config"),
    state: path.join(privateRoot, "state"),
    appData: path.join(privateRoot, "appdata"),
    localAppData: path.join(privateRoot, "localappdata"),
    temp: path.join(privateRoot, "temp")
  };

  try {
    for (const dir of Object.values(dirs)) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
  } catch (error) {
    throw new InfrastructureError(`cannot create private case directories under ${privateRoot}: ${error.message}`, { cause: error });
  }

  return dirs;
}

/**
 * Minimal authentication bridge (plan verification record §6). Reads ONLY
 * the explicitly controlled fields and delivers them as private state
 * files inside the case's runtime-state directory (which IS CODEX_HOME /
 * CLAUDE_CONFIG_DIR for the child) — no environment keys, no full config,
 * no MCP/hooks/projects, no other skills:
 *
 *   codex   → copy the parent auth.json verbatim into
 *             <runtimeState>/auth.json (Codex reads auth from CODEX_HOME);
 *   claude  → read env.ANTHROPIC_AUTH_TOKEN / env.ANTHROPIC_BASE_URL from
 *             the parent settings.json and write a MINIMAL
 *             <runtimeState>/settings.json carrying only those fields.
 *
 * The report carries the auth SOURCE TYPE and PRESENCE only — values are
 * never returned, logged, or written anywhere inside the retained run
 * directory. Parent files are opened read-only and are never modified.
 */
export async function bridgeAuth({ runtimeId, codexAuthPath, claudeSettingsPath, runtimeStateDir }) {
  const report = { source: null, present: false, endpointPinned: false, files: [] };

  if (runtimeId === "codex") {
    report.source = "codex-auth-json";
    let raw;

    try {
      raw = await fsPromises.readFile(codexAuthPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return report;
      }
      throw new InfrastructureError(`cannot read the parent Codex auth file ${codexAuthPath}: ${error.message}`, { cause: error });
    }

    try {
      const parsed = JSON.parse(raw);

      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("auth.json must contain a JSON object");
      }
    } catch (error) {
      throw new InfrastructureError(`parent Codex auth file ${codexAuthPath} is not a valid auth payload: ${error.message}`, { cause: error });
    }

    const destination = path.join(runtimeStateDir, "auth.json");

    try {
      await fsPromises.writeFile(destination, raw, { mode: 0o600 });
      await fsPromises.chmod(destination, 0o600).catch(() => {});
    } catch (error) {
      throw new InfrastructureError(`cannot stage the private Codex auth state: ${error.message}`, { cause: error });
    }

    report.present = true;
    report.files.push(destination);
    return report;
  }

  if (runtimeId === "claude-code") {
    report.source = "claude-settings-env";
    let settings;

    try {
      settings = JSON.parse(await fsPromises.readFile(claudeSettingsPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return report;
      }
      throw new InfrastructureError(`cannot read the parent Claude settings ${claudeSettingsPath}: ${error.message}`, { cause: error });
    }

    const env = settings?.env ?? {};
    const token = typeof env.ANTHROPIC_AUTH_TOKEN === "string" ? env.ANTHROPIC_AUTH_TOKEN : null;
    const endpoint = typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : null;

    if (token === null) {
      // No controlled credential field present: report honestly instead of
      // guessing other keys or copying the whole settings file.
      return report;
    }

    const minimal = { env: { ANTHROPIC_AUTH_TOKEN: token, ...(endpoint !== null ? { ANTHROPIC_BASE_URL: endpoint } : {}) } };
    const destination = path.join(runtimeStateDir, "settings.json");

    try {
      await fsPromises.writeFile(destination, `${JSON.stringify(minimal, null, 2)}\n`, { mode: 0o600 });
      await fsPromises.chmod(destination, 0o600).catch(() => {});
    } catch (error) {
      throw new InfrastructureError(`cannot stage the private Claude auth state: ${error.message}`, { cause: error });
    }

    report.present = true;
    report.endpointPinned = endpoint !== null;
    report.files.push(destination);
    return report;
  }

  return report;
}

/** Runtime-local skill discovery directory for one isolated workspace. */
export function skillInstallDir(workspaceDir, runtimeId) {
  if (runtimeId === "codex") {
    return path.join(workspaceDir, ".agents", "skills");
  }

  if (runtimeId === "claude-code") {
    return path.join(workspaceDir, ".claude", "skills");
  }

  return null;
}

/**
 * Install ONLY the skill under test into the runtime's local discovery
 * directory. The source tree is validated before copying (every entry a
 * real file/directory — no symlinks/junctions — and its real location
 * inside the source root) and the installed tree is validated afterwards
 * (no reparse points, resolved location inside the destination). Any
 * escape refuses the install and removes the partial artifact — the run
 * never writes outside the isolated workspace and never touches the
 * developer's global skill installation.
 */
export async function installSkill({ workspaceDir, runtimeId, skillDir }) {
  const skillsRoot = skillInstallDir(workspaceDir, runtimeId);

  if (skillsRoot === null) {
    throw new InfrastructureError(`runtime ${runtimeId} has no local skill installation (static adapter)`);
  }

  const skillName = path.basename(skillDir);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) {
    throw new InfrastructureError(`skill directory name ${JSON.stringify(skillName)} is not a valid kebab-case skill name`);
  }

  let sourceEntry;

  try {
    sourceEntry = await fsPromises.lstat(skillDir);
  } catch (error) {
    throw new InfrastructureError(`cannot inspect the skill source ${skillDir}: ${error.message}`, { cause: error });
  }

  if (sourceEntry.isSymbolicLink() || !sourceEntry.isDirectory()) {
    throw new InfrastructureError(`skill source ${skillDir} must be a real directory (no symlinks/junctions)`);
  }

  const realSourceRoot = await fsPromises.realpath(skillDir);

  if (path.basename(realSourceRoot) !== skillName) {
    throw new InfrastructureError(`skill source realpath ${realSourceRoot} does not match the skill name ${JSON.stringify(skillName)}`);
  }

  await assertNoEscapes(skillDir, realSourceRoot, "skill source");

  const destination = path.join(skillsRoot, skillName);

  try {
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    await fsPromises.cp(skillDir, destination, { recursive: true, verbatimSymlinks: false });
  } catch (error) {
    await fsPromises.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw new InfrastructureError(`cannot install the skill into the isolated workspace: ${error.message}`, { cause: error });
  }

  try {
    await assertNoEscapes(destination, await fsPromises.realpath(destination), "installed skill");
  } catch (error) {
    await fsPromises.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return { installDir: destination, skillName };
}

/** Walk a tree refusing any reparse point and any entry resolving outside
 * `realRoot` — the anti-escape check used for source and artifact. */
async function assertNoEscapes(rootDir, realRoot, label) {
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;

    try {
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch (error) {
      throw new InfrastructureError(`cannot inspect the ${label} at ${current}: ${error.message}`, { cause: error });
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      let real;

      if (entry.isSymbolicLink()) {
        throw new InfrastructureError(`${label} contains a symlink/junction at ${entryPath}; refusing to continue`);
      }

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      try {
        real = await fsPromises.realpath(entryPath);
      } catch {
        real = entryPath;
      }

      const relative = path.relative(realRoot, real);

      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new InfrastructureError(`${label} entry ${entryPath} resolves outside ${realRoot}`);
      }
    }
  }
}

/**
 * Defense-in-depth CLI flags per runtime. These are appended to the
 * adapter's protocol arguments and recorded in runtime.json, but they are
 * NEVER treated as isolation evidence on their own (plan verification
 * record §13): the git boundary, private state directories and the
 * minimal environment are the actual isolation.
 */
export function isolationFlagsFor(runtimeId, { claudeSettingsPath } = {}) {
  if (runtimeId === "codex") {
    return ["--ephemeral", "--ignore-user-config", "--ignore-rules"];
  }

  if (runtimeId === "claude-code") {
    return [
      "--no-session-persistence",
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--settings",
      claudeSettingsPath,
      "--tools",
      CLAUDE_ISOLATED_TOOLS
    ];
  }

  return [];
}

/**
 * Write runtime.json — the run's metadata record. Only ACTUAL observed
 * values go in (version string, flags, context paths, status, auth source
 * type + presence); nothing is invented and no credential value is ever
 * included.
 */
export async function writeRuntimeMetadata(runJsonPath, metadata) {
  const record = {
    schemaVersion: 1,
    runtime: metadata.runtime,
    runtimeVersion: metadata.runtimeVersion ?? null,
    flags: metadata.flags ?? [],
    provenance: metadata.provenance ?? null,
    context: {
      workspaceDir: metadata.contextPaths?.workspaceDir ?? null,
      homeDir: metadata.contextPaths?.homeDir ?? null,
      runtimeStateDir: metadata.contextPaths?.runtimeStateDir ?? null,
      tempDir: metadata.contextPaths?.tempDir ?? null,
      traceDir: metadata.contextPaths?.traceDir ?? null
    },
    auth: {
      source: metadata.auth?.source ?? null,
      present: metadata.auth?.present === true,
      endpointPinned: metadata.auth?.endpointPinned === true
    },
    status: metadata.status ?? "prepared",
    skill: metadata.skill ?? null,
    repeat: metadata.repeat ?? null,
    notes: metadata.notes ?? []
  };

  await fsPromises.writeFile(runJsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

/**
 * Remove the private (non-retained) state of one run: the exclusive
 * private root holding runtime state, auth staging, caches and temp.
 * Retained artifacts under runDir are never touched. A cleanup failure is
 * infrastructure — nothing may claim a cleanup that did not happen.
 */
export async function cleanupPrivateState(privateRoot) {
  try {
    await fsPromises.rm(privateRoot, { recursive: true, force: true });
  } catch (error) {
    throw new InfrastructureError(`could not remove the private run state ${privateRoot}: ${error.message}`, { cause: error });
  }
}

/**
 * Convenience orchestrator for one isolated trigger run: creates the run
 * skeleton and private state, builds the real git boundary, bridges the
 * minimal auth, installs the skill under test, and hands the caller a
 * fully isolated trigger context compatible with the Milestone 6 adapters
 * (`requireTriggerContext`-valid, `isolationFlags` included). The caller
 * runs the adapter; this module then records runtime.json and always
 * cleans the private state — on success and on failure alike (a cleanup
 * failure surfaces, never silently claimed).
 *
 * Returns `{ result, runDir, runId, metadata }` where `result` is the
 * callback's return value.
 */
export async function withIsolatedTriggerRun({
  runsRoot,
  runtimeId,
  skillDir,
  timeoutMs = 300000,
  binaryPath,
  binaryArgs,
  codexAuthPath = path.join(os.homedir(), ".codex", "auth.json"),
  claudeSettingsPath = path.join(os.homedir(), ".claude", "settings.json"),
  now,
  run: runCallback
}) {
  if (typeof runCallback !== "function") {
    throw new InfrastructureError("withIsolatedTriggerRun requires a run callback");
  }

  const run = await createIsolatedRun({ runsRoot, now });
  const privateRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "packsmith-run-private-"));
  let bridge = { source: null, present: false, endpointPinned: false, files: [] };
  let context = null;
  let installed = null;

  try {
    const caseDirs = await createCaseDirs({ privateRoot });

    await initializeWorkspaceRepo({ workspaceDir: run.paths.workspace });
    bridge = await bridgeAuth({ runtimeId, codexAuthPath, claudeSettingsPath, runtimeStateDir: caseDirs.runtimeState });

    if (runtimeId === "codex" || runtimeId === "claude-code") {
      installed = await installSkill({ workspaceDir: run.paths.workspace, runtimeId, skillDir });
    }

    const flags = isolationFlagsFor(runtimeId, {
      claudeSettingsPath: caseDirs.runtimeState ? path.join(caseDirs.runtimeState, "settings.json") : undefined
    });

    context = {
      workspaceDir: run.paths.workspace,
      traceDir: run.runDir,
      homeDir: caseDirs.home,
      runtimeStateDir: caseDirs.runtimeState,
      tempDir: caseDirs.temp,
      timeoutMs,
      ...(binaryPath !== undefined ? { binaryPath } : {}),
      ...(binaryArgs !== undefined ? { binaryArgs } : {}),
      isolationFlags: flags,
      caseDirs
    };

    const result = await runCallback({ context, run, caseDirs, bridge, installed });

    await writeRuntimeMetadata(run.paths.runtimeJson, {
      runtime: runtimeId,
      runtimeVersion: null,
      flags,
      provenance: "isolation: plan §17 (git boundary + private state + minimal auth bridge); runtime protocol provenance in knowledge-base/runtimes",
      contextPaths: {
        workspaceDir: run.paths.workspace,
        homeDir: caseDirs.home,
        runtimeStateDir: caseDirs.runtimeState,
        tempDir: caseDirs.temp,
        traceDir: run.runDir
      },
      auth: bridge,
      status: "executed",
      skill: installed?.skillName ?? null,
      notes: []
    });

    return { result, runDir: run.runDir, runId: run.runId, context };
  } catch (error) {
    // Failure keeps the retained artifacts truthful and partial, records
    // the failure in runtime.json, and still cleans the private state.
    try {
      await writeRuntimeMetadata(run.paths.runtimeJson, {
        runtime: runtimeId,
        flags: [],
        provenance: "isolation: plan §17",
        contextPaths: {},
        auth: bridge,
        status: `failed: ${error.message.slice(0, 200)}`,
        notes: []
      });
    } catch {
      // runtime.json write is best-effort on the failure path; the thrown
      // error below is the truthful outcome.
    }
    throw error;
  } finally {
    await cleanupPrivateState(privateRoot);
  }
}

function runDirTrace(run) {
  return run.runDir;
}
