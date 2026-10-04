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

import { stat as fsStat, lstat as fsLstat, readdir as fsReaddir, readFile as fsReadFile, open as fsOpen, link as fsLink, mkdir as fsMkdir, rm as fsRm } from "node:fs/promises";
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

/** Forces ENOENT for matching paths while the entry really exists —
 * simulates an entry appearing AFTER an existence probe (TOCTOU). */
function injectableMissing(originalFn, envName, opName) {
  return async function injectedOp(...args) {
    const fragment = faultFragment(envName);

    if (fragment !== null && typeof args[0] === "string" && args[0].includes(fragment)) {
      const error = new Error(`Injected ${opName} ENOENT for ${args[0]}`);
      error.code = "ENOENT";
      error.errno = -2;
      error.syscall = opName;
      error.path = args[0];
      throw error;
    }

    return originalFn(...args);
  };
}

/** Exclusive-create opens whose write fails partway through, leaving a
 * partially written file behind — the caller must clean up its own artifact. */
function injectableOpen(originalOpen, envName) {
  return async function injectedOpen(...args) {
    const handle = await originalOpen(...args);
    const fragment = faultFragment(envName);
    const flags = args[1];
    const wantsExclusive = flags === "wx" || flags === "wx+";

    if (fragment === null || wantsExclusive !== true || typeof args[0] !== "string" || !args[0].includes(fragment)) {
      return handle;
    }

    return new Proxy(handle, {
      get(target, prop) {
        if (prop === "writeFile") {
          return async (data, options) => {
            const text = typeof data === "string" ? data : String(data);
            await target.writeFile(text.slice(0, 20), options);
            const error = new Error("Injected partial write EIO");
            error.code = "EIO";
            error.errno = -5;
            error.syscall = "write";
            throw error;
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  };
}

/** Real creation race: on the FIRST matching link(dest) call, actually
 * create the file at dest first (as an author writing at that instant
 * would), then proceed — so the implementation sees a genuine EEXIST with
 * a real author file behind it, on any platform, without threads. */
function injectableLinkRace(originalLink, envName) {
  let fired = false;

  return async (source, destination) => {
    const fragment = faultFragment(envName);

    if (!fired && fragment !== null && typeof destination === "string" && destination.includes(fragment)) {
      fired = true;
      await nodeRequire("node:fs/promises").writeFile(
        destination,
        "{\n  \"author\": \"sentinel created in the race window\"\n}\n",
        "utf8"
      );
    }

    return originalLink(source, destination);
  };
}

/** After a matching mkdir really creates the directory, swap it aside and
 * plant a junction to the given target at the original path — simulating an
 * adversary racing the integrity pre-check (needs junction privilege). */
function injectableMkdirJunctionSwap(originalMkdir, envName) {
  return async (...args) => {
    const result = await originalMkdir(...args);
    const spec = faultFragment(envName);

    if (spec !== null && typeof args[0] === "string") {
      const separator = spec.indexOf("|");
      const marker = separator === -1 ? spec : spec.slice(0, separator);
      const junctionTarget = separator === -1 ? null : spec.slice(separator + 1);

      if (marker && junctionTarget && args[0].includes(marker)) {
        const real = nodeRequire("node:fs/promises");
        await real.rename(args[0], `${args[0]}.swapped-real`);
        await real.symlink(junctionTarget, args[0], "junction");
      }
    }

    return result;
  };
}

const patches = {
  stat: injectable(fsStat, "PACKSMITH_DOCTOR_FAULT_STAT", "stat"),
  lstat: injectableMissing(fsLstat, "PACKSMITH_DOCTOR_FAULT_LSTAT_MISSING", "lstat"),
  readdir: injectable(fsReaddir, "PACKSMITH_DOCTOR_FAULT_READDIR", "scandir"),
  readFile: injectable(fsReadFile, "PACKSMITH_DOCTOR_FAULT_READFILE", "open"),
  open: injectableOpen(fsOpen, "PACKSMITH_DOCTOR_FAULT_WRITE_EIO"),
  link: injectableLinkRace(fsLink, "PACKSMITH_DOCTOR_FAULT_RACE_CREATE"),
  mkdir: injectableMkdirJunctionSwap(fsMkdir, "PACKSMITH_DOCTOR_FAULT_MKDIR_JUNCTION_SWAP"),
  rm: injectable(fsRm, "PACKSMITH_DOCTOR_FAULT_RM")
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
