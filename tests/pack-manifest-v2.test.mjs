import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPack, inspectPack, installBundle, validatePack } from "../src/lib/pack.mjs";

// M12 optional Manifest v2 (schemaVersion: 2): `skills` are safe relative
// directory-path strings and each Skill's id/description come from its own
// SKILL.md frontmatter. v1 (missing schemaVersion or explicit 1) keeps the
// existing object-entry semantics. The normalizer is the single boundary
// shared by fail-fast loading and collected validation; it is imported
// dynamically so the red phase of the TDD cycle reports meaningful
// per-test failures instead of a module-load error.

async function boundary() {
  const mod = await import("../src/lib/pack.mjs");
  return mod.normalizeSourceManifest;
}

const V1_MANIFEST = {
  name: "v1-pack",
  description: "Unversioned v1 fixture pack.",
  version: "0.1.0",
  targets: ["claude-code"],
  skills: [
    { id: "review-pr", path: "skills/review-pr", description: "Review PRs (declared in the v1 manifest)." }
  ],
  prompts: [
    { id: "starter", path: "prompts/starter.md", description: "Starter prompt." }
  ]
};

function v2Manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    name: "v2-pack",
    description: "Opt-in v2 fixture pack.",
    version: "0.2.0",
    targets: ["claude-code"],
    skills: ["skills/review-pr"],
    prompts: [
      { id: "starter", path: "prompts/starter.md", description: "Starter prompt." }
    ],
    ...overrides
  };
}

async function writeSkillDir(packDir, relativeDir, { name = "review-pr", description = "Review pull requests when asked.", frontmatter = null, noSkillMd = false } = {}) {
  const dir = path.join(packDir, ...relativeDir.split("/"));
  await fs.mkdir(dir, { recursive: true });
  if (!noSkillMd) {
    const fm = frontmatter ?? `name: ${name}\ndescription: ${description}`;
    await fs.writeFile(path.join(dir, "SKILL.md"), `---\n${fm}\n---\n\nBody.\n`, "utf8");
  }
  return dir;
}

async function makePack(t, manifest, { skills = [{ dir: "skills/review-pr" }], prompts = ["prompts/starter.md"] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "packsmith-m12-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packDir = path.join(root, "pack");
  await fs.mkdir(packDir, { recursive: true });
  for (const skill of skills) await writeSkillDir(packDir, skill.dir, skill);
  for (const prompt of prompts) {
    const file = path.join(packDir, ...prompt.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "# Starter prompt\n", "utf8");
  }
  const manifestPath = path.join(packDir, "packsmith.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { root, packDir, manifestPath };
}

function collectedErrors(error) {
  return error?.reasonDetails?.errors ?? [];
}

// ---------------------------------------------------------------------------
// Task 1 — v1 compatibility freeze and the v2 happy path.
// ---------------------------------------------------------------------------

test("v1 behavior is identical without schemaVersion and with explicit schemaVersion 1", async (t) => {
  for (const manifest of [V1_MANIFEST, { ...V1_MANIFEST, schemaVersion: 1 }]) {
    const { root, packDir } = await makePack(t, manifest);
    const validated = await validatePack(packDir);
    assert.equal(validated.skillCount, 1);
    assert.deepEqual(validated.manifest.skills, manifest.skills);
    const inspected = await inspectPack(packDir);
    assert.deepEqual(inspected.skills.map((skill) => [skill.id, skill.path]), [["review-pr", "skills/review-pr"]]);
    const built = await buildPack(packDir, path.join(root, "dist"));
    const builtManifest = JSON.parse(await fs.readFile(path.join(built.outputRoot, "manifest.json"), "utf8"));
    assert.deepEqual(builtManifest, manifest);
  }
});

test("v2 derives id and description from SKILL.md, builds compatible bundles, installs, and never rewrites the source", async (t) => {
  const manifest = v2Manifest();
  const { root, packDir, manifestPath } = await makePack(t, manifest);
  const sourceBefore = await fs.readFile(manifestPath, "utf8");

  const validated = await validatePack(packDir);
  assert.equal(validated.skillCount, 1);
  assert.deepEqual(validated.manifest.skills, [
    { id: "review-pr", path: "skills/review-pr", description: "Review pull requests when asked." }
  ]);

  const inspected = await inspectPack(packDir);
  // inspectPack's skill summaries carry id/path/metrics only (existing v1
  // shape); the derived description is asserted at the manifest level below.
  assert.deepEqual(inspected.skills.map((skill) => skill.id), ["review-pr"]);

  const built = await buildPack(packDir, path.join(root, "dist"));
  const builtManifest = JSON.parse(await fs.readFile(path.join(built.outputRoot, "manifest.json"), "utf8"));
  assert.equal(builtManifest.schemaVersion, 2);
  assert.deepEqual(builtManifest.skills, [
    { id: "review-pr", path: "skills/review-pr", description: "Review pull requests when asked." }
  ]);

  const installed = await installBundle(built.outputRoot, { dest: path.join(root, "installed") });
  const installedManifest = JSON.parse(await fs.readFile(path.join(installed.installDir, "manifest.json"), "utf8"));
  assert.deepEqual(installedManifest.skills, builtManifest.skills);

  assert.equal(await fs.readFile(manifestPath, "utf8"), sourceBefore);
});

test("v2 prompts default to an empty list when omitted", async (t) => {
  const manifest = v2Manifest();
  delete manifest.prompts;
  const { root, packDir } = await makePack(t, manifest, { prompts: [] });
  const built = await buildPack(packDir, path.join(root, "dist"));
  const builtManifest = JSON.parse(await fs.readFile(path.join(built.outputRoot, "manifest.json"), "utf8"));
  assert.deepEqual(builtManifest.prompts, []);
});

// ---------------------------------------------------------------------------
// Task 2 — unsupported, ambiguous, malformed and unsafe v2 inputs fail
// before any output write. Every negative asserts on the shared boundary so
// the collected and fail-fast paths enforce the same contract.
// ---------------------------------------------------------------------------

test("unsupported schemaVersion fails deterministically before any build output", async (t) => {
  const normalize = await boundary();
  for (const bad of [3, 0, "2", null]) {
    const manifest = v2Manifest({ schemaVersion: bad });
    const { root, packDir } = await makePack(t, manifest);

    const result = await normalize(manifest, packDir);
    assert.deepEqual(result.issues, ["packsmith.json: unsupported schemaVersion (expected 1, or omitted, or 2)."]);
    assert.equal(result.manifest, null);

    await assert.rejects(validatePack(packDir), (error) =>
      collectedErrors(error).some((message) => /unsupported schemaVersion/.test(message))
    );
    await assert.rejects(buildPack(packDir, path.join(root, "dist")), /unsupported schemaVersion/);
    await assert.rejects(fs.stat(path.join(root, "dist", manifest.name)), { code: "ENOENT" });
  }
});

test("v2 rejects mixed object and string skill entries, empty paths and missing/empty skills", async (t) => {
  const normalize = await boundary();
  const cases = [
    [{ skills: ["skills/review-pr", { id: "other", path: "skills/other", description: "x" }] }, /entries must be non-empty relative directory path strings/],
    [{ skills: [] }, /manifest\.skills must be a non-empty array of skill directory path strings/],
    [{ skills: [""] }, /entries must be non-empty relative directory path strings/]
  ];
  for (const [overrides, pattern] of cases) {
    const manifest = v2Manifest(overrides);
    const { packDir } = await makePack(t, manifest);
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => pattern.test(message)), `expected ${JSON.stringify(result.issues)} to match ${pattern}`);
    await assert.rejects(validatePack(packDir), (error) => collectedErrors(error).some((message) => pattern.test(message)));
  }
});

test("v2 rejects duplicate paths and duplicate SKILL.md-derived ids", async (t) => {
  const normalize = await boundary();
  {
    const manifest = v2Manifest({ skills: ["skills/review-pr", "skills/review-pr"] });
    const { packDir } = await makePack(t, manifest);
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => /duplicate skill path "skills\/review-pr"/.test(message)));
  }
  {
    const manifest = v2Manifest({ skills: ["skills/review-pr", "skills/again"] });
    const { packDir } = await makePack(t, manifest, { skills: [{ dir: "skills/review-pr" }, { dir: "skills/again" }] });
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => /duplicate skill id "review-pr" derived from SKILL\.md/.test(message)));
  }
});

test("v2 rejects missing SKILL.md and unusable frontmatter without echoing raw YAML", async (t) => {
  const normalize = await boundary();
  {
    const manifest = v2Manifest();
    const { packDir } = await makePack(t, manifest, { skills: [{ dir: "skills/review-pr", noSkillMd: true }] });
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => /skill path "skills\/review-pr" must include SKILL\.md/.test(message)));
  }
  {
    const manifest = v2Manifest();
    const yaml = "name: [unclosed-secret-marker\ndescription: broken";
    const { packDir } = await makePack(t, manifest, { skills: [{ dir: "skills/review-pr", frontmatter: yaml }] });
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => /no usable frontmatter \(invalid-yaml\)/.test(message)));
    assert.ok(!result.issues.join("\n").includes("unclosed-secret-marker"), "raw YAML content must never be echoed");
  }
  {
    for (const [frontmatter, pattern] of [
      ["description: only-description", /missing a usable name/],
      ["name: only-name", /missing a usable description/],
      ['name: ""\ndescription: present', /missing a usable name/],
      ["name: 42\ndescription: present", /missing a usable name/]
    ]) {
      const manifest = v2Manifest();
      const { packDir } = await makePack(t, manifest, { skills: [{ dir: "skills/review-pr", frontmatter }] });
      const result = await normalize(manifest, packDir);
      assert.ok(result.issues.some((message) => pattern.test(message)), `expected ${JSON.stringify(result.issues)} to match ${pattern}`);
    }
  }
});

test("v2 rejects traversal, absolute, backslash, ADS, reserved-name and malformed path entries", async (t) => {
  const normalize = await boundary();
  const cases = [
    ["../outside", /safe relative path that stays inside the pack directory/],
    ["/absolute/path", /safe relative path, not an absolute path/],
    ["C:\\abs", /safe relative path using forward slashes/],
    ["skills\\sub", /safe relative path using forward slashes/],
    ["skills/evil:ads", /alternate data stream separators/],
    ["skills/con", /Windows reserved device name/],
    ["skills/x.", /trailing dots or spaces/],
    ["./relative", /safe relative path/],
    ["skills//double", /safe relative path/],
    ["skills/..", /safe relative path that stays inside the pack directory/]
  ];
  for (const [badPath, pattern] of cases) {
    const manifest = v2Manifest({ skills: [badPath] });
    const { packDir } = await makePack(t, manifest);
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => pattern.test(message)), `expected ${JSON.stringify(result.issues)} to match ${pattern} for ${badPath}`);
    assert.equal(result.manifest, null);
  }
});

test("v2 refuses a skill directory whose realpath escapes the pack before reading outside it", async (t) => {
  const normalize = await boundary();
  const manifest = v2Manifest({ skills: ["skills/link"] });
  const { root, packDir } = await makePack(t, manifest);
  const outsideDir = path.join(root, "outside-skill");
  await fs.mkdir(outsideDir, { recursive: true });
  await fs.writeFile(path.join(outsideDir, "SKILL.md"), "---\nname: outside-skill\ndescription: OUTSIDE ESCAPE MARKER\n---\n", "utf8");

  const linkDir = path.join(packDir, "skills", "link");
  const kind = process.platform === "win32" ? "junction" : "dir";
  try {
    await fs.symlink(outsideDir, linkDir, kind);
  } catch {
    t.skip("symlink/junction creation unavailable on this platform");
    return;
  }

  const result = await normalize(manifest, packDir);
  assert.equal(result.manifest, null);
  assert.ok(result.issues.some((message) => /resolves outside the pack directory/.test(message)));
  assert.ok(!result.issues.join("\n").includes("OUTSIDE ESCAPE MARKER"), "outside content must never be adopted or echoed");
  await assert.rejects(validatePack(packDir), (error) =>
    collectedErrors(error).some((message) => /resolves outside the pack directory/.test(message))
  );
});

test("v2 refuses a SKILL.md symlink that escapes the pack", async (t) => {
  const normalize = await boundary();
  const manifest = v2Manifest();
  const { root, packDir } = await makePack(t, manifest);
  const outsideFile = path.join(root, "outside-SKILL.md");
  await fs.writeFile(outsideFile, "---\nname: outside\ndescription: OUTSIDE FILE MARKER\n---\n", "utf8");

  const skillFile = path.join(packDir, "skills", "review-pr", "SKILL.md");
  await fs.rm(skillFile);
  try {
    await fs.symlink(outsideFile, skillFile, "file");
  } catch {
    t.skip("symlink creation unavailable on this platform");
    return;
  }

  const result = await normalize(manifest, packDir);
  assert.equal(result.manifest, null);
  assert.ok(result.issues.some((message) => /resolves outside the pack directory/.test(message)));
  assert.ok(!result.issues.join("\n").includes("OUTSIDE FILE MARKER"));
});

test("a junction swapped in after SKILL.md verification is refused without adopting outside frontmatter", async (t) => {
  const normalize = await boundary();
  const manifest = v2Manifest();
  const { root, packDir } = await makePack(t, manifest);
  const outsideDir = path.join(root, "outside-swapped");
  await fs.mkdir(outsideDir, { recursive: true });
  await fs.writeFile(path.join(outsideDir, "SKILL.md"), "---\nname: outside\ndescription: OUTSIDE SWAP MARKER\n---\n", "utf8");

  const realSkillDir = path.join(packDir, "skills", "review-pr");
  const originalSkillContent = await fs.readFile(path.join(realSkillDir, "SKILL.md"), "utf8");
  const originalRealpath = fs.realpath;
  let swapped = false;
  const patchedRealpath = async (target, options) => {
    const result = await originalRealpath(target, options);
    // Swap the verified skill directory for a junction to the outside right
    // after its SKILL.md resolved inside the pack — the exact gap between
    // verification and read that the opened-handle fix must close.
    if (!swapped && String(target).endsWith("SKILL.md")) {
      swapped = true;
      await fs.rm(realSkillDir, { recursive: true, force: true });
      await fs.symlink(outsideDir, realSkillDir, process.platform === "win32" ? "junction" : "dir");
    }
    return result;
  };
  fs.realpath = patchedRealpath;
  try {
    const result = await normalize(manifest, packDir);
    assert.ok(swapped, "the probe swap must have fired");
    assert.equal(result.manifest, null);
    assert.ok(
      result.issues.some((message) => /resolves outside the pack directory|swapped while being verified/.test(message)),
      `expected a refusal, got ${JSON.stringify(result.issues)}`
    );
    assert.ok(!result.issues.join("\n").includes("OUTSIDE SWAP MARKER"), "outside content must never be adopted or echoed");
  } finally {
    fs.realpath = originalRealpath;
    try {
      await fs.unlink(realSkillDir);
      await fs.mkdir(realSkillDir, { recursive: true });
      await fs.writeFile(path.join(realSkillDir, "SKILL.md"), originalSkillContent, "utf8");
    } catch {
      // Best effort; the fixture rm covers the rest.
    }
  }

  // After restoring, the same pack normalizes cleanly — the refusal above
  // was the swap, not the fixture.
  const clean = await normalize(manifest, packDir);
  assert.deepEqual(clean.issues, []);
  assert.deepEqual(clean.manifest.skills, [
    { id: "review-pr", path: "skills/review-pr", description: "Review pull requests when asked." }
  ]);
});

// ---------------------------------------------------------------------------
// Task 3 — reliability metadata: validated, preserved, never enforced.
// ---------------------------------------------------------------------------

test("v2 reliability metadata is validated, preserved into bundles, and never enforced", async (t) => {
  const normalize = await boundary();
  for (const reliability of [{ runs: 1 }, { runs: 20, minRecall: 0, minPrecision: 1 }, { minRecall: 0.5 }]) {
    const manifest = v2Manifest({ reliability });
    const { root, packDir } = await makePack(t, manifest);
    const validated = await validatePack(packDir);
    assert.deepEqual(validated.manifest.reliability, reliability);
    const built = await buildPack(packDir, path.join(root, "dist"));
    const builtManifest = JSON.parse(await fs.readFile(path.join(built.outputRoot, "manifest.json"), "utf8"));
    assert.deepEqual(builtManifest.reliability, reliability);
  }

  const invalid = [
    [{ runs: 0 }, /reliability\.runs must be an integer from 1 to 20/],
    [{ runs: 21 }, /reliability\.runs must be an integer from 1 to 20/],
    [{ runs: 1.5 }, /reliability\.runs must be an integer from 1 to 20/],
    [{ runs: "3" }, /reliability\.runs must be an integer from 1 to 20/],
    [{ minRecall: -0.1 }, /reliability\.minRecall must be a number between 0 and 1/],
    [{ minPrecision: 1.1 }, /reliability\.minPrecision must be a number between 0 and 1/],
    [{ minRecall: "0.5" }, /reliability\.minRecall must be a number between 0 and 1/],
    [{ minFpr: 0.5 }, /reliability has unknown key\(s\): minFpr/],
    [[], /reliability must be an object/],
    [null, /reliability must be an object/]
  ];
  for (const [reliability, pattern] of invalid) {
    const manifest = v2Manifest({ reliability });
    const { packDir } = await makePack(t, manifest);
    const result = await normalize(manifest, packDir);
    assert.ok(result.issues.some((message) => pattern.test(message)), `expected ${JSON.stringify(result.issues)} to match ${pattern}`);
    await assert.rejects(validatePack(packDir), (error) => collectedErrors(error).some((message) => pattern.test(message)));
  }
});

test("v1 packs keep their verbatim pass-through semantics for unknown fields like reliability", async (t) => {
  const manifest = { ...V1_MANIFEST, reliability: { runs: 99 } };
  const { root, packDir } = await makePack(t, manifest);
  const built = await buildPack(packDir, path.join(root, "dist"));
  const builtManifest = JSON.parse(await fs.readFile(path.join(built.outputRoot, "manifest.json"), "utf8"));
  assert.deepEqual(builtManifest, manifest);
});

test("validatePack collects multiple v2 issues in one report", async (t) => {
  const manifest = v2Manifest({ skills: ["skills/review-pr", "skills/review-pr"], reliability: { runs: 99 } });
  const { packDir } = await makePack(t, manifest);
  await assert.rejects(validatePack(packDir), (error) => {
    const errors = collectedErrors(error);
    return errors.some((message) => /duplicate skill path/.test(message)) &&
      errors.some((message) => /reliability\.runs must be an integer from 1 to 20/.test(message));
  });
});
