import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";

import {
  estimateTokens,
  normalizeFrontmatter,
  parseSkill,
  splitFrontmatter
} from "../../src/core/skill-parser.mjs";
import { discoverSkillRoots } from "../../src/core/workspace.mjs";
import { resolveWithinRoot, toPosixPath } from "../../src/core/paths.mjs";

/**
 * Offline parser tests (plan §7 acceptance list). Every fixture lives in a
 * per-test mkdtemp directory under os.tmpdir(); nothing is written to the
 * repository, ~/.packsmith, or ~/.codex, and no network is touched.
 */

async function makeTempDir(t, prefix = "packsmith-parser-") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

async function writeSkillDir(t, skillName, files) {
  const root = path.join(await makeTempDir(t), skillName);
  await mkdir(root, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }

  return root;
}

test("valid SKILL.md parses into the normalized object (plan §7)", async (t) => {
  const rawBody = "# Review PR\n\nStep one.\n";
  const root = await writeSkillDir(t, "review-pr", {
    "SKILL.md": `---
name: review-pr
description: Review pull requests for risk.
allowed-tools: [git, gh]
---

${rawBody}`
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "ok");
  assert.equal(skill.parse.error, null);
  assert.equal(skill.root, path.resolve(root));
  assert.equal(skill.skillFile, path.join(path.resolve(root), "SKILL.md"));
  assert.equal(skill.directoryName, "review-pr");
  assert.equal(skill.frontmatter.name, "review-pr");
  assert.equal(skill.frontmatter.description, "Review pull requests for risk.");
  // extra frontmatter keys are preserved (plan §7 "...extra")
  assert.deepEqual(skill.frontmatter["allowed-tools"], ["git", "gh"]);
  assert.equal(skill.body, rawBody);
  assert.equal(skill.stats.lines, rawBody.split(/\r?\n/).length);
  assert.equal(skill.stats.chars, rawBody.length);
  assert.equal(skill.stats.estimatedTokens, Math.ceil(rawBody.length / 4));
  assert.equal(skill.stats.fileCount, 1);
});

test("missing SKILL.md is reported, not judged", async (t) => {
  const root = await writeSkillDir(t, "empty-skill", {
    "notes.txt": "no skill here"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "missing-skill-file");
  assert.equal(skill.parse.error, null);
  assert.equal(skill.skillFile, null);
  assert.equal(skill.frontmatter, null);
  assert.equal(skill.body, null);
  assert.equal(skill.stats.chars, 0);
  // supporting files are still counted so diagnostics see the full picture
  assert.equal(skill.stats.fileCount, 1);
  assert.deepEqual(skill.files, ["notes.txt"]);
});

test("missing frontmatter: whole file is body", async (t) => {
  const content = "# Just Markdown\n\nNo frontmatter here.\n";
  const root = await writeSkillDir(t, "plain", { "SKILL.md": content });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "missing-frontmatter");
  assert.equal(skill.frontmatter, null);
  assert.equal(skill.body, content);
  assert.equal(skill.stats.chars, content.length);
});

test("unterminated frontmatter fence counts as missing frontmatter", async (t) => {
  const content = "---\nname: never-closed\n\nBody after a dangling fence.\n";
  const root = await writeSkillDir(t, "unterminated", { "SKILL.md": content });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "missing-frontmatter");
  assert.equal(skill.frontmatter, null);
  assert.equal(skill.body, content);
});

test("invalid YAML surfaces the parser error with position", async (t) => {
  const root = await writeSkillDir(t, "broken-yaml", {
    "SKILL.md": "---\nname: [unclosed\n---\n\nBody text.\n"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "invalid-yaml");
  assert.equal(skill.frontmatter, null);
  assert.equal(skill.body, "Body text.\n");
  assert.equal(typeof skill.parse.error.message, "string");
  assert.ok(skill.parse.error.message.length > 0);
  assert.equal(typeof skill.parse.error.line, "number");
});

test("empty frontmatter normalizes to an empty object", async (t) => {
  const root = await writeSkillDir(t, "empty-fm", {
    "SKILL.md": "---\n---\n\nBody text.\n"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "empty-frontmatter");
  assert.deepEqual(skill.frontmatter, {});
  assert.equal(skill.body, "Body text.\n");
});

test("frontmatter that is valid YAML but not a mapping is reported", async (t) => {
  const root = await writeSkillDir(t, "scalar-fm", {
    "SKILL.md": "---\njust a scalar string\n---\n\nBody text.\n"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "frontmatter-not-mapping");
  assert.deepEqual(skill.frontmatter, {});
  assert.equal(skill.body, "Body text.\n");
});

test("Unicode content keeps its characters and deterministic token estimate", async (t) => {
  const rawBody = "# 审查指南\n\n检查所有拉取请求 🚀\n";
  const root = await writeSkillDir(t, "unicode-skill", {
    "SKILL.md": `---
name: 审查技能
description: 用于审查带 Unicode 中文与 emoji 🚀 的内容。
---

${rawBody}`
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "ok");
  assert.equal(skill.frontmatter.name, "审查技能");
  assert.equal(skill.frontmatter.description, "用于审查带 Unicode 中文与 emoji 🚀 的内容。");
  assert.equal(skill.body, rawBody);
  // chars counts UTF-16 code units — the same measure v0.1 uses for contextChars
  assert.equal(skill.stats.chars, rawBody.length);
  assert.equal(skill.stats.estimatedTokens, Math.ceil(rawBody.length / 4));
});

test("supporting files are inventoried with stable POSIX relative paths", async (t) => {
  const root = await writeSkillDir(t, "with-files", {
    "SKILL.md": "---\nname: with-files\ndescription: Has supporting files.\n---\n\nBody.\n",
    "references/deep/style.md": "nested reference",
    "scripts/run.sh": "echo hi\n",
    "assets/logo.png": "not really a png",
    "top-level.md": "misc"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "ok");
  assert.deepEqual(skill.files, ["SKILL.md", "assets/logo.png", "references/deep/style.md", "scripts/run.sh", "top-level.md"]);
  assert.equal(skill.stats.fileCount, 5);
});

test("references, scripts and assets are grouped by directory convention", async (t) => {
  const root = await writeSkillDir(t, "grouped", {
    "SKILL.md": "---\nname: grouped\ndescription: Grouped files.\n---\n\nBody.\n",
    "references/a.md": "a",
    "references/b.md": "b",
    "scripts/run.sh": "echo hi\n",
    "assets/icon.png": "icon"
  });

  const skill = await parseSkill(root);

  assert.deepEqual(skill.references, ["references/a.md", "references/b.md"]);
  assert.deepEqual(skill.scripts, ["scripts/run.sh"]);
  assert.deepEqual(skill.assets, ["assets/icon.png"]);
});

test("parseSkill throws only for a nonexistent root (caller bug, not a skill fact)", async (t) => {
  const missing = path.join(os.tmpdir(), "packsmith-parser-does-not-exist-9f8e7d");

  await assert.rejects(() => parseSkill(missing), /does not exist/);
});

test("a UTF-8 BOM before the frontmatter fence is tolerated", async (t) => {
  const root = await writeSkillDir(t, "bom-skill", {
    // "\uFEFF" is written via escape so no invisible char lives in this source file
    "SKILL.md": "\uFEFF---\nname: bom-skill\ndescription: Starts with a BOM.\n---\n\nBody.\n"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "ok");
  assert.equal(skill.frontmatter.name, "bom-skill");
  assert.equal(skill.body, "Body.\n");
});

test("CRLF line endings parse cleanly", async (t) => {
  const root = await writeSkillDir(t, "crlf-skill", {
    "SKILL.md": "---\r\nname: crlf-skill\r\ndescription: Windows line endings.\r\n---\r\n\r\nBody line.\r\n"
  });

  const skill = await parseSkill(root);

  assert.equal(skill.parse.status, "ok");
  assert.equal(skill.frontmatter.name, "crlf-skill");
  assert.equal(skill.body, "Body line.\r\n");
});

test("normalizeFrontmatter pulls name/description out and keeps the rest", () => {
  assert.deepEqual(
    normalizeFrontmatter({ name: "x", description: "y", license: "MIT", metadata: { a: 1 } }),
    { name: "x", description: "y", license: "MIT", metadata: { a: 1 } }
  );
  assert.deepEqual(normalizeFrontmatter({ license: "MIT" }), { name: null, description: null, license: "MIT" });
  assert.deepEqual(normalizeFrontmatter({}), { name: null, description: null });
});

test("splitFrontmatter is a pure splitter with documented rules", () => {
  assert.deepEqual(splitFrontmatter("---\nname: a\n---\nBody\n"), {
    frontmatterText: "name: a",
    body: "Body\n",
    hasBlock: true,
    bodyStartLine: 4
  });
  assert.deepEqual(splitFrontmatter("no fences at all"), {
    frontmatterText: null,
    body: "no fences at all",
    hasBlock: false,
    bodyStartLine: null
  });
  // The body start is derived from the closing fence, so identical text
  // inside the frontmatter cannot drag the offset to the wrong line.
  assert.equal(splitFrontmatter('---\nname: hi\ndescription: "hi"\n---\nhi').bodyStartLine, 5);
});

test("estimateTokens uses the documented chars/4 ceiling", () => {
  assert.equal(estimateTokens(0), 0);
  assert.equal(estimateTokens(1), 1);
  assert.equal(estimateTokens(4), 1);
  assert.equal(estimateTokens(5), 2);
  assert.equal(estimateTokens(24000), 6000);
});

test("resolveWithinRoot contains paths inside the skill root", () => {
  const root = path.resolve(os.tmpdir());

  assert.equal(resolveWithinRoot(root, "references/a.md"), path.join(root, "references", "a.md"));
  assert.equal(resolveWithinRoot(root, "../escape.md"), null);
  assert.equal(resolveWithinRoot(root, "a/../../escape.md"), null);
  assert.equal(resolveWithinRoot(root, "."), null);
});

test("toPosixPath normalizes platform separators", () => {
  assert.equal(toPosixPath("a/b/c"), "a/b/c");
  assert.equal(toPosixPath(path.join("a", "b", "c")), "a/b/c");
});

test("workspace discovery prefers skills/ then direct children", async (t) => {
  const workspace = await makeTempDir(t, "packsmith-ws-");
  await mkdir(path.join(workspace, "skills", "beta"), { recursive: true });
  await mkdir(path.join(workspace, "skills", "alpha"), { recursive: true });
  await mkdir(path.join(workspace, "loose"), { recursive: true });

  for (const dir of ["skills/beta", "skills/alpha", "loose"]) {
    await writeFile(path.join(workspace, dir, "SKILL.md"), "---\nname: x\ndescription: d.\n---\n\nBody.\n", "utf8");
  }

  assert.deepEqual(await discoverSkillRoots(workspace), [
    path.join(workspace, "skills", "alpha"),
    path.join(workspace, "skills", "beta")
  ]);

  // without skills/ children, direct children with SKILL.md are discovered
  await rm(path.join(workspace, "skills"), { recursive: true, force: true });
  assert.deepEqual(await discoverSkillRoots(workspace), [path.join(workspace, "loose")]);
});

test("a directory that is itself a skill is a single-skill workspace", async (t) => {
  const root = await writeSkillDir(t, "solo-skill", {
    "SKILL.md": "---\nname: solo-skill\ndescription: Alone.\n---\n\nBody.\n"
  });

  assert.deepEqual(await discoverSkillRoots(root), [path.resolve(root)]);
});
