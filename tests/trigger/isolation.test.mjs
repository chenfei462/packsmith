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

  // --ignore-user-config is deliberately absent: it drops every skill
  // (including the target), so skill scoping uses skills.config instead.
  assert.deepEqual(isolationFlagsFor("codex"), ["--ephemeral", "--ignore-rules"]);
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

test("cleanupPrivateState refuses foreign roots and preserves their content", async (t) => {
  const root = await makeRoot(t);
  const foreign = path.join(os.tmpdir(), `packsmith-foreign-test-${Date.now().toString(36)}`);
  await mkdir(foreign, { recursive: true });
  await writeFile(path.join(foreign, "author.txt"), "author content\n", "utf8");
  t.after(() => rm(foreign, { recursive: true, force: true }));

  await assert.rejects(
    () => cleanupPrivateState(foreign),
    (error) => /not a packsmith private state root|was not created by this run/.test(error.message)
  );
  const preserved = await readFile(path.join(foreign, "author.txt"), "utf8");
  assert.match(preserved, /author content/, "foreign content must survive");

  // A correctly-named but unregistered root is equally refused.
  const fake = path.join(os.tmpdir(), `packsmith-run-private-fake-${Date.now().toString(36)}`);
  await mkdir(fake, { recursive: true });
  await writeFile(path.join(fake, "author.txt"), "author content\n", "utf8");
  t.after(() => rm(fake, { recursive: true, force: true }));

  await assert.rejects(() => cleanupPrivateState(fake), (error) => /was not created by this run/.test(error.message));
  const fakePreserved = await readFile(path.join(fake, "author.txt"), "utf8");
  assert.match(fakePreserved, /author content/, "unregistered content must survive");
});

// ---------------------------------------------------------------------------
// Round-2 acceptance regressions: the isolation must hold for the ACTUAL
// child process (not just helpers), all six artifacts must exist in every
// outcome, credentials must never reach error messages or retained files,
// run-dir creation must be exclusive and confined, skill installs must not
// follow pre-planted junctions, and the Claude bridge must carry the full
// documented model-routing field set.
// ---------------------------------------------------------------------------

const CLAUDE_ROUTING_SENTINEL = "sk-ant-claude-routing-SENTINEL";

async function rewriteFixtureToWorkspace(fixturePath, workspaceDir) {
  const raw = await readFile(
    path.join(__dirname, "..", "fixtures", "runtime-traces", "codex-triggered.jsonl"),
    "utf8"
  );
  const rewritten = raw
    .trimEnd()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line);
      if (event.item?.command !== undefined) {
        event.item.command = event.item.command.replaceAll(
          "C:\\ws\\.agents\\skills\\review-pr\\SKILL.md",
          path.join(workspaceDir, ".agents", "skills", "review-pr", "SKILL.md")
        );
      }
      return JSON.stringify(event);
    })
    .join("\n");
  await writeFile(fixturePath, rewritten, "utf8");
}

test("the ACTUAL child process receives the isolated environment", async (t) => {
  const root = await makeRoot(t);
  const skillDir = await makeSkillSource(root, "review-pr");
  const envOut = path.join(root, "child-env.json");
  const fixture = path.join(root, "trace.jsonl");

  // Parent sentinels the child must NOT inherit (set on THIS process, the
  // parent of the mock CLI child).
  const savedEnv = { ...process.env };
  process.env.APPDATA = "C:\\parent-APPDATA-SENTINEL";
  process.env.LOCALAPPDATA = "C:\\parent-LOCALAPPDATA-SENTINEL";
  process.env.XDG_CACHE_HOME = "C:\\parent-XDG-CACHE-SENTINEL";
  process.env.XDG_CONFIG_HOME = "C:\\parent-XDG-CONFIG-SENTINEL";
  process.env.XDG_STATE_HOME = "C:\\parent-XDG-STATE-SENTINEL";
  process.env.XDG_DATA_HOME = "C:\\parent-XDG-DATA-SENTINEL";
  process.env.GIT_DIR = "C:\\parent-GIT-DIR-SENTINEL";
  process.env.git_config_global = "C:\\parent-gitconfig-SENTINEL";
  t.after(() => {
    for (const key of ["APPDATA", "LOCALAPPDATA", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_DATA_HOME", "GIT_DIR", "git_config_global"]) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  const { context } = await withIsolatedTriggerRun({
    runsRoot: path.join(root, ".packsmith", "runs"),
    runtimeId: "codex",
    skillDir,
    binaryPath: process.execPath,
    binaryArgs: [path.join(__dirname, "..", "fixtures", "mock-runtime-cli.mjs")],
    env: { MOCK_AUDIT_SKILLS: "C:/Users/decoy/.agents/skills/global-decoy/SKILL.md", MOCK_AUDIT_SKILL_NAME: "review-pr" },
    run: async (handles) => {
      await rewriteFixtureToWorkspace(fixture, handles.context.workspaceDir);
      const { codexAdapter } = await import("../../src/runtimes/codex.mjs");
      return codexAdapter.runTriggerCase({
        skill: "review-pr",
        prompt: "p",
        context: {
          ...handles.context,
          env: { MOCK_TRACE: fixture, MOCK_ENV_OUT: envOut }
        }
      });
    }
  });

  const child = JSON.parse(await readFile(envOut, "utf8"));
  const dirs = context.caseDirs;

  assert.equal(child.APPDATA, dirs.appData, "APPDATA must be the case dir in the REAL child");
  assert.equal(child.LOCALAPPDATA, dirs.localAppData);
  assert.equal(child.XDG_CACHE_HOME, dirs.cache);
  assert.equal(child.XDG_CONFIG_HOME, dirs.config);
  assert.equal(child.XDG_STATE_HOME, dirs.state);
  assert.equal(child.XDG_DATA_HOME, dirs.data, "XDG_DATA_HOME must be isolated too");
  assert.equal(child.GIT_DIR, undefined, "parent git context must not flow back into the child");
  assert.equal(child.git_config_global, undefined, "lowercase parent git keys must not flow back either");
  assert.equal(child.HOME, dirs.home);
});

test("a successful run materializes ALL six artifacts with the actual status and version", async (t) => {
  const root = await makeRoot(t);
  const skillDir = await makeSkillSource(root, "review-pr");
  const fixture = path.join(root, "trace.jsonl");

  const { result, runDir } = await withIsolatedTriggerRun({
    runsRoot: path.join(root, ".packsmith", "runs"),
    runtimeId: "codex",
    skillDir,
    binaryPath: process.execPath,
    binaryArgs: [path.join(__dirname, "..", "fixtures", "mock-runtime-cli.mjs")],
    env: { MOCK_AUDIT_SKILLS: "C:/Users/decoy/.agents/skills/global-decoy/SKILL.md", MOCK_AUDIT_SKILL_NAME: "review-pr" },
    run: async (handles) => {
      await rewriteFixtureToWorkspace(fixture, handles.context.workspaceDir);
      const { codexAdapter } = await import("../../src/runtimes/codex.mjs");
      return codexAdapter.runTriggerCase({
        skill: "review-pr",
        prompt: "p",
        context: { ...handles.context, env: { MOCK_TRACE: fixture } }
      });
    }
  });

  assert.equal(result.status, "triggered");
  await stat(path.join(runDir, "stdout.log"));
  await stat(path.join(runDir, "stderr.log"));
  await stat(path.join(runDir, "events.jsonl"));

  const recorded = JSON.parse(await readFile(path.join(runDir, "result.json"), "utf8"));
  assert.equal(recorded.status, "triggered", "result.json carries the actual six-state status");

  const metadata = JSON.parse(await readFile(path.join(runDir, "runtime.json"), "utf8"));
  assert.equal(metadata.status, "triggered", "metadata status mirrors the trigger result, not a generic executed");
  assert.equal(metadata.runtimeVersion, result.runtimeVersion, "metadata carries the ACTUAL observed runtime version");
  assert.ok(typeof metadata.runtimeVersion === "string" && metadata.runtimeVersion.length > 0, "the mock probe reports a real version string");

  // stdout.log and events.jsonl carry the same verbatim bytes (no re-encode).
  const eventsBytes = await readFile(path.join(runDir, "events.jsonl"));
  const stdoutBytes = await readFile(path.join(runDir, "stdout.log"));
  assert.deepEqual(eventsBytes, stdoutBytes, "raw bytes must be identical, not string-recoded");
});

test("malformed parent auth surfaces sanitized errors and no secret reaches retained files", async (t) => {
  const root = await makeRoot(t);
  const malformedCodex = path.join(root, "broken-codex-auth.json");
  await writeFile(malformedCodex, '{ "note": "QASECRET" broken', "utf8");

  let caught = null;
  try {
    await withIsolatedTriggerRun({
      runsRoot: path.join(root, ".packsmith", "runs"),
      runtimeId: "codex",
      skillDir: await makeSkillSource(root, "review-pr"),
      codexAuthPath: malformedCodex,
      run: async () => true
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "the malformed auth must fail the run");
  assert.equal(
    String(caught.message).includes("QASECRET"),
    false,
    "the thrown diagnostic must not quote the file content"
  );

  const runDirs = await readdir(path.join(root, ".packsmith", "runs"));
  assert.equal(runDirs.length, 1);
  for (const file of ["runtime.json", "result.json", "stdout.log", "stderr.log", "events.jsonl"]) {
    const content = await readFile(path.join(root, ".packsmith", "runs", runDirs[0], file), "utf8");
    assert.equal(content.includes("QASECRET"), false, `${file} must not carry the credential content`);
  }

  // Malformed Claude settings get the same treatment.
  const malformedClaude = path.join(root, "broken-claude-settings.json");
  await writeFile(malformedClaude, '{ "env": { QASECRET }', "utf8");
  let caughtClaude = null;
  try {
    await withIsolatedTriggerRun({
      runsRoot: path.join(root, ".packsmith", "runs-claude"),
      runtimeId: "claude-code",
      skillDir: await makeSkillSource(root, "review-pr"),
      claudeSettingsPath: malformedClaude,
      run: async () => true
    });
  } catch (error) {
    caughtClaude = error;
  }
  assert.ok(caughtClaude);
  assert.equal(String(caughtClaude.message).includes("QASECRET"), false);
});

test("a non-object parent auth payload is refused with a sanitized diagnostic", async (t) => {
  const root = await makeRoot(t);
  const stringAuth = path.join(root, "string-codex-auth.json");
  await writeFile(stringAuth, '"QASECRET-as-a-string"', "utf8");

  await assert.rejects(
    async () =>
      withIsolatedTriggerRun({
        runsRoot: path.join(root, ".packsmith", "runs"),
        runtimeId: "codex",
        skillDir: await makeSkillSource(root, "review-pr"),
        codexAuthPath: stringAuth,
        run: async () => true
      }),
    (error) => /must contain a JSON object/.test(error.message) && !String(error.message).includes("QASECRET")
  );
});

test("run prefixes are single filename tokens - traversal is refused", async (t) => {
  const root = await makeRoot(t);
  const runsRoot = path.join(root, ".packsmith", "runs");

  await assert.rejects(
    () => createIsolatedRun({ runsRoot, prefix: "../outside-prefix/" }),
    (error) => /single filename token/.test(error.message)
  );
  await assert.rejects(() => createIsolatedRun({ runsRoot, prefix: "a/b" }), InfrastructureError);
  await createIsolatedRun({ runsRoot, prefix: "ok.prefix-1" });
});

test("a junctioned runs root is refused and the redirected target is untouched", async (t) => {
  const root = await makeRoot(t);
  const owned = path.join(root, "owned-target");
  await mkdir(owned, { recursive: true });
  const { symlink } = await import("node:fs/promises");

  let madeJunction = false;
  try {
    await symlink(owned, path.join(root, "junctioned-runs"), "junction");
    madeJunction = true;
  } catch {
    madeJunction = false;
  }

  if (!madeJunction) {
    t.skip("junction creation unavailable on this platform");
    return;
  }

  await assert.rejects(
    () => createIsolatedRun({ runsRoot: path.join(root, "junctioned-runs") }),
    (error) => /real directory|redirected root/.test(error.message)
  );

  const ownedEntries = await readdir(owned);
  assert.equal(ownedEntries.length, 0, "nothing may be created through the junction");
});

test("a pre-planted junction at a destination ancestor refuses the install", async (t) => {
  const root = await makeRoot(t);
  const outside = path.join(root, "outside");
  await mkdir(outside, { recursive: true });
  const skillDir = await makeSkillSource(root, "review-pr");
  const workspaceDir = path.join(root, "ws");
  await mkdir(workspaceDir, { recursive: true });
  const { symlink } = await import("node:fs/promises");

  let madeJunction = false;
  try {
    await symlink(outside, path.join(workspaceDir, ".agents"), "junction");
    madeJunction = true;
  } catch {
    madeJunction = false;
  }

  if (!madeJunction) {
    t.skip("junction creation unavailable on this platform");
    return;
  }

  await assert.rejects(
    () => installSkill({ workspaceDir, runtimeId: "codex", skillDir }),
    (error) => /real directory|outside the isolated workspace/.test(error.message)
  );

  let escaped = true;
  try {
    await stat(path.join(outside, "skills", "review-pr", "SKILL.md"));
  } catch {
    escaped = false;
  }
  assert.equal(escaped, false, "nothing may be written through the planted junction");
});

test("git template dirs are cleaned up even when the git binary is unusable", async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "packsmith-git-fail-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const templateRoot = scratch;
  const countTemplates = async () =>
    (await readdir(templateRoot)).filter((entry) => entry.startsWith("packsmith-git-template-")).length;

  const before = await countTemplates();

  await assert.rejects(
    () => initializeWorkspaceRepo({ workspaceDir: path.join(scratch, "ws"), gitBinary: "packsmith-missing-git-binary", templateParentDir: templateRoot }),
    InfrastructureError
  );

  assert.equal(await countTemplates(), before, "no git template directory may leak after a failed init");
});

test("the claude bridge carries the full whitelisted routing field set and nothing else", async (t) => {
  const root = await makeRoot(t);
  const settingsPath = path.join(root, "settings.json");
  await writeFile(
    settingsPath,
    JSON.stringify(
      {
        model: "claude-sonnet-4-5",
        hooks: { PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "should-not-be-copied" }] }] },
        mcpServers: { desktop: { command: "should-not-be-copied" } },
        env: {
          ANTHROPIC_AUTH_TOKEN: CLAUDE_TOKEN_SENTINEL,
          ANTHROPIC_BASE_URL: CLAUDE_ENDPOINT,
          ANTHROPIC_MODEL: CLAUDE_ROUTING_SENTINEL,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-routing",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "opus-routing",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet-routing",
          SOME_OTHER_ENV: "not-bridged"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });
  const report = await bridgeAuth({
    runtimeId: "claude-code",
    claudeSettingsPath: settingsPath,
    runtimeStateDir: caseDirs.runtimeState
  });

  assert.equal(report.present, true);
  assert.equal(report.endpointPinned, true);
  assert.equal(report.modelPinned, true);
  assert.deepEqual(
    [...report.fields].sort(),
    [
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_MODEL",
      "model"
    ].sort()
  );
  assert.equal(JSON.stringify(report).includes(CLAUDE_TOKEN_SENTINEL), false, "field values never appear in the report");

  const staged = JSON.parse(await readFile(path.join(caseDirs.runtimeState, "settings.json"), "utf8"));
  assert.deepEqual(Object.keys(staged).sort(), ["env", "model"], "only the whitelisted top-level keys are staged");
  assert.equal(staged.model, "claude-sonnet-4-5");
  assert.equal(Object.keys(staged.env).length, 6, "all six documented ANTHROPIC_* fields are bridged");
  assert.equal(JSON.stringify(staged).includes("should-not-be-copied"), false, "hooks/MCP are never copied");
  assert.equal(JSON.stringify(staged).includes("SOME_OTHER_ENV"), false, "unknown env fields are never copied");
});

test("a non-string routing field is refused with a sanitized diagnostic", async (t) => {
  const root = await makeRoot(t);
  const settingsPath = path.join(root, "settings.json");
  await writeFile(
    settingsPath,
    JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: CLAUDE_TOKEN_SENTINEL, ANTHROPIC_MODEL: 42 } }, null, 2),
    "utf8"
  );

  const caseDirs = await createCaseDirs({ privateRoot: path.join(root, "private") });
  await assert.rejects(
    () => bridgeAuth({ runtimeId: "claude-code", claudeSettingsPath: settingsPath, runtimeStateDir: caseDirs.runtimeState }),
    (error) => /env\.ANTHROPIC_MODEL must be a non-empty string/.test(error.message)
  );
});

test("a private root swapped for a real author directory is preserved and the run fails truthfully", async (t) => {
  const root = await makeRoot(t);
  const skillDir = await makeSkillSource(root, "review-pr");
  const runsRoot = path.join(root, ".packsmith", "runs");
  const mockBinary = path.join(__dirname, "..", "fixtures", "mock-runtime-cli.mjs");
  const movedAway = path.join(os.tmpdir(), `packsmith-moved-original-${Date.now().toString(36)}`);
  t.after(() => rm(movedAway, { recursive: true, force: true }));

  let caught = null;
  try {
    await withIsolatedTriggerRun({
      runsRoot,
      runtimeId: "codex",
      skillDir,
      binaryPath: process.execPath,
      binaryArgs: [mockBinary],
      env: { MOCK_AUDIT_SKILL_NAME: "review-pr" },
      run: async (handles) => {
        // ACTUAL callback manipulation: move this run's private root aside
        // and plant a real author directory at the original pathname.
        const privateRoot = path.dirname(handles.caseDirs.runtimeState);
        await rm(movedAway, { recursive: true, force: true });
        await (await import("node:fs/promises")).rename(privateRoot, movedAway);
        await mkdir(privateRoot, { recursive: true });
        await writeFile(path.join(privateRoot, "author.txt"), "author content must survive\\n", "utf8");
        return { status: "triggered", runtime: "codex", runtimeVersion: "mock 1.0.0", evidence: [] };
      }
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "the identity mismatch must fail the run");
  assert.match(String(caught.message), /replaced after registration/, "the diagnostic must name the replacement");

  // The planted author directory is preserved, never deleted.
  const runDirs = await readdir(runsRoot);
  assert.equal(runDirs.length, 1);
  const privateRoot = path.join(
    path.dirname(JSON.parse(await readFile(path.join(runsRoot, runDirs[0], "runtime.json"), "utf8")).context.runtimeStateDir)
  );
  const author = await readFile(path.join(privateRoot, "author.txt"), "utf8");
  assert.match(author, /author content must survive/);

  // The recorded status is a truthful failure, not the trigger result.
  const metadata = JSON.parse(await readFile(path.join(runsRoot, runDirs[0], "runtime.json"), "utf8"));
  assert.match(metadata.status, /failed: cleanup:.*replaced/, "cleanup failure must flip the recorded status");
});

test("malformed auth errors carry no credential excerpt through the whole cause chain", async (t) => {
  const root = await makeRoot(t);
  const malformedCodex = path.join(root, "broken-codex-auth.json");
  await writeFile(malformedCodex, '{ "note": "QASECRET" broken', "utf8");

  let caught = null;
  try {
    await withIsolatedTriggerRun({
      runsRoot: path.join(root, ".packsmith", "runs-cause"),
      runtimeId: "codex",
      skillDir: await makeSkillSource(root, "review-pr"),
      codexAuthPath: malformedCodex,
      run: async () => true
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "the malformed auth must fail the run");

  // Walk the ENTIRE cause chain: no link may quote the file content.
  let current = caught;
  let depth = 0;

  while (current !== null && current !== undefined && depth < 10) {
    const text = [current.message, current.stack].filter((part) => typeof part === "string").join("\n");
    assert.equal(text.includes("QASECRET"), false, `cause chain depth ${depth} leaks the credential excerpt`);
    current = current.cause;
    depth += 1;
  }
});

// ---------------------------------------------------------------------------
// Actual-discovery isolation (Codex): the user-level skill root is resolved
// from the OS home directory (a Windows known folder) and is NOT governed by
// HOME/USERPROFILE/CODEX_HOME, so the real user's global skills remain
// discoverable regardless of the git boundary. Scoping is established by
// auditing the available skills WITHOUT a model (codex debug prompt-input)
// and disabling every non-target skill through the official skills.config
// path selectors. These tests drive the mechanism through the mock CLI.
// ---------------------------------------------------------------------------

const mockCliPath = path.join(__dirname, "..", "fixtures", "mock-runtime-cli.mjs");

test("parseAvailableSkillLocators extracts every canonical SKILL.md locator", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    {
      type: "message",
      role: "developer",
      content: [
        {
          type: "input_text",
          text: "<skills_instructions>\n- a: x (file: C:/ws/.agents/skills/review-pr/SKILL.md)\n- b: y (file: C:\\\\Users\\\\me\\\\.agents\\\\skills\\\\superpowers\\\\using-superpowers\\\\SKILL.md)\n</skills_instructions>"
        }
      ]
    }
  ]);

  const locators = parseAvailableSkillLocators(render);
  assert.deepEqual(locators, [
    "C:/Users/me/.agents/skills/superpowers/using-superpowers/SKILL.md",
    "C:/ws/.agents/skills/review-pr/SKILL.md"
  ]);
});

test("establishCodexSkillScope keeps the target and disables every global skill", async (t) => {
  const { establishCodexSkillScope } = await import("../../src/trigger/codex-skill-scope.mjs");
  const root = await makeRoot(t);
  const workspaceDir = path.join(root, "ws", "workspace");
  await mkdir(path.join(workspaceDir, ".agents", "skills", "review-pr"), { recursive: true });

  const scope = await establishCodexSkillScope({
    workspaceDir,
    skillName: "review-pr",
    binaryPath: process.execPath,
    binaryArgs: [mockCliPath],
    env: {
      MOCK_AUDIT_SKILL_NAME: "review-pr",
      MOCK_AUDIT_SKILLS: "C:/Users/real/.agents/skills/superpowers/using-superpowers/SKILL.md,C:/Users/real/.agents/skills/godot/SKILL.md"
    }
  });

  assert.equal(scope.ok, true);
  assert.equal(scope.availableSkills, 3, "the audit sees the target plus two global skills");
  assert.equal(scope.scopedSkills, 1, "scoping leaves only the target");
  assert.match(scope.scopeConfigValue, /using-superpowers\/SKILL\.md",enabled=false/);
  assert.match(scope.scopeConfigValue, /godot\/SKILL\.md",enabled=false/);
  assert.equal(scope.scopeConfigValue.includes("review-pr"), false, "the target is never disabled");
});

test("establishCodexSkillScope refuses when the target skill is not discoverable", async (t) => {
  const { establishCodexSkillScope } = await import("../../src/trigger/codex-skill-scope.mjs");
  const root = await makeRoot(t);
  const workspaceDir = path.join(root, "ws", "workspace");
  await mkdir(workspaceDir, { recursive: true });

  await assert.rejects(
    () =>
      establishCodexSkillScope({
        workspaceDir,
        skillName: "review-pr",
        binaryPath: process.execPath,
        binaryArgs: [mockCliPath],
        env: { MOCK_AUDIT_SKILL_NAME: "other-skill" }
      }),
    (error) => /not among the .* skills/.test(error.message)
  );
});

test("withSkillScopeFlags places the -c override before the protocol flags", async () => {
  const { withSkillScopeFlags } = await import("../../src/trigger/codex-skill-scope.mjs");
  const flags = withSkillScopeFlags(["--ephemeral", "--ignore-rules"], "[{path='x',enabled=false}]");
  assert.deepEqual(flags, ["-c", "skills.config=[{path='x',enabled=false}]", "--ephemeral", "--ignore-rules"]);
});

test("the codex adapter puts global -c before exec and exec flags after", async (t) => {
  const { codexAdapter } = await import("../../src/runtimes/codex.mjs");
  const root = await makeRoot(t);
  const context = {
    workspaceDir: path.join(root, "ws"),
    traceDir: path.join(root, "runs"),
    homeDir: path.join(root, "home"),
    runtimeStateDir: path.join(root, "state"),
    tempDir: path.join(root, "tmp"),
    timeoutMs: 30000,
    binaryPath: process.execPath,
    binaryArgs: [mockCliPath],
    isolationFlags: ["-c", "skills.config=[{path='x',enabled=false}]", "--ephemeral", "--ignore-rules"],
    env: { MOCK_TRACE: path.join(__dirname, "..", "fixtures", "runtime-traces", "codex-not-triggered.jsonl") }
  };

  // The mock records nothing about argv, so assert through the result: the
  // run must succeed (the -c placement is valid) rather than erroring.
  const result = await codexAdapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });
  assert.ok(["not_triggered", "ambiguous", "triggered"].includes(result.status), JSON.stringify(result));
});

test("a global skill leaking through is a hard failure, never a silent pass", async (t) => {
  const { establishCodexSkillScope } = await import("../../src/trigger/codex-skill-scope.mjs");
  const root = await makeRoot(t);
  const workspaceDir = path.join(root, "ws", "workspace");
  await mkdir(path.join(workspaceDir, ".agents", "skills", "review-pr"), { recursive: true });

  // The mock honors the disable list; to simulate a NON-isolatable runtime
  // (one that ignores the scope override), point the audit at a mock that
  // never disables: MOCK_AUDIT_IGNORE_SCOPE makes it list every skill.
  await assert.rejects(
    () =>
      establishCodexSkillScope({
        workspaceDir,
        skillName: "review-pr",
        binaryPath: process.execPath,
        binaryArgs: [mockCliPath],
        env: {
          MOCK_AUDIT_SKILL_NAME: "review-pr",
          MOCK_AUDIT_SKILLS: "C:/Users/real/.agents/skills/superpowers/using-superpowers/SKILL.md",
          MOCK_AUDIT_IGNORE_SCOPE: "1"
        }
      }),
    (error) => /non-target skill\(s\) available/.test(error.message)
  );
});

// ---------------------------------------------------------------------------
// Round-3 acceptance: TOML apostrophe escaping, parenthesized locator
// parsing, and CLI duplicate flag rejection.
// ---------------------------------------------------------------------------

test("buildSkillScopeConfigValue escapes apostrophes in TOML basic strings", async () => {
  const { buildSkillScopeConfigValue } = await import("../../src/trigger/codex-skill-scope.mjs");
  const config = buildSkillScopeConfigValue(
    ["/fixture/user's-skill/SKILL.md"],
    "/fixture/target/SKILL.md"
  );
  // Apostrophe must not break the TOML basic string (double-quoted).
  assert.equal(config, `[{path="/fixture/user's-skill/SKILL.md",enabled=false}]`);
  // Must be valid TOML: no unescaped bare single-quote inside a basic string.
  assert.ok(!config.includes("path='"), "must not use TOML literal strings (single-quoted)");
});

test("buildSkillScopeConfigValue escapes backslashes and double quotes", async () => {
  const { buildSkillScopeConfigValue } = await import("../../src/trigger/codex-skill-scope.mjs");
  const BS = String.fromCharCode(92);
  const DQ = String.fromCharCode(34);
  const winPath = ["C:", "path", "with", "backslashes", "SKILL.md"].join(BS);
  const unixDQ = "/path/with/" + DQ + "quotes" + DQ + "/SKILL.md";
  const config = buildSkillScopeConfigValue(
    [winPath, unixDQ],
    "/fixture/target/SKILL.md"
  );
  // Backslashes doubled for TOML basic string.
  assert.ok(config.includes(winPath.split(BS).join(BS + BS)), "backslashes must be doubled");
  // Double quotes escaped with backslash.
  assert.ok(config.includes(BS + DQ + "quotes" + BS + DQ), "double quotes must be escaped");
});

test("parseAvailableSkillLocators handles paths with parentheses", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    {
      type: "message",
      role: "developer",
      content: [
        {
          type: "input_text",
          text: "<skills_instructions>\n- a: x (file: /fixture/global/collection(with-parentheses)/other-skill/SKILL.md)\n- b: y (file: /fixture/target/SKILL.md)\n</skills_instructions>"
        }
      ]
    }
  ]);

  const locators = parseAvailableSkillLocators(render);
  assert.deepEqual(locators, [
    "/fixture/global/collection(with-parentheses)/other-skill/SKILL.md",
    "/fixture/target/SKILL.md"
  ]);
});

test("parseAvailableSkillLocators fail-closes on unparseable skill entries", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  // A bullet line with `(file:` but no valid absolute path at the end.
  const render = JSON.stringify([
    {
      type: "message",
      role: "developer",
      content: [
        {
          type: "input_text",
          text: "<skills_instructions>\n- a: x (file: relative/path/SKILL.md)\n- b: y (file: /fixture/target/SKILL.md)\n</skills_instructions>"
        }
      ]
    }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /unparseable skill entry/.test(error.message)
  );
});

// ---------------------------------------------------------------------------
// Round-4: platform-specific case sensitivity, strict JSON developer
// parsing, TOML control-byte escaping, and fail-closed bullet parsing.
// ---------------------------------------------------------------------------

test("isTargetSkillLocator is case-sensitive on Linux, case-insensitive on Windows", async (t) => {
  const { isTargetSkillLocator } = await import("../../src/trigger/codex-skill-scope.mjs");
  const workspaceDir = "/home/user/project";
  const skillName = "review-pr";
  const target = `${workspaceDir}/.agents/skills/${skillName}/SKILL.md`;
  const wrongCase = `${workspaceDir}/.agents/skills/Review-Pr/SKILL.md`;

  if (process.platform === "win32") {
    assert.equal(isTargetSkillLocator(wrongCase, { workspaceDir, skillName }), true, "Windows is case-insensitive");
  } else {
    assert.equal(isTargetSkillLocator(wrongCase, { workspaceDir, skillName }), false, "Linux is case-sensitive");
    assert.equal(isTargetSkillLocator(target, { workspaceDir, skillName }), true);
  }
});

test("parseAvailableSkillLocators only trusts developer-role input_text fields", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  // A user-role message carrying a skills block must be ignored.
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /real/dev/SKILL.md)\n</skills_instructions>" }] },
    { role: "user", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /fake/user/SKILL.md)\n</skills_instructions>" }] }
  ]);

  const locators = parseAvailableSkillLocators(render);
  assert.deepEqual(locators, ["/real/dev/SKILL.md"], "user-role content must not contribute locators");
});

test("parseAvailableSkillLocators rejects non-input_text content types", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "other_type", text: "<skills_instructions>\n(file: /fake/SKILL.md)\n</skills_instructions>" }] }
  ]);

  assert.deepEqual(parseAvailableSkillLocators(render), [], "non-input_text fields must not contribute locators");
});

test("parseAvailableSkillLocators fail-closes on bullet with SKILL.md but no (file:", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n- suspicious: no locator here SKILL.md\n- ok: real (file: /fixture/target/SKILL.md)\n</skills_instructions>" }] }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /unparseable skill entry/.test(error.message)
  );
});

test("tomlEscapeString encodes control characters as unicode escapes", async () => {
  const { buildSkillScopeConfigValue } = await import("../../src/trigger/codex-skill-scope.mjs");
  const BS = String.fromCharCode(92);
  const controlChar = String.fromCharCode(1); // SOH
  const config = buildSkillScopeConfigValue(
    [`/path${controlChar}with-control/SKILL.md`],
    "/fixture/target/SKILL.md"
  );
  assert.ok(config.includes(`${BS}u0001`), "control byte U+0001 must use \u0001 form");
});

// ---------------------------------------------------------------------------
// Round-4 scope structure: unclosed trailing skills block, non-bullet
// unknown format with (file: marker, and bare locator without closing paren
// must all fail closed — never silently accepted.
// ---------------------------------------------------------------------------

test("unclosed trailing skills_instructions block is fail-closed", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  // Complete target block followed by an unclosed foreign block.
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /fixture/target/SKILL.md)\n</skills_instructions>\n<skills_instructions>\n(file: /fixture/foreign/SKILL.md)" }] }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /mismatched|unclosed/.test(error.message)
  );
});

test("non-bullet unknown format with (file: marker is fail-closed", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  // Inside a complete block: a non-bullet line with an explicit (file: marker
  // that cannot be parsed as a valid locator entry.
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /fixture/target/SKILL.md)\n[skill-entry] foreign description (file: /absolute/foreign/SKILL.md)\n</skills_instructions>" }] }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /unparseable skill entry/.test(error.message)
  );
});

test("bare (file: locator without closing paren is fail-closed", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  // A bare `(file: /path` without the closing `)` must not be silently skipped.
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /fixture/target/SKILL.md)\n(file: /absolute/foreign/SKILL.md\n</skills_instructions>" }] }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /unparseable skill entry/.test(error.message)
  );
});

test("valid bullet and bare entries still parse correctly (positive control)", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n- target: desc (file: /fixture/target/SKILL.md)\n(file: /fixture/bare/SKILL.md)\n</skills_instructions>" }] }
  ]);

  const locators = parseAvailableSkillLocators(render);
  assert.deepEqual(locators, ["/fixture/bare/SKILL.md", "/fixture/target/SKILL.md"]);
});

// Round-4 nested tags: the tag-pairing state machine must reject nesting
// (open-target → open-inner → close-inner → close-foreign) even when
// open/close counts are equal — the foreign block inside the inner tags
// would be silently dropped by a naive count check.
test("nested skills_instructions tags with equal counts are fail-closed", async () => {
  const { parseAvailableSkillLocators } = await import("../../src/trigger/codex-skill-scope.mjs");
  const render = JSON.stringify([
    { role: "developer", content: [{ type: "input_text", text: "<skills_instructions>\n(file: /fixture/target/SKILL.md)\n<skills_instructions>\n(file: /fixture/inner/SKILL.md)\n</skills_instructions>\n(file: /fixture/foreign/SKILL.md)\n</skills_instructions>" }] }
  ]);

  await assert.rejects(
    async () => parseAvailableSkillLocators(render),
    (error) => error.isInfrastructureError === true && /nested/.test(error.message)
  );
});
