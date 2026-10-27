import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { TRIGGER_STATUSES, buildChildEnv } from "../runtimes/base.mjs";
import { establishCodexSkillScope, withSkillScopeFlags } from "./codex-skill-scope.mjs";

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
 *   ├── stdout.log          raw CLI stdout (verbatim bytes, always present)
 *   ├── stderr.log          raw CLI stderr (verbatim bytes, always present)
 *   ├── events.jsonl        structured trace (parser input)
 *   └── result.json         normalized trigger result (actual six-state
 *                           status; infra_error on setup/launch failures)
 *
 * Private runtime state / auth / cache / temp live in an exclusive OS-temp
 * directory OUTSIDE the retained artifacts and are always cleaned up —
 * including on failure; a cleanup failure flips the run's recorded status
 * instead of letting a "success" stand. Parent desktop identity, vendor
 * namespaces, Node hooks and git context never reach the child
 * (case-insensitive on Windows). Authentication is a minimal FILE bridge
 * only: Codex gets a read-only copy of the parent auth.json inside its
 * private CODEX_HOME; Claude gets a minimal settings.json carrying ONLY the
 * explicitly whitelisted ANTHROPIC_* auth/endpoint/model fields (plus the
 * top-level model selector) read from the parent settings — hooks, MCP,
 * projects and every other configuration are never copied. Only the skill
 * under test is installed into the runtime's own discovery directory, with
 * symlink/junction escape validation on the source and the artifact.
 * `--ephemeral`/`--ignore-rules` (Codex) and
 * Claude's session/setting flags are defense-in-depth only — they are
 * NEVER treated as isolation evidence; the git boundary, the private state
 * directories and the reduced environment are. Codex skill scoping is
 * established by auditing available skills (no model) and disabling every
 * non-target one through the official `skills.config` selectors; the user's
 * global `.agents/skills` is reachable through the OS home directory
 * regardless of HOME/USERPROFILE/CODEX_HOME, so it cannot be excluded by
 * environment or git boundaries alone.
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

/**
 * The ONLY Claude settings fields the auth bridge may carry: the six
 * documented ANTHROPIC_* env fields (auth token, endpoint, model routing)
 * plus the top-level model selector. Everything else in the parent
 * settings (hooks, MCP, permissions, projects, …) is never copied.
 */
export const CLAUDE_BRIDGE_ENV_FIELDS = Object.freeze([
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL"
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameRealPath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/**
 * Registry of private state roots this process created. The public cleanup
 * helper refuses to remove anything else — a caller may not point it at an
 * arbitrary directory and have it recursively deleted. Registration records
 * the root's ENTITY identity (dev/ino plus a random marker file written
 * inside), because a registered PATH is not ownership of whatever entity
 * currently sits at that path: if the original directory is renamed away
 * and a different real directory is planted at the same pathname, the
 * cleanup must preserve the replacement and surface the mismatch instead
 * of deleting someone else's files.
 */
const ownedPrivateRoots = new Map();

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
 *
 * Safety rules (acceptance round 2): the prefix must be a single filename
 * token (no separators, no traversal); the runs root must not be a
 * symlink/junction itself and must resolve exactly to its given path (an
 * ancestor junction redirects the whole run and is rejected); the run
 * directory is created EXCLUSIVELY (no recursive mkdir that would silently
 * reuse a colliding case) with a bounded retry that re-rolls the id and,
 * as a last resort, appends a retry suffix, so a repeated id can never
 * reuse another run's workspace; and after creation the resolved run
 * directory must still live inside the validated runs root.
 */
export async function createIsolatedRun({ runsRoot, prefix = "", now = new Date() } = {}) {
  if (typeof runsRoot !== "string" || runsRoot.length === 0 || !path.isAbsolute(runsRoot)) {
    throw new InfrastructureError(`isolated runs root must be an absolute path, got ${JSON.stringify(runsRoot)}`);
  }

  if (prefix !== "" && !/^[A-Za-z0-9._-]+$/.test(prefix)) {
    throw new InfrastructureError(
      `isolated run prefix must be a single filename token (letters, digits, dot, dash, underscore), got ${JSON.stringify(prefix)}`
    );
  }

  try {
    await fsPromises.mkdir(runsRoot, { recursive: true });
  } catch (error) {
    throw new InfrastructureError(`cannot create the isolated runs root ${runsRoot}: ${error.message}`, { cause: error });
  }

  // The runs root must be a real directory, not a reparse point, and must
  // resolve to exactly the path it was given — a junction here (or in an
  // ancestor) would redirect every run outside the validated root.
  let rootEntry;

  try {
    rootEntry = await fsPromises.lstat(runsRoot);
  } catch (error) {
    throw new InfrastructureError(`cannot inspect the isolated runs root ${runsRoot}: ${error.message}`, { cause: error });
  }

  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new InfrastructureError(`isolated runs root ${runsRoot} must be a real directory (no symlinks/junctions)`);
  }

  const realRunsRoot = await fsPromises.realpath(runsRoot).catch((error) => {
    throw new InfrastructureError(`cannot resolve the isolated runs root ${runsRoot}: ${error.message}`, { cause: error });
  });

  if (!sameRealPath(realRunsRoot, runsRoot)) {
    throw new InfrastructureError(
      `isolated runs root ${runsRoot} resolves to ${realRunsRoot}; refusing to run inside a redirected root`
    );
  }

  let runId = null;
  let runDir = null;
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Re-roll the id every attempt and add a retry suffix as a final
    // disambiguator, so even a broken random source cannot make two runs
    // share one workspace.
    const candidateId = `${prefix}${createRunId(now)}${attempt > 0 ? `-r${attempt}` : ""}`;
    const candidateDir = path.join(runsRoot, candidateId);

    try {
      // EXCLUSIVE create: no recursive mkdir — an existing directory means
      // a collision, never a silent reuse.
      await fsPromises.mkdir(candidateDir);
      await fsPromises.mkdir(path.join(candidateDir, "workspace"));
      runId = candidateId;
      runDir = candidateDir;
      lastError = null;
      break;
    } catch (error) {
      if (error.code === "EEXIST") {
        lastError = error;
        continue;
      }
      throw new InfrastructureError(`cannot create the isolated run directory ${candidateDir}: ${error.message}`, { cause: error });
    }
  }

  if (runDir === null) {
    throw new InfrastructureError(`could not claim a unique isolated run directory under ${runsRoot} after 5 attempts`, {
      cause: lastError
    });
  }

  // Post-creation confinement: the resolved run directory must still be
  // inside the validated runs root.
  const realRunDir = await fsPromises.realpath(runDir).catch((error) => {
    throw new InfrastructureError(`cannot resolve the isolated run directory ${runDir}: ${error.message}`, { cause: error });
  });

  const relativeToRoot = path.relative(realRunsRoot, realRunDir);

  if (relativeToRoot === "" || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new InfrastructureError(
      `isolated run directory ${runDir} resolved to ${realRunDir}, outside the validated runs root; refusing to continue`
    );
  }

  const workspaceDir = path.join(runDir, "workspace");

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
 * the run never pretends a plain directory is a repo. The template
 * directory is removed on every exit path.
 */
export async function initializeWorkspaceRepo({ workspaceDir, gitBinary = "git", templateParentDir = os.tmpdir() }) {
  let emptyTemplate = null;

  try {
    emptyTemplate = mkdtempSync(path.join(templateParentDir, "packsmith-git-template-"));
    await fsPromises.writeFile(path.join(emptyTemplate, "empty.gitconfig"), "", "utf8");

    const env = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.toUpperCase().startsWith("GIT_")) {
        continue;
      }
      env[key] = value;
    }

    const emptyConfig = path.join(emptyTemplate, "empty.gitconfig");
    env.GIT_CONFIG_GLOBAL = emptyConfig;
    env.GIT_CONFIG_SYSTEM = emptyConfig;
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_TERMINAL_PROMPT = "0";
    env.GIT_TEMPLATE_DIR = emptyTemplate;

    const run = (args) => {
      const result = spawnSync(gitBinary, args, { cwd: workspaceDir, env, encoding: "utf8", timeout: 30000, windowsHide: true });

      if (result.error) {
        throw new InfrastructureError(`isolated git boundary requires the git binary (${gitBinary}): ${result.error.message}`, {
          cause: result.error
        });
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

    if (!sameRealPath(resolvedRoot, workspaceDir)) {
      throw new InfrastructureError(
        `isolated workspace git root resolved to ${resolvedRoot} instead of ${workspaceDir}; refusing to continue`
      );
    }

    return { gitRoot: path.resolve(workspaceDir), isolated: true };
  } finally {
    if (emptyTemplate !== null) {
      try {
        rmSync(emptyTemplate, { recursive: true, force: true });
      } catch {
        // The template dir is disposable; its removal must never mask the
        // run outcome, but it is attempted on EVERY exit path.
      }
    }
  }
}

/**
 * Build the fully isolated child environment for one run:
 *   - base.buildChildEnv(parentEnv, context) already drops parent session
 *     identity, vendor namespaces and Node hooks case-insensitively and
 *     pins HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR/TMP/TEMP;
 *   - this layer additionally strips ALL parent GIT_* context, pins
 *     APPDATA/LOCALAPPDATA and the XDG_CACHE/CONFIG/STATE/DATA_HOME
 *     directories to the case's private dirs, and reduces PATH to the
 *     execution minimum (System32 + the running Node's directory) so
 *     parent tool directories cannot leak executables into the run.
 * `context.env` is intentionally NOT extended here: authentication travels
 * through the file bridge (bridgeAuth), never through environment keys.
 *
 * Wiring: withIsolatedTriggerRun installs this builder as
 * `context.buildChildEnv`, and the Milestone 6 runner/probe call it for the
 * ACTUAL child process — the isolation is not just a helper for tests.
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
  env.XDG_DATA_HOME = caseDirs.data;

  const minimalPaths = [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32"), path.dirname(process.execPath)];
  env.PATH = minimalPaths.filter((entry) => entry.length > 0).join(path.delimiter);

  return env;
}

/**
 * Build the per-case private state directory set (created under the
 * exclusive OS-temp auth/state root): runtime state (CODEX_HOME /
 * CLAUDE_CONFIG_DIR target), home, cache, config, state, data,
 * appdata/localappdata and temp. All of it is disposable and cleaned up
 * after the run.
 */
export async function createCaseDirs({ privateRoot }) {
  const dirs = {
    runtimeState: path.join(privateRoot, "runtime-state"),
    home: path.join(privateRoot, "home"),
    cache: path.join(privateRoot, "cache"),
    config: path.join(privateRoot, "config"),
    state: path.join(privateRoot, "state"),
    data: path.join(privateRoot, "data"),
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
 * the explicitly whitelisted fields and delivers them as private state
 * files inside the case's runtime-state directory (which IS CODEX_HOME /
 * CLAUDE_CONFIG_DIR for the child) — no environment keys, no full config,
 * no MCP/hooks/projects, no other skills:
 *
 *   codex   → copy the parent auth.json verbatim into
 *             <runtimeState>/auth.json (Codex reads auth from CODEX_HOME);
 *   claude  → read the whitelisted env fields (auth token, endpoint, model
 *             routing) plus the top-level model selector from the parent
 *             settings.json and write a MINIMAL <runtimeState>/settings.json
 *             carrying only those fields. Hooks, MCP servers, permissions
 *             and every other configuration key are never copied.
 *
 * Parse/shape failures use FIXED sanitized diagnostics that never quote the
 * file content (an error message quoting JSON text would leak credentials
 * into retained metadata). The report carries the auth SOURCE TYPE, field
 * NAMES and PRESENCE only — values are never returned, logged, or written
 * anywhere inside the retained run directory. Parent files are opened
 * read-only and are never modified.
 */
export async function bridgeAuth({ runtimeId, codexAuthPath, claudeSettingsPath, runtimeStateDir }) {
  const report = { source: null, present: false, endpointPinned: false, modelPinned: false, fields: [], files: [] };

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

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      // Sanitized on purpose: JSON.parse error messages quote file content,
      // which may be credential material.
      throw new InfrastructureError(
        `parent Codex auth file ${codexAuthPath} is not valid JSON; refusing to bridge authentication`
      );
    }

    if (!isPlainObject(parsed)) {
      throw new InfrastructureError(
        `parent Codex auth file ${codexAuthPath} must contain a JSON object; refusing to bridge authentication`
      );
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
      // Sanitized: never quote the settings content.
      throw new InfrastructureError(
        `parent Claude settings ${claudeSettingsPath} is not valid JSON; refusing to bridge authentication`
      );
    }

    if (!isPlainObject(settings)) {
      throw new InfrastructureError(
        `parent Claude settings ${claudeSettingsPath} must contain a JSON object; refusing to bridge authentication`
      );
    }

    const parentEnv = isPlainObject(settings.env) ? settings.env : null;
    const bridgedEnv = {};

    if (parentEnv !== null) {
      for (const field of CLAUDE_BRIDGE_ENV_FIELDS) {
        if (!Object.hasOwn(parentEnv, field)) {
          continue;
        }

        const value = parentEnv[field];

        if (typeof value !== "string" || value.trim().length === 0) {
          throw new InfrastructureError(
            `parent Claude settings field env.${field} must be a non-empty string; refusing to bridge authentication`
          );
        }

        bridgedEnv[field] = value;
      }
    }

    let model = null;

    if (Object.hasOwn(settings, "model")) {
      if (typeof settings.model !== "string" || settings.model.trim().length === 0) {
        throw new InfrastructureError(
          `parent Claude settings field model must be a non-empty string; refusing to bridge authentication`
        );
      }
      model = settings.model;
    }

    // No controlled credential field present: report honestly instead of
    // guessing other keys or copying the whole settings file.
    if (!Object.hasOwn(bridgedEnv, "ANTHROPIC_AUTH_TOKEN")) {
      return report;
    }

    const minimal = { env: bridgedEnv, ...(model !== null ? { model } : {}) };
    const destination = path.join(runtimeStateDir, "settings.json");

    try {
      await fsPromises.writeFile(destination, `${JSON.stringify(minimal, null, 2)}\n`, { mode: 0o600 });
      await fsPromises.chmod(destination, 0o600).catch(() => {});
    } catch (error) {
      throw new InfrastructureError(`cannot stage the private Claude auth state: ${error.message}`, { cause: error });
    }

    report.present = true;
    report.endpointPinned = Object.hasOwn(bridgedEnv, "ANTHROPIC_BASE_URL");
    report.modelPinned = model !== null || Object.hasOwn(bridgedEnv, "ANTHROPIC_MODEL");
    report.fields = Object.keys(bridgedEnv).concat(model !== null ? ["model"] : []);
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
 * directory. Safety rules (acceptance round 2):
 *   - the workspace itself must be a real directory resolving to its own
 *     path (a junctioned workspace is refused);
 *   - EVERY destination ancestor (.agents, .agents/skills) is validated
 *     BEFORE and AFTER creation: no reparse points, resolved location
 *     exactly the workspace's own subtree — a pre-planted junction cannot
 *     redirect the install;
 *   - the source tree refuses symlinks/junctions and every entry (files
 *     AND directories) must resolve inside the source root;
 *   - the destination is created exclusively (an existing install is
 *     refused, never reused or overwritten);
 *   - after the copy, the destination's realpath must equal the path
 *     derived from the WORKSPACE's realpath (never the destination's own
 *     realpath, which a race-planted junction would satisfy);
 *   - failure cleanup is identity-guarded: only a directory still matching
 *     the expected real location is removed; an author file swapped in
 *     during a race, or anything resolving outside, is left untouched.
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

  let workspaceEntry;

  try {
    workspaceEntry = await fsPromises.lstat(workspaceDir);
  } catch (error) {
    throw new InfrastructureError(`cannot inspect the isolated workspace ${workspaceDir}: ${error.message}`, { cause: error });
  }

  if (workspaceEntry.isSymbolicLink() || !workspaceEntry.isDirectory()) {
    throw new InfrastructureError(`isolated workspace ${workspaceDir} must be a real directory (no symlinks/junctions)`);
  }

  const realWorkspace = await fsPromises.realpath(workspaceDir).catch((error) => {
    throw new InfrastructureError(`cannot resolve the isolated workspace ${workspaceDir}: ${error.message}`, { cause: error });
  });

  if (!sameRealPath(realWorkspace, workspaceDir)) {
    throw new InfrastructureError(
      `isolated workspace ${workspaceDir} resolves to ${realWorkspace}; refusing to install into a redirected workspace`
    );
  }

  // Source tree: real directory, correct name, no escapes.
  let sourceEntry;

  try {
    sourceEntry = await fsPromises.lstat(skillDir);
  } catch (error) {
    throw new InfrastructureError(`cannot inspect the skill source ${skillDir}: ${error.message}`, { cause: error });
  }

  if (sourceEntry.isSymbolicLink() || !sourceEntry.isDirectory()) {
    throw new InfrastructureError(`skill source ${skillDir} must be a real directory (no symlinks/junctions)`);
  }

  const realSourceRoot = await fsPromises.realpath(skillDir).catch((error) => {
    throw new InfrastructureError(`cannot resolve the skill source ${skillDir}: ${error.message}`, { cause: error });
  });

  if (path.basename(realSourceRoot) !== skillName) {
    throw new InfrastructureError(`skill source realpath ${realSourceRoot} does not match the skill name ${JSON.stringify(skillName)}`);
  }

  await assertNoEscapes(skillDir, realSourceRoot, "skill source");

  // Validate/create every destination ancestor inside the workspace.
  const relativeSegments = path.relative(workspaceDir, skillsRoot).split(path.sep);
  let accumulated = workspaceDir;

  for (const segment of relativeSegments) {
    accumulated = path.join(accumulated, segment);
    const expectedReal = path.join(realWorkspace, path.relative(workspaceDir, accumulated));
    let entry = null;

    try {
      entry = await fsPromises.lstat(accumulated);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new InfrastructureError(`cannot inspect ${accumulated}: ${error.message}`, { cause: error });
      }

      try {
        await fsPromises.mkdir(accumulated);
      } catch (mkdirError) {
        throw new InfrastructureError(`cannot create ${accumulated}: ${mkdirError.message}`, { cause: mkdirError });
      }

      entry = await fsPromises.lstat(accumulated);
    }

    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new InfrastructureError(`${accumulated} must be a real directory (no symlinks/junctions)`);
    }

    const realSegment = await fsPromises.realpath(accumulated).catch((error) => {
      throw new InfrastructureError(`cannot resolve ${accumulated}: ${error.message}`, { cause: error });
    });

    if (!sameRealPath(realSegment, expectedReal)) {
      throw new InfrastructureError(
        `${accumulated} resolves to ${realSegment}, outside the isolated workspace; refusing to install`
      );
    }
  }

  const destination = path.join(skillsRoot, skillName);
  const expectedRealDestination = path.join(realWorkspace, path.relative(workspaceDir, destination));

  try {
    // Exclusive create: an existing install is refused, never reused.
    await fsPromises.mkdir(destination);
    await fsPromises.cp(skillDir, destination, { recursive: true, verbatimSymlinks: false });
  } catch (error) {
    await removeOwnedDirectory(destination, expectedRealDestination);
    throw new InfrastructureError(`cannot install the skill into the isolated workspace: ${error.message}`, { cause: error });
  }

  try {
    const realDestination = await fsPromises.realpath(destination).catch((error) => {
      throw new InfrastructureError(`cannot resolve the installed skill ${destination}: ${error.message}`, { cause: error });
    });

    if (!sameRealPath(realDestination, expectedRealDestination)) {
      throw new InfrastructureError(
        `installed skill ${destination} resolves to ${realDestination}, outside the isolated workspace; refusing to continue`
      );
    }

    await assertNoEscapes(destination, expectedRealDestination, "installed skill");
  } catch (error) {
    await removeOwnedDirectory(destination, expectedRealDestination);
    throw error;
  }

  return { installDir: destination, skillName };
}

/**
 * Identity-guarded removal: only removes `dirPath` when it is (still) the
 * directory this run created at the expected real location; a symlink is
 * unlinked (never followed); anything else — an author file swapped in
 * during a race, a directory resolving elsewhere — is left untouched and
 * the refusal is reported.
 */
async function removeOwnedDirectory(dirPath, expectedRealPath) {
  let entry = null;

  try {
    entry = await fsPromises.lstat(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw new InfrastructureError(`cannot inspect ${dirPath} during cleanup: ${error.message}`, { cause: error });
  }

  if (entry.isSymbolicLink()) {
    await fsPromises.unlink(dirPath).catch((error) => {
      throw new InfrastructureError(`could not remove the reparse point ${dirPath}: ${error.message}`, { cause: error });
    });
    return;
  }

  const real = await fsPromises.realpath(dirPath).catch(() => null);

  if (real !== null && sameRealPath(real, expectedRealPath)) {
    await fsPromises.rm(dirPath, { recursive: true, force: true }).catch((error) => {
      throw new InfrastructureError(`could not remove the partial install ${dirPath}: ${error.message}`, { cause: error });
    });
    return;
  }

  throw new InfrastructureError(
    `refusing to remove ${dirPath}: it is no longer the directory this run created`
  );
}

/** Walk a tree refusing any reparse point and any entry (file OR directory)
 * resolving outside `realRoot` — the anti-escape check used for the skill
 * source and the installed artifact. Directory entries are realpath-checked
 * too; nothing is skipped. */
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

      try {
        real = await fsPromises.realpath(entryPath);
      } catch (error) {
        throw new InfrastructureError(`cannot resolve the ${label} entry ${entryPath}: ${error.message}`, { cause: error });
      }

      const relative = path.relative(realRoot, real);

      if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new InfrastructureError(`${label} entry ${entryPath} resolves outside ${realRoot}`);
      }

      if (entry.isDirectory()) {
        stack.push(entryPath);
      }
    }
  }
}

/**
 * Defense-in-depth CLI flags per runtime. These are appended to the
 * adapter's protocol arguments and recorded in runtime.json, but they are
 * NEVER treated as isolation evidence on their own (plan verification
 * record §13): the git boundary, private state directories and the minimal
 * environment are the actual isolation.
 *
 * Codex note (actual-discovery gate): `--ignore-user-config` is deliberately
 * NOT included. Empirically it drops EVERY skill — including the
 * workspace-local skill under test — so it neither isolates the user's
 * global skills nor leaves the target usable. Skill scoping is done instead
 * through the official `skills.config` path selectors (see
 * codex-skill-scope.mjs), which `withSkillScopeFlags` prepends as `-c`.
 */
export function isolationFlagsFor(runtimeId, { claudeSettingsPath } = {}) {
  if (runtimeId === "codex") {
    return ["--ephemeral", "--ignore-rules"];
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
      endpointPinned: metadata.auth?.endpointPinned === true,
      modelPinned: metadata.auth?.modelPinned === true,
      fields: metadata.auth?.fields ?? []
    },
    status: metadata.status ?? "prepared",
    skill: metadata.skill ?? null,
    repeat: metadata.repeat ?? null,
    skillScope: metadata.skillScope ?? null,
    notes: metadata.notes ?? []
  };

  await fsPromises.writeFile(runJsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

/** Marker file name inside a private state root proving entity identity. */
const PRIVATE_ROOT_MARKER = "owner-identity.json";

/** Capture the entity identity of a freshly created private state root. */
async function capturePrivateRootIdentity(privateRoot) {
  const entry = await fsPromises.lstat(privateRoot);
  const marker = randomUUID();
  const identity = { dev: entry.dev, ino: entry.ino, marker };

  // The marker lives INSIDE the root (TEMP, cleaned with the tree, never a
  // retained artifact). A replacement directory planted at the pathname
  // will not carry it.
  await fsPromises.writeFile(
    path.join(privateRoot, PRIVATE_ROOT_MARKER),
    `${JSON.stringify({ marker }, null, 2)}\n`,
    { mode: 0o600 }
  );

  return identity;
}

/**
 * Remove the private (non-retained) state of one run. OWNERSHIP IS
 * ENFORCED by identity, not by pathname: only directories that (a) this
 * process created and registered, (b) are named packsmith-run-private-*,
 * (c) live directly under the OS temp directory, and (d) STILL match the
 * registered entity (dev/ino + marker file) are eligible. A pathname whose
 * original entity was moved away and replaced must be preserved and the
 * mismatch surfaced — the public helper must never become a
 * "recursive-delete any path" primitive. A cleanup failure is
 * infrastructure: nothing may claim a cleanup that did not happen.
 */
export async function cleanupPrivateState(privateRoot) {
  const resolved = path.resolve(privateRoot);
  const tempRoot = path.resolve(os.tmpdir());

  if (path.basename(resolved).length < "packsmith-run-private-".length ||
      !path.basename(resolved).startsWith("packsmith-run-private-")) {
    throw new InfrastructureError(`refusing to clean up ${resolved}: it is not a packsmith private state root`);
  }

  if (path.dirname(resolved).toLowerCase() !== tempRoot.toLowerCase()) {
    throw new InfrastructureError(`refusing to clean up ${resolved}: private state roots must live directly under the OS temp directory`);
  }

  const identity = ownedPrivateRoots.get(resolved);

  if (!identity) {
    throw new InfrastructureError(`refusing to clean up ${resolved}: this root was not created by this run`);
  }

  let entry = null;

  try {
    entry = await fsPromises.lstat(resolved);
  } catch (error) {
    if (error.code === "ENOENT") {
      ownedPrivateRoots.delete(resolved);
      return;
    }
    throw new InfrastructureError(`cannot inspect the private state root ${resolved}: ${error.message}`, { cause: error });
  }

  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new InfrastructureError(`refusing to clean up ${resolved}: it is no longer the directory this run created`);
  }

  // Entity identity: the entry at the registered pathname must still be the
  // SAME directory (dev/ino) AND carry this run's marker file. A real
  // directory swapped in by someone else is preserved, never deleted.
  if (entry.dev !== identity.dev || entry.ino !== identity.ino) {
    throw new InfrastructureError(
      `refusing to clean up ${resolved}: the directory at this path was replaced after registration; the replacement was preserved`
    );
  }

  let marker;

  try {
    marker = JSON.parse(await fsPromises.readFile(path.join(resolved, PRIVATE_ROOT_MARKER), "utf8"));
  } catch {
    throw new InfrastructureError(
      `refusing to clean up ${resolved}: the identity marker of the registered directory is missing or unreadable; the directory was preserved`
    );
  }

  if (marker?.marker !== identity.marker) {
    throw new InfrastructureError(
      `refusing to clean up ${resolved}: the identity marker does not match this run; the directory was preserved`
    );
  }

  try {
    await fsPromises.rm(resolved, { recursive: true, force: true });
  } catch (error) {
    throw new InfrastructureError(`could not remove the private state root ${resolved}: ${error.message}`, { cause: error });
  }

  ownedPrivateRoots.delete(resolved);
}

/**
 * Convenience orchestrator for one isolated trigger run: creates the run
 * skeleton (with ALL six artifact files present from the start — empty
 * stdout/stderr until the CLI writes them), the private state root, the
 * real git boundary, the minimal auth bridge, and installs the skill under
 * test; then hands the caller a fully isolated trigger context compatible
 * with the Milestone 6 adapters (`requireTriggerContext`-valid,
 * `isolationFlags` included, and `buildChildEnv` wired so the ACTUAL child
 * process — probe and run — receives the isolated environment). After the
 * callback, runtime.json and result.json are written with the ACTUAL
 * observed status/version, and the private state is always cleaned — a
 * cleanup failure flips the recorded status to a truthful failure instead
 * of letting an "executed" record stand beside an uncleaned secret root.
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
  env: extraEnv,
  now,
  run: runCallback
}) {
  if (typeof runCallback !== "function") {
    throw new InfrastructureError("withIsolatedTriggerRun requires a run callback");
  }

  const run = await createIsolatedRun({ runsRoot, now });
  let privateRoot = null;
  let bridge = { source: null, present: false, endpointPinned: false, modelPinned: false, fields: [], files: [] };
  let caseDirs = null;
  let installed = null;

  try {
    // Private root creation is INSIDE the guarded section so a failure here
    // still records truthful run metadata instead of leaving a skeleton.
    privateRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "packsmith-run-private-"));
    const privateRootResolved = path.resolve(privateRoot);
    ownedPrivateRoots.set(privateRootResolved, await capturePrivateRootIdentity(privateRoot));

    caseDirs = await createCaseDirs({ privateRoot });

    // All six artifact files exist from the very beginning — a setup
    // failure leaves empty logs rather than missing files.
    await fsPromises.writeFile(run.paths.stdoutLog, Buffer.alloc(0));
    await fsPromises.writeFile(run.paths.stderrLog, Buffer.alloc(0));
    await fsPromises.writeFile(run.paths.eventsJsonl, Buffer.alloc(0));

    await initializeWorkspaceRepo({ workspaceDir: run.paths.workspace });
    bridge = await bridgeAuth({ runtimeId, codexAuthPath, claudeSettingsPath, runtimeStateDir: caseDirs.runtimeState });

    if (runtimeId === "codex" || runtimeId === "claude-code") {
      installed = await installSkill({ workspaceDir: run.paths.workspace, runtimeId, skillDir });
    }

    const baseFlags = isolationFlagsFor(runtimeId, {
      claudeSettingsPath: path.join(caseDirs.runtimeState, "settings.json")
    });

    // Codex actual-discovery isolation: the OS-home user root is not
    // governed by HOME/USERPROFILE/CODEX_HOME, so the real user's global
    // skills stay discoverable. Audit (no model) what the CLI would offer
    // and disable every non-target skill through the official skills.config
    // selectors, keeping the skill under test available. A failure here is
    // infrastructure — the run never proceeds without proven scoping.
    let skillScope = null;
    let flags = baseFlags;

    if (runtimeId === "codex" && installed !== null) {
      skillScope = await establishCodexSkillScope({
        workspaceDir: run.paths.workspace,
        skillName: installed.skillName,
        binaryPath: binaryPath ?? "codex",
        binaryArgs,
        env: buildIsolatedChildEnv(process.env, {
          workspaceDir: run.paths.workspace,
          traceDir: run.runDir,
          homeDir: caseDirs.home,
          runtimeStateDir: caseDirs.runtimeState,
          tempDir: caseDirs.temp,
          timeoutMs,
          env: extraEnv
        }, caseDirs),
        timeoutMs: Math.min(timeoutMs, 120000)
      });
      flags = withSkillScopeFlags(baseFlags, skillScope.scopeConfigValue);
    }

    const context = {
      workspaceDir: run.paths.workspace,
      traceDir: run.runDir,
      homeDir: caseDirs.home,
      runtimeStateDir: caseDirs.runtimeState,
      tempDir: caseDirs.temp,
      timeoutMs,
      ...(binaryPath !== undefined ? { binaryPath } : {}),
      ...(binaryArgs !== undefined ? { binaryArgs } : {}),
      isolationFlags: flags,
      caseDirs,
      ...(skillScope !== null ? { skillScope: { availableSkills: skillScope.availableSkills, scopedSkills: skillScope.scopedSkills, targetLocator: skillScope.targetLocator } } : {}),
      // The ACTUAL child process (probe and run) must receive the isolated
      // environment — the M6 runner consults this builder.
      buildChildEnv: (parentEnv, builderContext) => buildIsolatedChildEnv(parentEnv, builderContext, caseDirs)
    };

    const result = await runCallback({ context, run, caseDirs, bridge, installed });

    let triggerStatus = null;
    let runtimeVersion = null;

    if (isTriggerResultLike(result)) {
      triggerStatus = result.status;
      runtimeVersion = result.runtimeVersion ?? null;
      await fsPromises.writeFile(run.paths.resultJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else {
      await fsPromises.writeFile(
        run.paths.resultJson,
        `${JSON.stringify({ schemaVersion: 1, status: "executed" }, null, 2)}\n`,
        "utf8"
      );
    }

    await writeRuntimeMetadata(run.paths.runtimeJson, {
      runtime: runtimeId,
      runtimeVersion,
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
      status: triggerStatus ?? "executed",
      skill: installed?.skillName ?? null,
      skillScope: skillScope !== null ? { availableSkills: skillScope.availableSkills, scopedSkills: skillScope.scopedSkills, targetLocator: skillScope.targetLocator } : null,
      notes:
        skillScope !== null
          ? skillScope.notes
          : []
    });

    // Cleanup belongs to the success path: a failure here must flip the
    // recorded status — an "executed" record may not stand next to an
    // uncleaned private root holding auth material.
    try {
      await cleanupPrivateState(privateRoot);
    } catch (cleanupError) {
      await writeRuntimeMetadata(run.paths.runtimeJson, {
        runtime: runtimeId,
        runtimeVersion,
        flags,
        provenance: "isolation: plan §17",
        contextPaths: {
          workspaceDir: run.paths.workspace,
          homeDir: caseDirs.home,
          runtimeStateDir: caseDirs.runtimeState,
          tempDir: caseDirs.temp,
          traceDir: run.runDir
        },
        auth: bridge,
        status: `failed: cleanup: ${cleanupError.message.slice(0, 180)}`,
        skill: installed?.skillName ?? null,
        notes: ["private state cleanup failed; the run outcome above did not include it"]
      }).catch(() => {});
      // Mark the error so the outer catch does not clobber the truthful
      // cleanup-failure status with a generic one.
      cleanupError.cleanupFailureRecorded = true;
      throw cleanupError;
    }

    return { result, runDir: run.runDir, runId: run.runId, context };
  } catch (error) {
    // Failure keeps the retained artifacts truthful and partial: an
    // infrastructure result and a failed-status metadata record. Error
    // messages from the auth bridge are sanitized at the source; other
    // failures carry ordinary fs/OS diagnostics (paths, not credentials).
    try {
      await fsPromises.writeFile(
        run.paths.resultJson,
        `${JSON.stringify(
          { schemaVersion: 1, status: "infra_error", runtime: runtimeId, error: { message: error.message } },
          null,
          2
        )}\n`,
        "utf8"
      );

      // A recorded cleanup failure already flipped runtime.json to a
      // truthful status — do not clobber it with a generic failure record.
      if (error.cleanupFailureRecorded !== true) {
        await writeRuntimeMetadata(run.paths.runtimeJson, {
          runtime: runtimeId,
          flags: [],
          provenance: "isolation: plan §17",
          contextPaths: caseDirs
            ? {
                workspaceDir: run.paths.workspace,
                homeDir: caseDirs.home,
                runtimeStateDir: caseDirs.runtimeState,
                tempDir: caseDirs.temp,
                traceDir: run.runDir
              }
            : {},
          auth: bridge,
          status: `failed: ${error.message.slice(0, 200)}`,
          notes: []
        });
      }
    } catch {
      // runtime.json write is best-effort on the failure path; the thrown
      // error below is the truthful outcome.
    }
    if (error !== null && typeof error === "object") error.runDir = run.runDir;
    throw error;
  } finally {
    if (privateRoot !== null && ownedPrivateRoots.has(path.resolve(privateRoot))) {
      await cleanupPrivateState(privateRoot).catch(() => {});
    }
  }
}

function isTriggerResultLike(value) {
  return (
    isPlainObject(value) &&
    TRIGGER_STATUSES.includes(value.status) &&
    typeof value.runtime === "string"
  );
}
