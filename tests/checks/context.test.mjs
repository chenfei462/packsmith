import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { parseSkill } from "../../src/core/skill-parser.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";
import { checkContext } from "../../src/checks/context.mjs";

/**
 * Offline context-check tests (plan §11 PS-CTX-001…002, Milestone 4).
 *
 * Pins the two measurable context budgets (500 lines / 5000 estimated
 * tokens) and guards the plan §11 requirement that context checks report
 * measured values — never a synthesized score.
 */

const knowledgeBase = await loadKnowledgeBase();
const rules = knowledgeBase.rules;

async function createSkillWithBody(t, body) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-ctx-check-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: sample-skill\ndescription: Reviews changes when the user asks for a review pass.\n---\n\n${body}`,
    "utf8"
  );
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return parseSkill(skillDir);
}

function ids(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.id);
}

test("a small skill produces no context diagnostics", async (t) => {
  const skill = await createSkillWithBody(t, "# Small\n\nFine.\n");

  assert.deepEqual(ids(await checkContext(skill, { rules })), []);
});

test("PS-CTX-001 fires past the 500-line budget and reports the measured line count", async (t) => {
  const body = Array.from({ length: 520 }, (_, index) => `Line ${index + 1}`).join("\n");
  const skill = await createSkillWithBody(t, body);
  const diagnostics = await checkContext(skill, { rules });

  assert.deepEqual(ids(diagnostics), ["PS-CTX-001"]);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.severity, "warning");
  assert.match(diagnostic.message, /SKILL\.md: 52[0-9] lines/);
  assert.match(diagnostic.message, /Recommended limit: 500 lines/);
  // Plan §12 example: the context diagnostic has no file:line location — the
  // message carries the measured values.
  assert.equal(diagnostic.file, null);
  assert.equal(diagnostic.line, null);
});

test("PS-CTX-002 fires past the 5000-token estimate and reports the estimate", async (t) => {
  // 4 chars ≈ 1 token (parser estimateTokens): 20_016 chars → 5004 tokens.
  const body = `x`.repeat(20016);
  const skill = await createSkillWithBody(t, body);
  const diagnostics = await checkContext(skill, { rules });

  assert.deepEqual(ids(diagnostics), ["PS-CTX-002"]);
  const diagnostic = diagnostics[0];
  assert.match(diagnostic.message, /5004 estimated tokens/);
  assert.match(diagnostic.message, /Recommended limit: 5000 estimated tokens/);
  assert.doesNotMatch(diagnostic.message, /score/i); // no invented "AI Context Score"
});

test("exactly-at-budget values do not fire", async (t) => {
  // 500 body lines + frontmatter → 504 file lines but PS-CTX-001 measures the
  // whole file… so keep the file at exactly 500 lines: 495 body lines.
  const bodyLines = Array.from({ length: 495 }, (_, index) => `Line ${index + 1}`);
  const skill = await createSkillWithBody(t, bodyLines.join("\n"));
  assert.deepEqual(ids(await checkContext(skill, { rules })), []);

  // 5000 estimated tokens = 20000 chars of body → exactly at budget.
  const tokenSkill = await createSkillWithBody(t, `y`.repeat(20000));
  assert.deepEqual(ids(await checkContext(tokenSkill, { rules })), []);
});
