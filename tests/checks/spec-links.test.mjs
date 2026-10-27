import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { parseSkill } from "../../src/core/skill-parser.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";
import { checkSpec, referencedBodyFiles } from "../../src/checks/spec.mjs";
import { bodyLineOffset } from "../../src/checks/support.mjs";
import { runDoctor } from "../../src/doctor.mjs";

/**
 * Wave 1 acceptance regressions for PS-SPEC-010 link resolution and the
 * body-line mapping used for diagnostics (Codex acceptance report P2 items).
 *
 * Standard Markdown destinations — percent-encoded paths, angle-bracket
 * destinations with spaces, anchors, and titles — must resolve against the
 * real files on disk; the diagnostic line must point at the BODY occurrence
 * of a link, never at identical text inside the frontmatter.
 *
 * Offline: temp fixtures under os.tmpdir() only, removed in t.after.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeBase = await loadKnowledgeBase();
const rules = knowledgeBase.rules;

const HEADER = `---
name: sample-skill
description: Reviews changes for risk when the user asks for a review pass.
---
`;

async function createSkill(t, content, files = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-spec-links-"));
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

function spec010(diagnostics) {
  return diagnostics.filter((diagnostic) => diagnostic.id === "PS-SPEC-010");
}

test("percent-encoded destination resolves when the spaced file exists", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/a%20b.md) for details.\n`, {
    "references/a b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("angle-bracket destination with spaces resolves when the file exists", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](<references/a b.md>) for details.\n`, {
    "references/a b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("anchor after a percent-encoded destination is not part of the filename", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/a%20b.md#section) for details.\n`, {
    "references/a b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("destination with a Markdown title still resolves", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/a%20b.md "Reference title") for details.\n`, {
    "references/a b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("angle-bracket destination wraps only the destination — the fragment still is one", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](<references/a b.md#section>) for details.\n`, {
    "references/a b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("Markdown backslash escapes are removed inside angle-bracket destinations", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](<references/a\\!b.md>) for details.\n`, {
    "references/a!b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("Markdown backslash escapes are removed in bare destinations too", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/a\\!b.md) for details.\n`, {
    "references/a!b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("a percent-encoded link resolves to the DECODED path, never the literal name", async (t) => {
  // Only p%20q.md exists on disk; the URI "references/p%20q.md" decodes to
  // "p q.md", which is what a reader looks for. The literal file must not
  // silence a genuinely missing reference.
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/p%20q.md) for details.\n`, {
    "references/p%20q.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 1);
});

test("a literal percent-encoded filename is referenced by double-encoding", async (t) => {
  // %25 decodes to '%', so references/p%2520q.md addresses the literal file
  // references/p%20q.md on disk (exactly one decode).
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/p%2520q.md) for details.\n`, {
    "references/p%20q.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("an encoded %23 decodes into a literal filename character, not a fragment", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/a%23b.md) for details.\n`, {
    "references/a#b.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("a filename with a malformed percent sequence still resolves", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/100%.md) for details.\n`, {
    "references/100%.md": "existing reference content\n"
  });

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 0);
});

test("genuinely missing referenced files are still reported", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](references/gone.md) for details.\n`);

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  const findings = spec010(diagnostics);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /gone\.md/);
});

test("angle-bracket destination pointing at a missing file is still reported", async (t) => {
  const skill = await createSkill(t, `${HEADER}\nSee [reference](<references/gone.md>) for details.\n`);

  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  assert.equal(spec010(diagnostics).length, 1);
});

test("PS-SPEC-010 line points at the body link, not identical frontmatter text", async (t) => {
  // The frontmatter description contains the exact same link text as the
  // body; the diagnostic line must be the body occurrence (file line 6).
  const content = `---
name: sample-skill
description: mentions [reference](references/gone.md) inside frontmatter text
---

See [reference](references/gone.md) for details.
`;
  const skill = await createSkill(t, content);
  const diagnostics = await checkSpec(skill, { rules, displayDir: "." });
  const findings = spec010(diagnostics);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
});

test("bodyLineOffset counts fence lines, not the first occurrence of the body", () => {
  // Codex acceptance case: the body text "hi" also appears inside the
  // frontmatter, so indexOf(body) used to lock onto the frontmatter line.
  // Body line 1 is file line 5, so the offset is 4.
  assert.equal(bodyLineOffset('---\nname: hi\ndescription: "hi"\n---\nhi'), 4);
  assert.equal(bodyLineOffset("---\nname: hi\ndescription: hi\n---\nhi"), 4);
  // A blank line between the fence and the body still counts: the body
  // starts on file line 6 here, so the offset is 5.
  assert.equal(bodyLineOffset("---\nname: x\ndescription: y\n---\n\nbody line\n"), 5);
  assert.equal(bodyLineOffset("---\r\nname: hi\r\n---\r\nbody\r\n"), 3);
  assert.equal(bodyLineOffset("no frontmatter at all\nbody\n"), 0);
  assert.equal(bodyLineOffset("---\nname: x\n---\n"), 0);
  assert.equal(bodyLineOffset(null), 0);
});

test("referencedBodyFiles returns decoded targets and skips non-files", () => {
  const body = [
    "A [one](references/a%20b.md) and [two](<references/c d.md>) with [three](https://example.com/x.md).",
    "B [anchor-only](#section) [absolute](/etc/passwd) [title](references/t.md \"Title\") duplicate [one again](references/a%20b.md)."
  ].join("\n");

  const targets = referencedBodyFiles(body);
  const paths = targets.map((entry) => entry.target);

  assert.ok(paths.includes("references/a b.md"));
  assert.ok(paths.includes("references/c d.md"));
  assert.ok(paths.includes("references/t.md"));
  // URL, anchor-only and absolute targets are not file references.
  assert.ok(!paths.some((entry) => entry.includes("example.com")));
  assert.ok(!paths.includes("section"));
  assert.ok(!paths.includes("/etc/passwd"));
  // Deduplicated by resolved target: "one" appears once.
  assert.equal(paths.filter((entry) => entry === "references/a b.md").length, 1);
  // The reported line is the 1-based body line of the first link.
  assert.equal(targets.find((entry) => entry.target === "references/a b.md").line, 1);
});

// ---------------------------------------------------------------------------
// Codex round-2 acceptance: the same link semantics proven at the real
// doctor level (end-to-end through discovery, parse, checks, exit codes).
// ---------------------------------------------------------------------------

test("doctor accepts an angle-bracket destination with a fragment when the file exists", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-spec-links-e2e-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `${HEADER}\nSee [reference](<references/a b.md#section>) for details.\n`, "utf8");
  await mkdir(path.join(skillDir, "references"), { recursive: true });
  await writeFile(path.join(skillDir, "references", "a b.md"), "content\n", "utf8");
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const report = await runDoctor({ targetPath: skillDir });

  assert.equal(report.exitCode, 0);
  assert.equal(report.diagnostics.filter((diagnostic) => diagnostic.id === "PS-SPEC-010").length, 0);
});

test("doctor still reports a genuinely missing referenced file (exit 1)", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-spec-links-e2e-"));
  const skillDir = path.join(tempRoot, "sample-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `${HEADER}\nSee [reference](references/gone.md) for details.\n`, "utf8");
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const report = await runDoctor({ targetPath: skillDir });

  assert.equal(report.exitCode, 1);
  assert.equal(report.diagnostics.filter((diagnostic) => diagnostic.id === "PS-SPEC-010").length, 1);
});
