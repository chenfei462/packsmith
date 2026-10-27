import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { parseSkill } from "../../src/core/skill-parser.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";
import { checkActivation } from "../../src/checks/activation.mjs";

/**
 * Offline activation-check tests (plan §11 PS-ACT-001…003, Milestone 4).
 *
 * The activation checks are deterministic heuristics (plan §11 forbids an
 * LLM here): these tests pin the heuristic boundaries so they stay stable.
 * No network, no credentials, temp-dir fixtures only.
 */

const knowledgeBase = await loadKnowledgeBase();
const rules = knowledgeBase.rules;

const GOOD_DESCRIPTION =
  "Reviews pull requests for security regressions when the user asks for a review, and explains each finding.";

const SKILL_TEMPLATE = (description) => `---
name: sample-skill
description: ${description}
---

# Sample Skill

Body text.
`;

async function createSkill(t, content, dirName = "sample-skill") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-act-check-"));
  const skillDir = path.join(tempRoot, dirName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return parseSkill(skillDir);
}

function ids(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.id);
}

test("a description with capability and activation boundary stays clean", async (t) => {
  const skill = await createSkill(t, SKILL_TEMPLATE(GOOD_DESCRIPTION));

  assert.deepEqual(ids(await checkActivation(skill, { rules, displayDir: ".", siblings: [] })), []);
});

test("PS-ACT-001 fires on a too-thin description and reports measured values", async (t) => {
  const skill = await createSkill(t, SKILL_TEMPLATE("Reviews code."));
  const diagnostics = await checkActivation(skill, { rules, displayDir: ".", siblings: [] });

  // "Reviews code." has neither enough substance (PS-ACT-001) nor an
  // activation boundary (PS-ACT-002).
  assert.deepEqual(ids(diagnostics), ["PS-ACT-001", "PS-ACT-002"]);
  assert.match(diagnostics[0].message, /Measured: 13 characters, 2 words/);
  assert.equal(diagnostics[0].severity, "warning");
  assert.equal(diagnostics[0].line, 3);
});

test("PS-ACT-002 fires when the description has no activation boundary", async (t) => {
  // Long and wordy enough for PS-ACT-001, but purely "what", never "when".
  const description =
    "Finds bugs, regressions, missing tests, risky changes, and unclear behavior in source changes.";
  const skill = await createSkill(t, SKILL_TEMPLATE(description));
  const diagnostics = await checkActivation(skill, { rules, displayDir: ".", siblings: [] });

  assert.deepEqual(ids(diagnostics), ["PS-ACT-002"]);
});

test("workflow-position and CJK activation cues count as boundaries", async (t) => {
  const beforeDescription =
    "Research GitHub demand signals, active issues, and trend velocity before committing to a product direction.";
  const before = await createSkill(t, SKILL_TEMPLATE(beforeDescription));
  assert.deepEqual(ids(await checkActivation(before, { rules, displayDir: ".", siblings: [] })), []);

  const cjkDescription = "当你需要审查代码风险并解释每个发现的问题时使用此技能，覆盖安全、正确性与回归测试。";
  const cjk = await createSkill(t, SKILL_TEMPLATE(cjkDescription));
  assert.deepEqual(ids(await checkActivation(cjk, { rules, displayDir: ".", siblings: [] })), []);
});

test("PS-ACT-003 fires once per overlapping sibling pair", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-act-check-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const description =
    "Reviews pull requests when the user asks for a code review pass, and explains each finding clearly.";
  const shared = `---
name: SHARED_NAME
description: ${description}
---

Body.
`;

  for (const dirName of ["alpha-review", "beta-review"]) {
    const skillDir = path.join(tempRoot, dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), shared.replace("SHARED_NAME", dirName), "utf8");
  }

  const alpha = await parseSkill(path.join(tempRoot, "alpha-review"));
  const beta = await parseSkill(path.join(tempRoot, "beta-review"));
  const siblings = [alpha, beta];

  const alphaDiagnostics = await checkActivation(alpha, { rules, displayDir: ".", siblings });
  const betaDiagnostics = await checkActivation(beta, { rules, displayDir: ".", siblings });

  assert.deepEqual(ids(alphaDiagnostics), ["PS-ACT-003"]);
  assert.deepEqual(ids(betaDiagnostics), []); // pair reported once, from the earlier skill
  assert.match(alphaDiagnostics[0].message, /"alpha-review" and "beta-review"/);
  assert.match(alphaDiagnostics[0].message, /Jaccard similarity 1\.00/);
});

test("sibling checks skip skills without a usable description", async (t) => {
  const broken = {
    root: "/tmp/does-not-matter",
    directoryName: "zzz-sibling",
    parse: { status: "missing-frontmatter", error: null },
    frontmatter: null
  };
  const skill = await createSkill(t, SKILL_TEMPLATE(GOOD_DESCRIPTION));

  assert.deepEqual(ids(await checkActivation(skill, { rules, displayDir: ".", siblings: [broken] })), []);
});

test("activation checks are skipped when the frontmatter is unusable", async (t) => {
  const skill = await createSkill(t, "# no frontmatter\n");
  const diagnostics = await checkActivation(skill, { rules, displayDir: ".", siblings: [] });

  assert.deepEqual(diagnostics, []);
});
