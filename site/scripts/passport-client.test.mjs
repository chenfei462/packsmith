import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadPassport } from "./passport-client.mjs";

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("loads Passport data in an isolated, disposable CLI environment", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-passport-client-test-"));
  const realHomeTrap = path.join(os.homedir(), `.packsmith-passport-client-test-${randomUUID()}`);
  const previousPacksmithHome = process.env.PACKSMITH_HOME;
  const previousTestHome = process.env.PACKSMITH_TEST_HOME;

  process.env.PACKSMITH_HOME = path.join(realHomeTrap, "state");
  process.env.PACKSMITH_TEST_HOME = path.join(realHomeTrap, "home");

  try {
    assert.equal(await pathExists(realHomeTrap), false);

    const passport = await loadPassport("senior-code-reviewer", { cacheRoot });

    assert.equal(passport.pack.id, "senior-code-reviewer");
    assert.equal(passport.targetSummary.ready, 6);
    assert.equal(passport.provenance.verified, true);
    assert.match(passport.provenance.checksum, /^sha256-/);
    assert.equal(passport.score.overall, 95);
    assert.equal(passport.audit.status, "preview-only");
    assert.equal(await pathExists(realHomeTrap), false);
    assert.equal((await stat(cacheRoot)).isDirectory(), true);
    assert.deepEqual(await readdir(cacheRoot), []);
  } finally {
    restoreEnvironment("PACKSMITH_HOME", previousPacksmithHome);
    restoreEnvironment("PACKSMITH_TEST_HOME", previousTestHome);
    await rm(cacheRoot, { recursive: true, force: true });
    await rm(realHomeTrap, { recursive: true, force: true });
  }
});

test("rejects invalid Pack IDs", async () => {
  await assert.rejects(() => loadPassport("../secret"), /Invalid Pack ID/);
});
