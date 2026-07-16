import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateRepositoryData } from "./generate-repository-data.mjs";

const runtimeIds = ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"];
const catalogLocales = ["en", "zh", "ja", "ko", "es", "fr", "de"];

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
    assert.ok(seniorReviewer.previews.codex.writes.length > 0);
    assert.ok(seniorReviewer.previews.codex.writes.every((writePath) => writePath.startsWith("<home>/")));

    const accessibilityAuditor = data.packs.find((pack) => pack.id === "accessibility-auditor");
    assert.equal(accessibilityAuditor.previews["github-copilot"].status, "not-declared");

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
