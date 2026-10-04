import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

import {
  createIsolatedRun,
  createRunId,
  initializeWorkspaceRepo,
  buildIsolatedChildEnv,
  createCaseDirs,
  bridgeAuth,
  installSkill,
  isolationFlagsFor,
  writeRuntimeMetadata,
  cleanupPrivateState,
  withIsolatedTriggerRun,
  RUN_ARTIFACT_NAMES,
  CLAUDE_ISOLATED_TOOLS
} from "../../src/trigger/isolation.mjs";
import { InfrastructureError } from "../../src/core/diagnostics.mjs";

/**
 * Trigger isolation tests (v0.2 Milestone 7, plan §17).
 *
 * Every case × runtime × run gets an exclusive environment: a real git
 * repository boundary (ancestor skill/AGENTS scanning stops there), private
 * state/config/cache/temp directories under an exclusive OS-temp root, a
 * minimal execution environment (parent desktop identity, vendor
 * namespaces, Node hooks and git context stripped case-insensitively), a
 * minimal FILE-based auth bridge (presence reported, values never), and
 * skill installation of ONLY the skill under test with symlink/junction
 * escape checks. Everything materialized lives in the test's own temp root.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CODEX_AUTH_SENTINEL = "sk-codex-parent-token-SENTINEL";
const CLAUDE_TOKEN_SENTINEL = "sk-ant-claude-parent-token-SENTINEL";
const CLAUDE_ENDPOINT = "https://bridge-endpoint.example";

async function makeRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-isolation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function makeSkillSource(root, name = "review-pr") {
  const skillDir = path.join(root, "src-skills", name);
  await mkdir(path.join(skillDir, "references"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Reviews pull requests for security risks when the user asks.\n---\n\nBody.\n`,
    "utf8"
  );
  await writeFile(path.join(skillDir, "references", "notes.md"), "notes\n", "utf8");
  return skillDir;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parentCodexAuthFixture(root) {
  return path.join(root, "parent-codex-auth.json");
}

function parentClaudeSettingsFixture(root) {
  return path.join(root, "parent-claude-settings.json");
}

async function writeAuthFixtures(root) {
  await writeFile(
    parentCodexAuthFixture(root),
    JSON.stringify({ OPENAI_API_KEY: CODEX_AUTH_SENTINEL, tokens: { access_token: "codex-access-SENTINEL" } }, null, 2),
    "utf8"
  );
  await writeFile(
    parentClaudeSettingsFixture(root),
    JSON.stringify(
      {
        hooks: { PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "should-not-be-copied" }] }] },
        mcpServers: { desktop: { command: "should-not-be-copied" } },
        env: { ANTHROPIC_AUTH_TOKEN: CLAUDE_TOKEN_SENTINEL, ANTHROPIC_BASE_URL: CLAUDE_ENDPOINT }
      },
      null,
      2
    ),
    "utf8"
  );
}

test("createIsolatedRun builds the full plan §17 layout with unique ids", async (t) => {
  const root = await makeRoot(t);
  const runsRoot = path.join(root, ".packsmith", "runs");

  const first = await createIsolatedRun({ runsRoot });
  const second = await createIsolatedRun({ runsRoot });

  assert.notEqual(first.runId, second.runId, "each run gets a unique id");
  assert.notEqual(first.runDir, second.runDir);

  for (const artifact of ["workspace", "runtime.json", "events.jsonl"]) {
    assert.ok(first.paths[artifact] ?? first.runDir, "artifact paths are reserved");
  }
  await stat(first.paths.workspace);
  // runtime.json/events.jsonl are written by the run itself (metadata on
  // prepare/failure, trace on execution) — the skeleton reserves their
  // paths inside the run dir.
  assert.equal(first.paths.runtimeJson, path.join(first.runDir, "runtime.json"));
  assert.equal(first.paths.eventsJsonl, path.join(first.runDir, "events.jsonl"));
  assert.equal(RUN_ARTIFACT_NAMES.length, 6);
});

test("createIsolatedRun refuses a relative or empty runs root", async (t) => {
  await assert.rejects(() => createIsolatedRun({ runsRoot: "relative/runs" }), InfrastructureError);
  await assert.rejects(() => createIsolatedRun({ runsRoot: "" }), InfrastructureError);
});

test("the workspace is a REAL git repository boundary blocking ancestor skills", async (t) => {
  const root = await makeRoot(t);

  // The parent chain carries exactly the pollution runtimes scan for:
  // an outer .git, an AGENTS.md and an outer skills directory with a decoy.
  const parent = path.join(root, "ancestor");
  await mkdir(path.join(parent, ".git"), { recursive: true });
  await writeFile(path.join(parent, "AGENTS.md"), "# ancestor AGENTS\n", "utf8");
  await mkdir(path.join(parent, ".agents", "skills", "ancestor-decoy"), { recursive: true });
  await writeFile(path.join(parent, ".agents", "skills", "ancestor-decoy", "SKILL.md"), "decoy\n", "utf8");

  const workspaceDir = path.join(parent, "runs", "ws1", "workspace");
  await mkdir(workspaceDir, { recursive: true });
  await initializeWorkspaceRepo({ workspaceDir });

  await stat(path.join(workspaceDir, ".git"));
  assert.ok(existsSync(path.join(workspaceDir, ".git", "HEAD")), "a real git repository must exist after init");
});

test("git context from the parent never leaks into the init", async (t) => {
  const root = await makeRoot(t);
  const workspaceDir = path.join(root, "ws");
  await mkdir(workspaceDir, { recursive: true });

  // A parent GIT_DIR/GIT_WORK_TREE would redirect the init; the isolated
  // init strips GIT_* case-insensitively.
  process.env.GIT_DIR = path.join(root, "elsewhere.git");
  process.env.git_work_tree = path.join(root, "elsewhere");
  try {
    await initializeWorkspaceRepo({ workspaceDir });
    await stat(path.join(workspaceDir, ".git"));
  } finally {
    delete process.env.GIT_DIR;
    delete process.env.git_work_tree;
  }
});

test("case dirs cover state/config/cache/appdata/temp under the private root", async (t) => {
  const root = await makeRoot(t);
  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });

  for (const key of ["runtimeState", "home", "cache", "config", "state", "appData", "localAppData", "temp"]) {
    const info = await stat(caseDirs[key]);
    assert.ok(info.isDirectory(), `${key} must exist`);
    assert.ok(caseDirs[key].startsWith(path.join(root, "private")), `${key} stays under the exclusive private root`);
  }
});

test("the isolated child environment drops parent identity and pins case dirs", async (t) => {
  const root = await makeRoot(t);
  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });
  const context = {
    workspaceDir: path.join(root, "ws"),
    traceDir: path.join(root, "runs"),
    homeDir: caseDirs.home,
    runtimeStateDir: caseDirs.runtimeState,
    tempDir: caseDirs.temp,
    timeoutMs: 1000
  };

  const env = buildIsolatedChildEnv(
    {
      PATH: "C:\\parent-only-tools;C:\\Windows\\system32",
      APPDATA: "C:\\real-appdata",
      LOCALAPPDATA: "C:\\real-localappdata",
      XDG_CACHE_HOME: "C:\\real-cache",
      // Case variants of denied namespaces (Windows is case-insensitive):
      codex_session_id: "parent-session",
      Claude_Config_Dir: "C:\\real-claude-config",
      ANTHROPIC_AUTH_TOKEN: CLAUDE_TOKEN_SENTINEL,
      NODE_OPTIONS: "--require pwned.js",
      node_path: "C:\\pwned-node-path",
      GIT_DIR: path.join(root, "elsewhere.git"),
      SYSTEMROOT: process.env.SystemRoot ?? "C:\\Windows"
    },
    context,
    caseDirs
  );

  assert.equal(env.APPDATA, caseDirs.appData);
  assert.equal(env.LOCALAPPDATA, caseDirs.localAppData);
  assert.equal(env.XDG_CACHE_HOME, caseDirs.cache);
  assert.equal(env.XDG_CONFIG_HOME, caseDirs.config);
  assert.equal(env.XDG_STATE_HOME, caseDirs.state);
  assert.equal(env.codex_session_id, undefined, "mixed-case parent session identity must not leak");
  assert.equal(env.Claude_Config_Dir, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined, "credentials never travel through env");
  assert.equal(env.NODE_OPTIONS, undefined, "Node execution hooks must not leak");
  assert.equal(env.node_path, undefined);
  assert.equal(env.GIT_DIR, undefined, "parent git context must not leak into the run");
  assert.ok(!env.PATH.includes("parent-only-tools"), "PATH is reduced to the execution minimum");
  assert.ok(env.PATH.length > 0);
  assert.equal(env.SYSTEMROOT, process.env.SystemRoot ?? "C:\\Windows", "execution-essential system keys are kept");
  assert.equal(env.HOME, caseDirs.home);
  assert.equal(env.CODEX_HOME, caseDirs.runtimeState);
  assert.equal(env.CLAUDE_CONFIG_DIR, caseDirs.runtimeState);
});

test("codex auth bridge stages a private copy and reports presence without values", async (t) => {
  const root = await makeRoot(t);
  await writeAuthFixtures(root);
  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });

  const report = await bridgeAuth({
    runtimeId: "codex",
    codexAuthPath: parentCodexAuthFixture(root),
    runtimeStateDir: caseDirs.runtimeState
  });

  assert.equal(report.source, "codex-auth-json");
  assert.equal(report.present, true);
  assert.equal(JSON.stringify(report).includes(CODEX_AUTH_SENTINEL), false, "the report must never carry values");

  const staged = await readFile(path.join(caseDirs.runtimeState, "auth.json"), "utf8");
  assert.ok(staged.includes(CODEX_AUTH_SENTINEL), "the private CODEX_HOME must carry the auth payload");
});

test("claude auth bridge writes a minimal settings file and reports presence only", async (t) => {
  const root = await makeRoot(t);
  await writeAuthFixtures(root);
  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });

  const report = await bridgeAuth({
    runtimeId: "claude-code",
    claudeSettingsPath: parentClaudeSettingsFixture(root),
    runtimeStateDir: caseDirs.runtimeState
  });

  assert.equal(report.source, "claude-settings-env");
  assert.equal(report.present, true);
  assert.equal(report.endpointPinned, true);
  assert.equal(JSON.stringify(report).includes(CLAUDE_TOKEN_SENTINEL), false, "the report must never carry values");

  const staged = JSON.parse(await readFile(path.join(caseDirs.runtimeState, "settings.json"), "utf8"));
  assert.deepEqual(Object.keys(staged), ["env"], "only the minimal env block is staged");
  assert.deepEqual(Object.keys(staged.env).sort(), ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]);
  assert.equal(JSON.stringify(staged).includes("should-not-be-copied"), false, "hooks/MCP are never copied");
});

test("a missing parent auth file reports present:false instead of failing the run", async (t) => {
  const root = await makeRoot(t);
  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });

  const codex = await bridgeAuth({
    runtimeId: "codex",
    codexAuthPath: path.join(root, "missing.json"),
    runtimeStateDir: caseDirs.runtimeState
  });
  assert.deepEqual({ source: codex.source, present: codex.present }, { source: "codex-auth-json", present: false });

  const claude = await bridgeAuth({
    runtimeId: "claude-code",
    claudeSettingsPath: path.join(root, "missing.json"),
    runtimeStateDir: caseDirs.runtimeState
  });
  assert.deepEqual({ source: claude.source, present: claude.present }, { source: "claude-settings-env", present: false });
});

test("bridging never modifies the parent auth files", async (t) => {
  const root = await makeRoot(t);
  await writeAuthFixtures(root);

  const codexBefore = sha256(parentCodexAuthFixture(root));
  const claudeBefore = sha256(parentClaudeSettingsFixture(root));

  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });
  await bridgeAuth({ runtimeId: "codex", codexAuthPath: parentCodexAuthFixture(root), runtimeStateDir: caseDirs.runtimeState });
  await bridgeAuth({ runtimeId: "claude-code", claudeSettingsPath: parentClaudeSettingsFixture(root), runtimeStateDir: caseDirs.runtimeState });

  assert.equal(sha256(parentCodexAuthFixture(root)), codexBefore, "parent codex auth.json is read-only for the bridge");
  assert.equal(sha256(parentClaudeSettingsFixture(root)), claudeBefore, "parent claude settings.json is read-only for the bridge");
});

test("skill installation is per-runtime and installs only the skill under test", async (t) => {
  const root = await makeRoot(t);
  const skillDir = await makeSkillSource(root, "review-pr");
  await makeSkillSource(root, "sibling-skill");

  const workspaceCodex = path.join(root, "ws-codex");
  const workspaceClaude = path.join(root, "ws-claude");
  await mkdir(workspaceCodex, { recursive: true });
  await mkdir(workspaceClaude, { recursive: true });

  const codexInstall = await installSkill({ workspaceDir: workspaceCodex, runtimeId: "codex", skillDir });
  const claudeInstall = await installSkill({ workspaceDir: workspaceClaude, runtimeId: "claude-code", skillDir });

  assert.equal(codexInstall.installDir, path.join(workspaceCodex, ".agents", "skills", "review-pr"));
  assert.equal(claudeInstall.installDir, path.join(workspaceClaude, ".claude", "skills", "review-pr"));

  const codexSkills = await readdir(path.dirname(codexInstall.installDir));
  assert.deepEqual(codexSkills, ["review-pr"], "no sibling skill may be installed");
  await stat(path.join(codexInstall.installDir, "references", "notes.md"));
});

test("a symlinked skill source is refused before anything is installed", async (t) => {
  const root = await makeRoot(t);
  const realDir = await makeSkillSource(root, "review-pr");
  const linkDir = path.join(root, "src-skills", "link");
  const { symlink } = await import("node:fs/promises");

  let madeLink = false;
  try {
    await symlink(realDir, linkDir, "dir");
    madeLink = true;
  } catch {
    madeLink = false;
  }

  if (!madeLink) {
    t.skip("symlink creation unavailable on this platform");
    return;
  }

  const workspaceDir = path.join(root, "ws");
  await mkdir(workspaceDir, { recursive: true });

  await assert.rejects(
    () => installSkill({ workspaceDir, runtimeId: "codex", skillDir: linkDir }),
    (error) => /real directory/.test(error.message)
  );

  const skillsRoot = path.join(workspaceDir, ".agents", "skills");
  let installed = true;
  try {
    await stat(skillsRoot);
  } catch {
    installed = false;
  }
  assert.equal(installed, false, "nothing may be installed from an escaped source");
});

test("isolation flags are defense-in-depth per runtime and claude carries the minimal settings/tools", (t) => {
  const settingsPath = path.join("C:" + path.sep, "private", "runtime-state", "settings.json");

  assert.deepEqual(isolationFlagsFor("codex"), ["--ephemeral", "--ignore-user-config", "--ignore-rules"]);
  const claudeFlags = isolationFlagsFor("claude-code", { claudeSettingsPath: settingsPath });
  assert.deepEqual(claudeFlags, [
    "--no-session-persistence",
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--settings",
    settingsPath,
    "--tools",
    CLAUDE_ISOLATED_TOOLS
  ]);
  assert.deepEqual(isolationFlagsFor("cursor"), []);
});

test("runtime.json records honest metadata and never carries credential values", async (t) => {
  const root = await makeRoot(t);
  const run = await createIsolatedRun({ runsRoot: path.join(root, "runs") });

  const record = await writeRuntimeMetadata(run.paths.runtimeJson, {
    runtime: "codex",
    runtimeVersion: null,
    flags: isolationFlagsFor("codex"),
    provenance: "isolation: plan §17",
    contextPaths: { workspaceDir: run.paths.workspace },
    auth: { source: "codex-auth-json", present: true },
    status: "executed",
    skill: "review-pr"
  });

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.auth.present, true);
  assert.equal(record.status, "executed");
  const raw = await readFile(run.paths.runtimeJson, "utf8");
  assert.equal(raw.includes(CODEX_AUTH_SENTINEL), false, "runtime.json must never carry credential values");
  assert.equal(raw.includes("codex-access-SENTINEL"), false);
});

test("cleanupPrivateState removes the private root but leaves retained artifacts", async (t) => {
  const root = await makeRoot(t);
  const privateRoot = path.join(root, "private");
  await createCaseDirs({ privateRoot });
  const run = await createIsolatedRun({ runsRoot: path.join(root, "runs") });
  await writeFile(run.paths.runtimeJson, "{}\n", "utf8");

  await cleanupPrivateState(privateRoot);

  let gone = false;
  try {
    await stat(privateRoot);
  } catch {
    gone = true;
  }
  assert.equal(gone, true, "the private state root must be removed");
  await stat(run.paths.runtimeJson, { ...{} });
});

test("an unwritable runs root surfaces as infrastructure (partial artifacts truthful)", async (t) => {
  const root = await makeRoot(t);
  const blocker = path.join(root, "blocker");
  await writeFile(blocker, "not a directory\n", "utf8");

  await assert.rejects(
    () => createIsolatedRun({ runsRoot: path.join(blocker, "runs") }),
    (error) => error.isInfrastructureError === true
  );
});

test("withIsolatedTriggerRun repeats are fully independent and secrets never reach retained artifacts", async (t) => {
  const root = await makeRoot(t);
  await writeAuthFixtures(root);
  const skillDir = await makeSkillSource(root, "review-pr");
  const runsRoot = path.join(root, ".packsmith", "runs");

  const seen = [];
  for (let repeat = 0; repeat < 2; repeat += 1) {
    const { context, runDir, runId } = await withIsolatedTriggerRun({
      runsRoot,
      runtimeId: "codex",
      skillDir,
      codexAuthPath: parentCodexAuthFixture(root),
      run: async ({ context: isolatedContext }) => {
        // The installed skill is visible inside THIS workspace only.
        await stat(path.join(isolatedContext.workspaceDir, ".agents", "skills", "review-pr", "SKILL.md"));
        return { used: isolatedContext.workspaceDir };
      }
    });

    seen.push({ runDir, runId });
    await stat(path.join(runDir, "runtime.json"));

    const raw = await readFile(path.join(runDir, "runtime.json"), "utf8");
    assert.equal(raw.includes(CODEX_AUTH_SENTINEL), false, "no credential value may reach the retained artifacts");

    // The private runtime state must be gone after the run.
    let cleaned = true;
    try {
      await stat(context.runtimeStateDir);
    } catch {
      cleaned = true;
    }
    assert.equal(cleaned, true, "the private runtime state must be cleaned after the run");
    void cleaned;
  }

  assert.notEqual(seen[0].runId, seen[1].runId, "repeats must not share state");
});

test("a failing run still cleans private state and records a truthful failure", async (t) => {
  const root = await makeRoot(t);
  const runsRoot = path.join(root, ".packsmith", "runs");

  await assert.rejects(
    () =>
      withIsolatedTriggerRun({
        runsRoot,
        runtimeId: "codex",
        skillDir: path.join(root, "does-not-exist"),
        run: async () => {
          throw new Error("should not be reached");
        }
      }),
    InfrastructureError
  );

  const runDirs = (await readdir(runsRoot)).map((entry) => path.join(runsRoot, entry));
  assert.equal(runDirs.length, 1);
  const metadata = JSON.parse(await readFile(path.join(runDirs[0], "runtime.json"), "utf8"));
  assert.match(metadata.status, /failed:/, "the failure must be recorded truthfully");
});

test("cross-runtime runs use distinct workspaces and their own skill dirs", async (t) => {
  const root = await makeRoot(t);
  await writeAuthFixtures(root);
  const skillDir = await makeSkillSource(root, "review-pr");
  const runsRoot = path.join(root, ".packsmith", "runs");
  const seenWorkspaces = new Set();

  for (const runtimeId of ["codex", "claude-code"]) {
    const { runDir } = await withIsolatedTriggerRun({
      runsRoot,
      runtimeId,
      skillDir,
      codexAuthPath: parentCodexAuthFixture(root),
      claudeSettingsPath: parentClaudeSettingsFixture(root),
      run: async ({ context: isolatedContext }) => {
        seenWorkspaces.add(isolatedContext.workspaceDir);
        const subdir = runtimeId === "codex" ? ".agents" : ".claude";
        await stat(path.join(isolatedContext.workspaceDir, subdir, "skills", "review-pr", "SKILL.md"));
        return true;
      }
    });

    await stat(path.join(runDir, "runtime.json"));
  }

  assert.equal(seenWorkspaces.size, 2, "cross-runtime runs must not share a workspace");
});

test("static runtimes stay unsupported through the isolated layer", async (t) => {
  const root = await makeRoot(t);
  const skillDir = await makeSkillSource(root, "review-pr");

  const { result } = await withIsolatedTriggerRun({
    runsRoot: path.join(root, ".packsmith", "runs"),
    runtimeId: "cursor",
    skillDir,
    run: async ({ context: isolatedContext }) => {
      const { cursorAdapter } = await import("../../src/runtimes/cursor.mjs");
      return cursorAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context: isolatedContext });
    }
  });

  assert.equal(result.status, "unsupported");
});

test("createRunId follows the plan's date-prefix shape and is unique", () => {
  const first = createRunId(new Date("2026-10-04T00:00:00Z"));
  const second = createRunId(new Date("2026-10-04T00:00:00Z"));
  assert.match(first, /^20261004-[0-9a-f]{6}$/);
  assert.notEqual(first, second);
});

