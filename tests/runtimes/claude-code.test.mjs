import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { parseClaudeTrace } from "../../src/runtimes/claude-code.mjs";

/**
 * Claude Code trace parser tests (v0.2 Milestone 6, plan §16).
 *
 * Fixtures are hand-constructed from the official headless/stream-json and
 * Agent SDK message documentation (see tests/fixtures/runtime-traces/
 * README.md): assistant tool_use blocks, user tool_result blocks correlated
 * by tool_use_id, SDKAssistantMessageError and aborted markers, and the
 * SDKResultMessage success/error arms. The Skill tool's INPUT FIELD NAMES
 * are not confirmed by local typings — the matcher requires the exact skill
 * name as an input string value and never invents a field name. Final
 * result errors and assistant errors are infrastructure; missing, aborted
 * and truncated evidence is ambiguous.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures", "runtime-traces");

async function loadFixture(name) {
  return readFile(path.join(fixturesDir, name), "utf8");
}

test("a Skill invocation with the exact name and a successful result is triggered", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-triggered.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "triggered");
  assert.ok(parsed.evidence.some((entry) => entry.kind === "skill-invocation"));
  assert.ok(parsed.evidence.some((entry) => entry.kind === "skill-result"));
});

test("a turn without any Skill invocation is not_triggered", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-not-triggered.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "not_triggered");
});

test("a Skill invocation of ANOTHER skill is not evidence (decoy → not_triggered)", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-decoy-other-skill.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "not_triggered");
});

test("a Skill tool_use without a correlated tool_result is ambiguous", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-ambiguous-missing-result.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "ambiguous");
  assert.ok(parsed.evidence.some((entry) => entry.kind === "missing-tool-result"));
});

test("a failed (is_error) skill tool_result is ambiguous, never not_triggered", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-ambiguous-error-result.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "ambiguous");
});

test("a final result error is infrastructure, not ambiguous", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-error.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "infra_error");
});

test("an assistant error marker (auth/rate-limit/service) is infrastructure", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-assistant-error.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "infra_error");
});

test("an aborted assistant message truncates the evidence (ambiguous)", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-ambiguous-aborted.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "ambiguous");
});

test("a truncated stream is ambiguous, never not_triggered", async (t) => {
  const parsed = parseClaudeTrace(await loadFixture("claude-ambiguous-truncated.jsonl"), { skillName: "review-pr" });

  assert.equal(parsed.status, "ambiguous");
  assert.ok(parsed.evidence.some((entry) => entry.kind === "malformed-stream"));
});

test("the exact-name matcher does not match substrings of other skills", () => {
  const stream = [
    '{"type":"system","subtype":"init","session_id":"s","tools":["Skill"]}',
    '{"type":"assistant","message":{"id":"m","parent_tool_use_id":null,"content":[{"type":"tool_use","id":"t1","name":"Skill","input":{"skill":"review-pr-extended"}}]}}',
    '{"type":"user","message":{"id":"m2","parent_tool_use_id":null,"content":[{"type":"tool_result","tool_use_id":"t1","is_error":false,"content":"loaded"}]}}',
    '{"type":"result","subtype":"success","is_error":false,"result":"done"}'
  ].join("\n");

  const parsed = parseClaudeTrace(stream, { skillName: "review-pr" });
  assert.equal(parsed.status, "not_triggered");
});

test("an empty stream is ambiguous", () => {
  const parsed = parseClaudeTrace("", { skillName: "review-pr" });
  assert.equal(parsed.status, "ambiguous");
});
