import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { parseSkill } from "../../src/core/skill-parser.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";
import { checkCompatibility } from "../../src/checks/compatibility.mjs";

/**
 * Offline compatibility-check tests (plan §11 PS-COMP-001…002, Milestone 4).
 * Static frontmatter portability analysis only — no network, no runtimes
 * invoked, temp-dir fixtures only.
 */

const knowledgeBase = await loadKnowledgeBase();
const rules = knowledgeBase.rules;

async function createSkill(t, frontmatter) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-comp-check-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n# Sample\n\nBody.\n`,
    "utf8"
  );
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return parseSkill(skillDir);
}

const BASE_FIELDS = `name: sample-skill\ndescription: Reviews changes when the user asks for a review pass.`;

function ids(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.id);
}

test("standard-only frontmatter produces no compatibility diagnostics", async (t) => {
  const skill = await createSkill(t, BASE_FIELDS);

  assert.deepEqual(
    ids(await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null })),
    []
  );
});

test("documented standard fields (license, metadata, allowed-tools) are accepted", async (t) => {
  const skill = await createSkill(t, `${BASE_FIELDS}\nlicense: MIT\nmetadata:\n  owner: platform\nallowed-tools: [git]`);

  assert.deepEqual(
    ids(await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null })),
    []
  );
});

test("PS-COMP-001 reports non-standard frontmatter keys as info", async (t) => {
  const skill = await createSkill(t, `${BASE_FIELDS}\ncustom-field: yes`);
  const diagnostics = await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null });

  assert.deepEqual(ids(diagnostics), ["PS-COMP-001"]);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.severity, "info");
  assert.match(diagnostic.message, /Non-standard key\(s\): custom-field\./);
  assert.equal(diagnostic.file, "SKILL.md");
  assert.equal(diagnostic.line, 4); // custom-field is the 3rd frontmatter line → file line 4
});

test("PS-COMP-002 flags cursor-specific keys with the runtime bound", async (t) => {
  const skill = await createSkill(t, `${BASE_FIELDS}\nglobs: ["src/**"]\nicon: rocket`);
  const diagnostics = await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null });

  // Cursor keys are both non-standard (info) and runtime-specific (warning).
  assert.deepEqual(ids(diagnostics), ["PS-COMP-001", "PS-COMP-002"]);
  const diagnostic = diagnostics[1];
  assert.equal(diagnostic.severity, "warning");
  assert.equal(diagnostic.runtime, "cursor");
  assert.match(diagnostic.message, /cursor-specific key\(s\): globs, icon\./);
});

test("--target cursor makes cursor keys intentional and skips them", async (t) => {
  const skill = await createSkill(t, `${BASE_FIELDS}\nglobs: ["src/**"]`);

  assert.deepEqual(
    ids(await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: "cursor" })),
    []
  );
});

test("both compatibility rules can fire for the same skill", async (t) => {
  const skill = await createSkill(t, `${BASE_FIELDS}\npaths: docs`);
  const diagnostics = await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null });

  assert.deepEqual(ids(diagnostics), ["PS-COMP-001", "PS-COMP-002"]);
});

test("compatibility checks are skipped without a usable frontmatter mapping", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-comp-check-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "# no frontmatter\n", "utf8");
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const skill = await parseSkill(skillDir);
  assert.deepEqual(
    ids(await checkCompatibility(skill, { rules, displayDir: ".", targetRuntime: null })),
    []
  );
});
