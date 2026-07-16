import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateRepositoryData, normalizePortablePath } from "./generate-repository-data.mjs";

const runtimeIds = ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"];
const catalogLocales = ["en", "zh", "ja", "ko", "es", "fr", "de"];

test("normalizes safe relative paths to POSIX separators", () => {
  assert.equal(normalizePortablePath("safe\\nested/file.txt"), "safe/nested/file.txt");
  assert.equal(normalizePortablePath("C:\\temp\\run\\home\\.codex\\skills\\pack"), "<home>/.codex/skills/pack");
  assert.equal(normalizePortablePath("/tmp/run/project/.github/skills/pack"), "<project>/.github/skills/pack");
});

test("rejects traversal, file URIs, and absolute paths", async (t) => {
  const unsafePaths = [
    ["parent traversal", "../outside"],
    ["nested traversal", "safe/../../outside"],
    ["single-slash file URI", "file:/etc/passwd"],
    ["triple-slash file URI", "file:///etc/passwd"],
    ["Windows drive path", "C:\\Users\\name\\secret"],
    ["Windows UNC path", "\\\\server\\share\\secret"],
    ["POSIX absolute path", "/etc/passwd"]
  ];

  for (const [name, unsafePath] of unsafePaths) {
    await t.test(name, () => {
      assert.throws(() => normalizePortablePath(unsafePath), /non-portable/i);
    });
  }
});

test("generates truthful, localized repository data with portable previews", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-repository-data-test-"));
  const outputPath = path.join(tempRoot, "repository-data.json");
  const fingerprintPath = path.join(tempRoot, "repository-data-fingerprint.json");

  try {
    const firstRun = await generateRepositoryData({ outputPath, fingerprintPath });

    const serialized = await readFile(outputPath, "utf8");
    const data = JSON.parse(serialized);
    const fingerprintMetadata = JSON.parse(await readFile(fingerprintPath, "utf8"));
    const secondRun = await generateRepositoryData({ outputPath, fingerprintPath });
    const cachedSerialized = await readFile(outputPath, "utf8");

    assert.equal(firstRun.cacheHit, false);
    assert.equal(secondRun.cacheHit, true);
    assert.equal(cachedSerialized, serialized);
    assert.ok(serialized.endsWith("\n"));
    assert.deepEqual(
      fingerprintMetadata.inputs?.filter((inputPath) => inputPath.startsWith("site/scripts/")),
      ["site/scripts/generate-repository-data.mjs", "site/scripts/passport-client.mjs"]
    );
    assert.equal(data.packs.length, 53);
    assert.deepEqual(data.supportedTargetIds, runtimeIds);
    assert.equal(data.targets.length, 6);
    for (const target of data.targets) {
      assert.deepEqual(Object.keys(target), [
        "id",
        "name",
        "scopes",
        "defaultScope",
        "installSubdirs",
        "skillDirectoryFormat",
        "bridgeFiles",
        "compatibilityWarnings"
      ]);
    }
    assert.deepEqual(
      data.packs.map((pack) => pack.id),
      data.packs.map((pack) => pack.id).toSorted()
    );
    assert.ok(
      data.targets.every((target) =>
        Object.values(target.installSubdirs).every((installSubdir) => !installSubdir.includes("\\"))
      )
    );

    const seniorReviewer = data.packs.find((pack) => pack.id === "senior-code-reviewer");
    assert.equal(seniorReviewer.passport.qualityScore, 95);
    assert.equal(seniorReviewer.passport.audit.status, "preview-only");
    assert.match(seniorReviewer.passport.checksum, /^sha256-/);
    assert.equal(seniorReviewer.previews.codex.status, "preview-ready");
    assert.equal(seniorReviewer.previews.codex.targetId, "codex");
    assert.match(seniorReviewer.previews.codex.installPathTemplate, /^<home>\//);
    assert.equal(Object.hasOwn(seniorReviewer.previews.codex, "installPath"), false);
    assert.ok(seniorReviewer.previews.codex.writes.length > 0);
    assert.ok(seniorReviewer.previews.codex.writes.every((writePath) => writePath.startsWith("<home>/")));

    const accessibilityAuditor = data.packs.find((pack) => pack.id === "accessibility-auditor");
    const undeclaredPreview = accessibilityAuditor.previews["github-copilot"];
    assert.equal(undeclaredPreview.targetId, "github-copilot");
    assert.equal(undeclaredPreview.status, "not-declared");
    for (const optionalKey of ["scope", "installPathTemplate", "installPath", "checksum", "checksumStatus", "reason"]) {
      assert.equal(Object.hasOwn(undeclaredPreview, optionalKey), false, `${optionalKey} must be omitted when unavailable`);
    }

    for (const pack of data.packs) {
      for (const [targetId, preview] of Object.entries(pack.previews)) {
        assert.equal(preview.targetId, targetId, `${pack.id} preview key must match targetId`);
      }
    }

    assert.doesNotMatch(serialized, /(?:^|["\s])[A-Za-z]:[\\/]/m);
    assert.doesNotMatch(serialized, /\/home\/runner(?:\/|\b)/);

    for (const pack of data.packs) {
      for (const locale of catalogLocales) {
        assert.equal(typeof pack.localizations[locale].name, "string", `${pack.id} is missing ${locale} name`);
        assert.ok(pack.localizations[locale].name.length > 0, `${pack.id} has an empty ${locale} name`);
        assert.equal(
          typeof pack.localizations[locale].description,
          "string",
          `${pack.id} is missing ${locale} description`
        );
        assert.ok(pack.localizations[locale].description.length > 0, `${pack.id} has an empty ${locale} description`);
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
