import test from "node:test";
import assert from "node:assert/strict";

import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";

/**
 * Wave 1 acceptance regression (Codex report P2): the knowledge base must
 * state runtime frontmatter facts the way the official sources state them.
 *
 * - Claude Code officially allows an omitted name (the directory name is
 *   used) and treats description as recommended — the strict agent-skills
 *   spec MUSTs stay in the spec rules, not in the runtime record.
 * - `disable-model-invocation` is documented by BOTH Claude Code and Cursor,
 *   so the PS-COMP-002 knowledge maps it to both runtimes.
 * - Corrected entries carry evidence provenance with verifiedOn 2026-10-04.
 */

const knowledgeBase = await loadKnowledgeBase();

test("claude-code runtime record no longer claims name/description are required", () => {
  const claude = knowledgeBase.runtimes.find((runtime) => runtime.id === "claude-code");
  assert.ok(claude, "claude-code runtime record exists");

  const frontmatter = claude.frontmatter ?? {};
  assert.equal(frontmatter.name.required, false, "name is optional per official Claude Code docs");
  assert.equal(frontmatter.name.fallsBackTo, "directory name");
  assert.equal(frontmatter.description.required, false, "description is recommended, not required");
  assert.equal(frontmatter.description.recommended, true);
});

test("corrected claude-code facts carry provenance verified on 2026-10-04", () => {
  const claude = knowledgeBase.runtimes.find((runtime) => runtime.id === "claude-code");
  assert.ok(claude.evidence.length > 0);
  for (const entry of claude.evidence) {
    assert.equal(entry.source, "claude-code-docs");
    assert.equal(entry.verifiedOn, "2026-10-04");
  }
});

test("disable-model-invocation is owned by both claude-code and cursor", () => {
  const compRule = knowledgeBase.rules.find((rule) => rule.id === "PS-COMP-002");
  assert.ok(compRule, "PS-COMP-002 exists");

  const knownRuntimeKeys = compRule.check.knownRuntimeKeys ?? {};
  assert.ok(
    Array.isArray(knownRuntimeKeys["claude-code"]) &&
      knownRuntimeKeys["claude-code"].includes("disable-model-invocation"),
    "claude-code owns disable-model-invocation per official docs"
  );
  assert.ok(
    Array.isArray(knownRuntimeKeys.cursor) && knownRuntimeKeys.cursor.includes("disable-model-invocation"),
    "cursor ownership is retained"
  );

  const claudeEvidence = compRule.evidence.find((entry) => entry.source === "claude-code-docs");
  assert.ok(claudeEvidence, "the claude-code key claim is evidence-backed");
  assert.equal(claudeEvidence.verifiedOn, "2026-10-04");
});

test("the claude-code-docs source record reflects the corrected reading", () => {
  const source = knowledgeBase.sources.find((entry) => entry.id === "claude-code-docs");
  assert.ok(source, "claude-code-docs source exists");
  assert.equal(source.url, "https://code.claude.com/docs/en/skills");
  assert.match(source.notes, /name/i);
  assert.match(source.notes, /disable-model-invocation/);
});
