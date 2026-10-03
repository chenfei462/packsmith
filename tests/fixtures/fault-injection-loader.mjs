"use strict";

// Fault injection loader: intercepts fs.copyFile to inject failures for rollback tests.
// Controlled by PACKSMITH_FAULT_COPY=1 environment variable.
// This loader is applied only in contract tests (see contract.test.mjs).
// It mutates the internal pack install path used by CLI commands, causing the second
// install attempt to fail so that the rollback / "install mid-way failure" contract
// can be asserted end-to-end from the CLI entry point without touching src/lib/pack.mjs.

import { copyFile as fsCopyFile } from "node:fs/promises";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const original = nodeRequire("node:fs/promises");

Object.defineProperty(original, "copyFile", {
  value: async function copyFile(src, dest) {
    if (process.env.PACKSMITH_FAULT_COPY === "1") {
      throw new Error("Injected copy failure for rollback contract test");
    }
    return fsCopyFile(src, dest);
  },
  configurable: true,
  writable: false
});

export {};
