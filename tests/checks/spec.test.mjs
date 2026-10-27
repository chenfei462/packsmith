import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { parseSkill } from "../../src/core/skill-parser.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";
import { checkSpec, referencedBodyFiles } from "../../src/checks/spec.mjs";

/**
 * Offline spec-check tests (plan §11 PS-SPEC-001…010, v0.2 Milestone 4).
 *
 * No network, no credentials, no model calls. Fixtures are mkdtemp skill
 * directories under os.tmpdir() (removed in t.after); the real ~/.packsmith
 * and ~/.codex state is never touched.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeBase = await loadKnowledgeBase();
const rules = knowledgeBase.rules;

const VALID_SKILL = `---
name: sample-skill
description: Reviews changes for risk when the user asks for a review pass.
---

# Sample Skill

Read the change and rank the findings by severity.
`;

const SKILL_WITH_REFERENCE = `${VALID_SKILL}
See [notes](references/notes.md) for details.
`;

async function createSkill(t, content, { files = {} } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-spec-check-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");

  for (const [relativePath, fileContent] of Object.entries(files)) {
    const filePath = path.join(skillDir, ...relativePath.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, fileContent, "utf8");
  }

  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return parseSkill(skillDir);
}

function ids(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.id);
}

test("a valid skill produces no spec diagnostics", async (t) => {
  const skill = await createSkill(t, SKILL_WITH_REFERENCE, {
    files: { "references/notes.md": "# Notes\n" }
  });
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), []);
});

test("PS-SPEC-001 fires when SKILL.md is missing", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-spec-check-"));
  const skillDir = path.join(tempRoot, "empty-skill");
  await mkdir(skillDir, { recursive: true });
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const skill = await parseSkill(skillDir);
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-001"]);
  assert.equal(diagnostics[0].severity, "error");
  assert.equal(diagnostics[0].file, "SKILL.md");
});

test("PS-SPEC-002 fires when the frontmatter block is missing", async (t) => {
  const skill = await createSkill(t, "# No frontmatter\n\nJust body text.\n");
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-002"]);
  assert.equal(diagnostics[0].line, 1);
});

test("PS-SPEC-003 fires on invalid YAML with the file line", async (t) => {
  const skill = await createSkill(t, "---\nname: [unclosed\n---\n\nBody\n");
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.ok(ids(diagnostics).includes("PS-SPEC-003"));
  const diagnostic = diagnostics.find((entry) => entry.id === "PS-SPEC-003");
  assert.equal(diagnostic.file, "SKILL.md");
  assert.equal(diagnostic.line, 2);
});

test("PS-SPEC-004 and PS-SPEC-008 fire on empty frontmatter", async (t) => {
  const skill = await createSkill(t, "---\n---\n\nBody\n");
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-004", "PS-SPEC-008"]);
});

test("PS-SPEC-005 fires on an invalid name format", async (t) => {
  const skill = await createSkill(t, VALID_SKILL.replace("name: sample-skill", "name: Sample_Skill"));
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.ok(ids(diagnostics).includes("PS-SPEC-005"));
});

test("PS-SPEC-006 fires on names over 64 characters", async (t) => {
  const longName = "a".repeat(65);
  const skill = await createSkill(t, VALID_SKILL.replace("name: sample-skill", `name: ${longName}`));
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.ok(ids(diagnostics).includes("PS-SPEC-006"));
  assert.match(diagnostics.find((entry) => entry.id === "PS-SPEC-006").message, /65 characters/);
});

test("PS-SPEC-007 fires on a name/directory mismatch", async (t) => {
  const skill = await createSkill(t, VALID_SKILL.replace("name: sample-skill", "name: other-name"));
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-007"]);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.line, 2);
  assert.match(diagnostic.message, /"other-name" does not match directory "sample-skill"/);
});

test("PS-SPEC-008 fires when the description is missing", async (t) => {
  const skill = await createSkill(t, VALID_SKILL.replace(/description: .*\n/, ""));
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-008"]);
});

test("PS-SPEC-009 fires on descriptions over 1024 characters", async (t) => {
  const longDescription = "x".repeat(1025);
  const skill = await createSkill(t, VALID_SKILL.replace(/description: .*/, `description: ${longDescription}`));
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.ok(ids(diagnostics).includes("PS-SPEC-009"));
  assert.match(diagnostics.find((entry) => entry.id === "PS-SPEC-009").message, /1025 characters/);
});

test("PS-SPEC-010 fires on a referenced file that does not exist", async (t) => {
  const skill = await createSkill(t, SKILL_WITH_REFERENCE);
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });

  assert.deepEqual(ids(diagnostics), ["PS-SPEC-010"]);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.file, "SKILL.md");
  assert.equal(diagnostic.line, 10); // the link is file line 10 (fences + 2 frontmatter lines + body)
  assert.match(diagnostic.message, /references\/notes\.md/);
});

test("PS-SPEC-010 skips URLs, anchors and absolute paths", () => {
  const body = [
    "- [site](https://example.com/guide)",
    "- [anchor](#section)",
    "- [mail](mailto:a@b.com)",
    "- [absolute](/etc/hosts)",
    "- [resolved](references/notes.md)"
  ].join("\n");

  assert.deepEqual(
    referencedBodyFiles(body).map((entry) => entry.target),
    ["references/notes.md"]
  );
});

test("spec diagnostics carry knowledge-base provenance and fix metadata", async (t) => {
  const skill = await createSkill(t, SKILL_WITH_REFERENCE);
  const diagnostics = await checkSpec(skill, { rules, displayDir: "skills/sample-skill" });
  const mismatch = diagnostics.find((entry) => entry.id === "PS-SPEC-010");

  assert.deepEqual(mismatch.evidence, ["agent-skills-spec"]);
  assert.deepEqual(mismatch.fix, { available: false, safe: false });
  assert.equal(mismatch.file, "skills/sample-skill/SKILL.md");
});
