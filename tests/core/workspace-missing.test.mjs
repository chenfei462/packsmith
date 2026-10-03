import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { discoverSkillRoots } from "../../src/core/workspace.mjs";
import { runDoctor } from "../../src/doctor.mjs";

/**
 * Wave 1 acceptance regression (Codex report P1): within the conventional
 * `skills/` container EVERY subdirectory is a candidate skill, including one
 * whose SKILL.md is missing — doctor must report PS-SPEC-001 for it instead
 * of silently skipping it and returning PASS. Outside a skills/ container,
 * ordinary project directories are still NOT treated as skills.
 *
 * Offline: temp fixtures under os.tmpdir() only, removed in t.after.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_SKILL = `---
name: valid
description: Reviews changes for risk when the user asks for a review pass.
---

# Valid

Read the change and rank the findings by severity.
`;

async function makeWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-ws-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeSkill(root, relativeDir, fileName, content) {
  const dir = path.join(root, ...relativeDir.split("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content, "utf8");
}

test("skills container reports every subdirectory as a candidate, valid or not", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "skills/valid", "SKILL.md", VALID_SKILL);
  await writeSkill(root, "skills/missing", "README.md", "# not a skill file\n");

  const roots = await discoverSkillRoots(root);

  assert.equal(roots.length, 2);
  assert.ok(roots.includes(path.join(root, "skills", "missing")));
  assert.ok(roots.includes(path.join(root, "skills", "valid")));
});

test("doctor fails the workspace when a sibling skill is missing SKILL.md", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "skills/valid", "SKILL.md", VALID_SKILL);
  await writeSkill(root, "skills/missing", "README.md", "# not a skill file\n");

  const report = await runDoctor({ targetPath: root });

  assert.equal(report.status, "fail");
  assert.equal(report.exitCode, 1);
  assert.equal(report.skills.length, 2);
  const missing = report.diagnostics.find(
    (diagnostic) => diagnostic.id === "PS-SPEC-001" && diagnostic.file === "skills/missing/SKILL.md"
  );
  assert.ok(missing, "expected PS-SPEC-001 for skills/missing/SKILL.md");
  assert.equal(missing.severity, "error");
});

test("a missing-skill candidate does not mask the valid sibling", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "skills/valid", "SKILL.md", VALID_SKILL);
  await writeSkill(root, "skills/missing", "README.md", "# not a skill file\n");

  const report = await runDoctor({ targetPath: root });
  const valid = report.skills.find((skill) => skill.directory === "skills/valid");

  assert.ok(valid, "valid sibling still examined");
  assert.ok(valid.diagnostics.every((diagnostic) => diagnostic.id !== "PS-SPEC-001"));
});

test("loose subdirectories without SKILL.md are not treated as skills", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "alpha", "SKILL.md", VALID_SKILL.replace("name: valid", "name: alpha"));
  await writeSkill(root, "beta", "README.md", "# not a skill\n");
  await writeSkill(root, "docs", "notes.md", "text\n");

  const roots = await discoverSkillRoots(root);

  assert.deepEqual(roots, [path.join(root, "alpha")]);
});

test("a workspace with no skill candidates at all is reported once, not per directory", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "docs", "notes.md", "text\n");
  await writeSkill(root, "src", "index.mjs", "export {};\n");

  const report = await runDoctor({ targetPath: root });

  assert.equal(report.exitCode, 1);
  const spec001 = report.diagnostics.filter((diagnostic) => diagnostic.id === "PS-SPEC-001");
  assert.equal(spec001.length, 1);
  assert.match(spec001[0].message, /No skill directory was found/);
});

test("plain files inside the skills container are ignored, directories are candidates", async (t) => {
  const root = await makeWorkspace(t);
  await writeSkill(root, "skills", "README.md", "# container note\n");
  await writeSkill(root, "skills/gap", "NOTES.md", "no skill file here\n");

  const roots = await discoverSkillRoots(root);

  assert.deepEqual(roots, [path.join(root, "skills", "gap")]);
});
