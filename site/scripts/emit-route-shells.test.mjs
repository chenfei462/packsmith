import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { emitRouteShells } from "./emit-route-shells.mjs";

async function createDistFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "packsmith-route-shells-test-"));
  const distDir = path.join(rootDir, "dist");
  const indexBytes = Buffer.from(
    '<!doctype html>\r\n<html><script type="module" src="/packsmith/assets/app.js"></script></html>\r\n'
  );

  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, "index.html"), indexBytes);

  return { distDir, indexBytes, rootDir };
}

async function assertMissing(filePath) {
  await assert.rejects(access(filePath), (error) => error?.code === "ENOENT");
}

async function assertNoRouteShells(distDir) {
  assert.deepEqual(await readdir(distDir), ["index.html"]);
}

test("emits byte-identical shells for static application routes", async () => {
  const { distDir, indexBytes, rootDir } = await createDistFixture();

  try {
    await emitRouteShells({
      distDir,
      packIds: ["senior-code-reviewer", "workflow-packager"]
    });

    const shellPaths = [
      "registry/index.html",
      "docs/index.html",
      "registry/senior-code-reviewer/index.html",
      "registry/workflow-packager/index.html",
      "404.html"
    ];

    for (const shellPath of shellPaths) {
      assert.deepEqual(await readFile(path.join(distDir, shellPath)), indexBytes);
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("rejects pack IDs that are not strict catalog slugs", async (t) => {
  const invalidPackIds = [
    "nested/pack",
    "..",
    "Uppercase",
    "snake_case",
    "contains space",
    "back\\slash"
  ];

  for (const packId of invalidPackIds) {
    await t.test(packId, async () => {
      const { distDir, rootDir } = await createDistFixture();

      try {
        await assert.rejects(
          emitRouteShells({ distDir, packIds: [packId] }),
          /invalid pack id/i
        );
      } finally {
        await rm(rootDir, { recursive: true, force: true });
      }
    });
  }
});

test("validates every pack ID before writing any route shell", async () => {
  const { distDir, rootDir } = await createDistFixture();

  try {
    await assert.rejects(
      emitRouteShells({ packIds: ["valid-pack", "Bad_ID"], distDir }),
      /invalid pack id/i
    );

    const unexpectedPaths = [
      "registry/index.html",
      "docs/index.html",
      "registry/valid-pack/index.html",
      "404.html"
    ];

    for (const unexpectedPath of unexpectedPaths) {
      await assertMissing(path.join(distDir, unexpectedPath));
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("rejects an empty pack ID list before writing any route shell", async () => {
  const { distDir, rootDir } = await createDistFixture();

  try {
    await assert.rejects(
      emitRouteShells({ distDir, packIds: [] }),
      /at least one pack id/i
    );
    await assertNoRouteShells(distDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("rejects duplicate pack IDs before writing any route shell", async () => {
  const { distDir, rootDir } = await createDistFixture();

  try {
    await assert.rejects(
      emitRouteShells({ distDir, packIds: ["valid-pack", "valid-pack"] }),
      /duplicate pack id/i
    );
    await assertNoRouteShells(distDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("rejects Windows reserved device names before writing any route shell", async (t) => {
  const reservedDeviceNames = ["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"];

  for (const packId of reservedDeviceNames) {
    await t.test(packId, async () => {
      const { distDir, rootDir } = await createDistFixture();

      try {
        await assert.rejects(
          emitRouteShells({ distDir, packIds: [packId] }),
          /invalid pack id/i
        );
        await assertNoRouteShells(distDir);
      } finally {
        await rm(rootDir, { recursive: true, force: true });
      }
    });
  }
});
