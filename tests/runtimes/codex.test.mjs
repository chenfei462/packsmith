import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

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
