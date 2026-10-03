"use strict";

// Doctor fault injection loader (Wave 1 acceptance regression tests).
//
// Usage: node --import <this-file> src/cli.mjs doctor <path> --format json
//
// Each environment variable names a path FRAGMENT; the first matching call
// fails with an EACCES error, simulating a filesystem permission fault the
// doctor must surface as an infrastructure failure (plan §8 exit code 2).
// Unset variables are pass-through, so the loader is safe to register always:
//
//   PACKSMITH_DOCTOR_FAULT_STAT      — fs/promises stat
//   PACKSMITH_DOCTOR_FAULT_READDIR   — fs/promises readdir
//   PACKSMITH_DOCTOR_FAULT_READFILE  — fs/promises readFile

import { stat as fsStat, readdir as fsReaddir, readFile as fsReadFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const fsPromises = nodeRequire("node:fs/promises");

function faultFragment(envName) {
  const value = process.env[envName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function injectable(originalFn, envName, opName) {
  return async function injectedOp(...args) {
    const fragment = faultFragment(envName);

    if (fragment !== null && typeof args[0] === "string" && args[0].includes(fragment)) {
      const error = new Error(`Injected ${opName} EACCES for ${args[0]}`);
      error.code = "EACCES";
      error.errno = -13;
      error.syscall = opName;
      error.path = args[0];
      throw error;
    }

    return originalFn(...args);
  };
}

const patches = {
  stat: injectable(fsStat, "PACKSMITH_DOCTOR_FAULT_STAT", "stat"),
  readdir: injectable(fsReaddir, "PACKSMITH_DOCTOR_FAULT_READDIR", "scandir"),
  readFile: injectable(fsReadFile, "PACKSMITH_DOCTOR_FAULT_READFILE", "open")
};

for (const [name, value] of Object.entries(patches)) {
  Object.defineProperty(fsPromises, name, { value, configurable: true, writable: false });
}

// Re-sync the builtin's ESM named exports with the patched CJS exports
// object, so product modules using `import { stat } from "node:fs/promises"`
// observe the injection too (doctor.mjs's target resolution imports stat
// by name). Without this, only default-import call sites are injectable.
syncBuiltinESMExports();

export {};
