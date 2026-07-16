import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fingerprintRepository,
  generateRepositoryData,
  isHttpUrl,
  mapWithConcurrency,
  normalizePortablePath
} from "./generate-repository-data.mjs";

const runtimeIds = ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"];
const catalogLocales = ["en", "zh", "ja", "ko", "es", "fr", "de"];

test("normalizes safe relative paths to POSIX separators", () => {
  const runId = "00000000-0000-4000-8000-000000000000";

  assert.equal(normalizePortablePath("safe\\nested/file.txt"), "safe/nested/file.txt");
  assert.equal(
    normalizePortablePath(`C:\\temp\\passport\\run-${runId}\\home\\.codex\\skills\\pack`),
    "<home>/.codex/skills/pack"
  );
  assert.equal(
    normalizePortablePath(`/tmp/passport/run-${runId}/project/.github/skills/pack`),
    "<project>/.github/skills/pack"
  );
  assert.equal(
    normalizePortablePath(`C:\\temp\\passport\\run-${runId}\\home\\.codex\\skills\\home\\README.md`),
    "<home>/.codex/skills/home/README.md"
  );
});

test("accepts only HTTP(S) browser destinations", () => {
  assert.equal(isHttpUrl("https://github.com/chenfei462/packsmith"), true);
  assert.equal(isHttpUrl("http://localhost:4173/docs"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("data:text/html,unsafe"), false);
  assert.equal(isHttpUrl("file:///etc/passwd"), false);
});

test("stops scheduling work after the first mapper failure and awaits active work", async () => {
  let releaseActiveWork;
  let rejected = false;
  const activeWork = new Promise((resolve) => {
    releaseActiveWork = resolve;
  });
  const started = [];
  const run = mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
    started.push(value);

    if (value === 0) {
      throw new Error("mapper failed");
    }

    await activeWork;
    return value;
  });
  void run.catch(() => {
    rejected = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  const rejectedBeforeActiveWorkFinished = rejected;
  releaseActiveWork();
  await assert.rejects(run, /mapper failed/);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(rejectedBeforeActiveWorkFinished, false);
  assert.deepEqual(started, [0, 1]);
});

async function createFingerprintFixture(repoRoot) {
  const files = {
    "registry/catalog.json": "{}\n",
    "src/cli.mjs": "import './lib/fs-utils.mjs';\n",
    "src/lib/fs-utils.mjs": "export const marker = 'one';\n",
    "site/scripts/generate-repository-data.mjs": "// generator\n",
    "site/scripts/passport-client.mjs": "// passport client\n",
    "i18n/config.json": "{}\n",
    "official-packs/example/SKILL.md": "# Example\n"
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }

  return path.join(repoRoot, "src", "lib", "fs-utils.mjs");
}

test("fingerprints transitive Passport sources", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-fingerprint-test-"));

  try {
    const dependencyPath = await createFingerprintFixture(repoRoot);
    const first = await fingerprintRepository(repoRoot);
    await writeFile(dependencyPath, "export const marker = 'two';\n", "utf8");
    const second = await fingerprintRepository(repoRoot);

    assert.ok(first.inputs.includes("src/lib/fs-utils.mjs"));
    assert.notEqual(second.fingerprint, first.fingerprint);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test(
  "fingerprints executable mode changes",
  { skip: process.platform === "win32" },
  async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-fingerprint-mode-test-"));

    try {
      const dependencyPath = await createFingerprintFixture(repoRoot);
      await chmod(dependencyPath, 0o644);
      const first = await fingerprintRepository(repoRoot);
      await chmod(dependencyPath, 0o755);
      const second = await fingerprintRepository(repoRoot);

      assert.notEqual(second.fingerprint, first.fingerprint);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }
);

test("rejects an alternate repository root instead of mixing checkouts", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-alternate-root-test-"));

  try {
    await assert.rejects(generateRepositoryData({ repoRoot }), /alternate repository roots are not supported/i);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("rejects traversal, file URIs, and absolute paths", async (t) => {
  const unsafePaths = [
    ["parent traversal", "../outside"],
    ["nested traversal", "safe/../../outside"],
    ["single-slash file URI", "file:/etc/passwd"],
    ["triple-slash file URI", "file:///etc/passwd"],
    ["Windows drive-relative file", "C:secret.txt"],
    ["Windows drive-relative directory", "z:folder/file"],
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
