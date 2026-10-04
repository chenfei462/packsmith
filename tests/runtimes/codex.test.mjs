import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";

import { parseCodexTrace } from "../../src/runtimes/codex.mjs";

/**
 * Codex trace parser tests (v0.2 Milestone 6, plan §16).
 *
 * Fixtures are hand-constructed from the verified codex-cli 0.148.0 exec
 * JSONL protocol (thread/turn/item/error events; CommandExecutionItem with
 * command/aggregated_output/exit_code/status) — see
 * tests/fixtures/runtime-traces/README.md for provenance. This version has
 * NO skill-invoked item type; activation evidence is a COMPLETED,
 * exit-code-0 execution that reads the EXACT installed SKILL.md path.
 * Echo/mentions, failed reads, other skills, incomplete and truncated
 * streams must never count as triggered OR not_triggered.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures", "runtime-traces");

const INSTALLED_SKILL_PATH = "C:\\ws\\.agents\\skills\\review-pr\\SKILL.md";

async function loadFixture(name) {
  return readFile(path.join(fixturesDir, name), "utf8");
}

test("a completed, exit-0 read of the exact installed SKILL.md is triggered", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-triggered.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "triggered");
  assert.ok(parsed.evidence.length >= 1);
  assert.equal(parsed.evidence[0].kind, "command-execution");
  assert.match(parsed.evidence[0].detail, /SKILL\.md/);
});

test("an echo mentioning the path is a decoy, not evidence (clean turn → not_triggered)", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-not-triggered.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "not_triggered");
});

test("a completed read of ANOTHER skill is not evidence for this skill", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-decoy-other-skill.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "not_triggered");
});

test("a failed read of the exact path is ambiguous, never not_triggered", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-ambiguous-failed-read.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "ambiguous");
});

test("an in_progress read at stream end is ambiguous (incomplete evidence)", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-ambiguous-incomplete.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "ambiguous");
});

test("a truncated event stream is ambiguous, never not_triggered", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-ambiguous-truncated.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "ambiguous");
  assert.ok(parsed.evidence.some((entry) => entry.kind === "malformed-stream"));
});

test("a stream error event is infrastructure, not ambiguous", async (t) => {
  const parsed = parseCodexTrace(await loadFixture("codex-error.jsonl"), {
    installedSkillPath: INSTALLED_SKILL_PATH
  });

  assert.equal(parsed.status, "infra_error");
});

test("path matching is separator- and case-insensitive on Windows-style paths", () => {
  const stream = [
    '{"type":"thread.started","thread_id":"t"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"i","type":"command_execution","command":"type C:/WS/.AGENTS/SKILLS/REVIEW-PR/skill.md","aggregated_output":"content","exit_code":0,"status":"completed"}}',
    '{"type":"turn.completed","usage":{}}'
  ].join("\n");

  const parsed = parseCodexTrace(stream, { installedSkillPath: INSTALLED_SKILL_PATH });
  assert.equal(parsed.status, "triggered");
});

test("an empty stream is ambiguous, not not_triggered", () => {
  const parsed = parseCodexTrace("", { installedSkillPath: INSTALLED_SKILL_PATH });
  assert.equal(parsed.status, "ambiguous");
});

// ---------------------------------------------------------------------------
// Codex round-3 PowerShell regressions (manual envelopes reproducing the
// real local-PS harness cases; the protocol envelope is hand-constructed,
// the command semantics were verified natively by the reviewer):
// a "read" verdict is possible ONLY for a single supported statement —
// statements after a compound separator are never assumed to execute.
// ---------------------------------------------------------------------------

function psEnvelope(command) {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "th_ps" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "item_1", type: "command_execution", command, aggregated_output: "", exit_code: 0, status: "completed" }
    }),
    JSON.stringify({ type: "turn.completed", usage: {} })
  ].join("\n");
}

// Round-3 PowerShell regressions: manual envelopes reproducing the
// reviewer's real local-PS harness cases (the envelope is hand-constructed;
// the command semantics were verified natively by the reviewer). Paths are
// built programmatically so escaping never mangles them. A "read" verdict
// is possible ONLY for a single supported statement — statements after a
// compound separator are never assumed to execute.
const PS_TARGET = path.join("C:" + path.sep, "ws", ".agents", "skills", "review-pr", "SKILL.md");
const PS_WORKSPACE = path.join("C:" + path.sep, "ws");

function psCommand(innerScript) {
  return `powershell.exe -NoProfile -Command "${innerScript}"`;
}

test("bare single Get-Content of the target is triggered (native-verified control)", () => {
  const parsed = parseCodexTraceEnvelope(psCommand2(`Get-Content '${PS_TARGET}'`));

  assert.equal(parsed.status, "triggered");
});
test("Get-Content -LiteralPath with a spaced path is a single supported read", () => {
  const parsed = parseCodexTrace(psEnvelope(psCommand(`Get-Content -LiteralPath '${PS_TARGET}'`)), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "triggered");
});

test("statements after a compound separator are never assumed to run (early exit)", () => {
  // Native evidence: `Write-Output 'decoy'; exit 0; Get-Content '<target>'`
  // exits 0 and the target body is NEVER read.
  const parsed = parseCodexTrace(
    psEnvelope(psCommand(`Write-Output 'decoy'; exit 0; Get-Content '${PS_TARGET}'`)),
    { installedSkillPath: PS_TARGET, workspaceDir: PS_WORKSPACE }
  );

  assert.equal(parsed.status, "ambiguous");
  assert.notEqual(parsed.status, "triggered");
});

test("attached semicolon after a read stays conservative (ambiguous)", () => {
  const parsed = parseCodexTrace(
    psEnvelope(psCommand(`Get-Content -LiteralPath '${PS_TARGET}'; Write-Output 'after'`)),
    { installedSkillPath: PS_TARGET, workspaceDir: PS_WORKSPACE }
  );

  assert.equal(parsed.status, "ambiguous");
});

test("spaced semicolon after a read stays conservative (ambiguous)", () => {
  const parsed = parseCodexTrace(
    psEnvelope(psCommand(`Get-Content -LiteralPath '${PS_TARGET}' ; Write-Output 'after'`)),
    { installedSkillPath: PS_TARGET, workspaceDir: PS_WORKSPACE }
  );

  assert.equal(parsed.status, "ambiguous");
});

test("newline-separated compound stays conservative (ambiguous)", () => {
  const parsed = parseCodexTrace(
    psEnvelope(psCommand(`Get-Content -LiteralPath '${PS_TARGET}'\nWrite-Output 'after'`)),
    { installedSkillPath: PS_TARGET, workspaceDir: PS_WORKSPACE }
  );

  assert.equal(parsed.status, "ambiguous");
});

test("bare (non-PS) compound with a read attempt is ambiguous too", () => {
  const parsed = parseCodexTrace(psEnvelope(`cat '${PS_TARGET}' || echo fallback`), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "ambiguous");
});

test("compound with producer-only target mentions stays not_triggered", () => {
  const parsed = parseCodexTrace(psEnvelope(`Write-Output '${PS_TARGET}'; Write-Output 'done'`), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "not_triggered");
});

// Round-3 wrapper-prefix regressions: -File runs a script FILE and the
// remaining arguments (including a -Command-looking string) are that
// script's arguments — activation must never be awarded through them.
// Only a trusted prefix (-NoProfile/-NonInteractive/-NoLogo + exactly one
// -Command/-c + one script argument) is interpreted; everything else is
// conservative ambiguous.
test("a -File wrapper's -Command argument is not a command (decoy script)", () => {
  const command = `powershell.exe -NoProfile -File "${path.join(PS_WORKSPACE, "echo.ps1")}" -Command "Get-Content '${PS_TARGET}'"`;
  const parsed = parseCodexTrace(psEnvelope(command), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "ambiguous");
  assert.notEqual(parsed.status, "triggered");
});

test("-EncodedCommand is not an interpretable wrapper (ambiguous)", () => {
  const command = `powershell.exe -NoProfile -EncodedCommand R2V0LUNvbnRlbnQ=`;
  const parsed = parseCodexTrace(psEnvelope(command), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "ambiguous");
});

test("an unknown wrapper option is ambiguous", () => {
  const command = `powershell.exe -NoProfile -SomeUnknownSwitch -Command "Get-Content '${PS_TARGET}'"`;
  const parsed = parseCodexTrace(psEnvelope(command), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "ambiguous");
});

test("a non-option argument before -Command is ambiguous", () => {
  const command = `powershell.exe -NoProfile script.ps1 -Command "Get-Content '${PS_TARGET}'"`;
  const parsed = parseCodexTrace(psEnvelope(command), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });

  assert.equal(parsed.status, "ambiguous");
});

test("trusted prefix -NoProfile -NonInteractive keeps the single-read verdict", () => {
  const parsed = parseCodexTraceEnvelope(psCommand2(`Get-Content '${PS_TARGET}'`));

  assert.equal(parsed.status, "triggered");
});
function psCommand2(innerScript) {
  return `powershell.exe -NoProfile -NonInteractive -Command "${innerScript}"`;
}

function parseCodexTraceEnvelope(command) {
  return parseCodexTrace(psEnvelope(command), {
    installedSkillPath: PS_TARGET,
    workspaceDir: PS_WORKSPACE
  });
}

test("real local PowerShell control matches native evidence (Windows-gated)", async (t) => {
  const probe = spawnSync("powershell.exe", ["-NoProfile", "-Command", "$PID"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true
  });

  if (probe.error || probe.status !== 0) {
    t.skip(`local PowerShell unavailable (${probe.error?.code ?? probe.status})`);
    return;
  }

  // Everything this test materializes lives under an EXCLUSIVE temp root —
  // never a fixed global path (C:\ws is only a string in pure-parser tests,
  // no file is ever written there). Each parse call passes THIS run's
  // target/workspace so the parser's canonical target matches the file the
  // commands actually touch.
  const realRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-ps-real-"));
  t.after(() => rm(realRoot, { recursive: true, force: true }));

  const SENTINEL = "PACKSMITH_REAL_BODY";
  const targetFile = path.join(realRoot, ".agents", "skills", "review-pr", "SKILL.md");
  mkdirSync(path.dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, `${SENTINEL}\n`, "utf8");

  const envelopeFor = (command) =>
    [
      JSON.stringify({ type: "thread.started", thread_id: "t" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_1", type: "command_execution", command, aggregated_output: "", exit_code: 0, status: "completed" }
      }),
      JSON.stringify({ type: "turn.completed", usage: {} })
    ].join("\n") + "\n";

  const parseFor = (command) =>
    parseCodexTrace(envelopeFor(command), {
      installedSkillPath: targetFile,
      workspaceDir: realRoot
    });

  // Control 1 — REAL native read: spawn Get-Content against the real file
  // and require exit 0 plus the sentinel in stdout BEFORE feeding the same
  // command (with its native evidence) to the parser.
  const nativeRead = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Get-Content '${targetFile}'`],
    { encoding: "utf8", timeout: 10000, windowsHide: true }
  );

  assert.equal(nativeRead.status, 0, `precondition: native read must succeed: ${nativeRead.stderr}`);
  assert.ok(nativeRead.stdout.includes(SENTINEL), "precondition: native read must return the sentinel body");
  const controlRead = parseFor(`Get-Content '${targetFile}'`);
  assert.equal(controlRead.status, "triggered");

  // Control 2 — REAL native wrapper decoy: run the -File wrapper for real
  // (script prints a decoy line, target body unread), assert the native
  // evidence, then require the parser to agree (not triggered).
  const scriptFile = path.join(realRoot, "echo-control.ps1");
  writeFileSync(scriptFile, "Write-Output 'decoy only'\n", "utf8");
  const wrapperCommand = `powershell.exe -NoProfile -File "${scriptFile}" -Command "Get-Content '${targetFile}'"`;
  const native = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-File", scriptFile, "-Command", `Get-Content '${targetFile}'`],
    { encoding: "utf8", timeout: 10000, windowsHide: true }
  );

  assert.equal(native.status, 0, `precondition: wrapper must exit 0: ${native.stderr}`);
  assert.equal(native.stdout.includes(SENTINEL), false, "precondition: the wrapper must not read the target");
  const wrapperParsed = parseFor(wrapperCommand);
  assert.notEqual(wrapperParsed.status, "triggered");
});
