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

import { stat as fsStat, readdir as fsReaddir, readFile as fsReadFile, open as fsOpen, link as fsLink, mkdir as fsMkdir, rm as fsRm } from "node:fs/promises";
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

/** Exclusive-create opens with optional injected faults:
 *  - PACKSMITH_DOCTOR_FAULT_WRITE_EIO: the handle's writeFile fails partway;
 *  - PACKSMITH_DOCTOR_FAULT_HANDLE_STAT_EIO: the handle's stat fails, so the
 *    caller cannot verify the identity of the file it just created;
 *  - PACKSMITH_DOCTOR_FAULT_CLOSE_EIO: the handle's close performs the real
 *    close first and then fails — the caller must not publish a file whose
 *    close it could not observe. */
function injectableOpen(originalOpen, envName, statEioEnvName, closeEioEnvName) {
  return async function injectedOpen(...args) {
    const handle = await originalOpen(...args);
    const fragment = faultFragment(envName);
    const statEioFragment = faultFragment(statEioEnvName);
    const closeEioFragment = faultFragment(closeEioEnvName);
    const flags = args[1];
    const wantsExclusive = flags === "wx" || flags === "wx+";
    const pathArg = typeof args[0] === "string" ? args[0] : null;

    const writeFault = fragment !== null && wantsExclusive && pathArg !== null && pathArg.includes(fragment);
    const statFault = statEioFragment !== null && wantsExclusive && pathArg !== null && pathArg.includes(statEioFragment);
    const closeFault = closeEioFragment !== null && wantsExclusive && pathArg !== null && pathArg.includes(closeEioFragment);

    if (!writeFault && !statFault && !closeFault) {
      return handle;
    }

    return new Proxy(handle, {
      get(target, prop) {
        if (prop === "writeFile" && writeFault) {
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
        if (prop === "stat" && statFault) {
          return async () => {
            const error = new Error("Injected handle stat EIO");
            error.code = "EIO";
            error.errno = -5;
            error.syscall = "stat";
            throw error;
          };
        }
        if (prop === "close" && closeFault) {
          return async () => {
            await target.close();
            const error = new Error("Injected close EIO");
            error.code = "EIO";
            error.errno = -5;
            error.syscall = "close";
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
 * a real author file behind it, on any platform, without threads.
 * Independently, PACKSMITH_DOCTOR_FAULT_TEMP_SWAP swaps the link SOURCE for
 * an author's non-JSON file right before the publish — the implementation
 * must detect that the temp it wrote is no longer the entry being linked. */
function injectableLink(originalLink, envName, swapEnvName) {
  let raceFired = false;
  let swapFired = false;

  return async (source, destination) => {
    const swapFragment = faultFragment(swapEnvName);

    if (!swapFired && swapFragment !== null && typeof source === "string" && source.includes(swapFragment)) {
      swapFired = true;
      const real = nodeRequire("node:fs/promises");
      await real.rename(source, `${source}.swapped-author-away`);
      await real.writeFile(
        source,
        "{\n  \"author\": \"not a trigger suite, planted over the temp file\"\n}\n",
        "utf8"
      );
    }

    const raceFragment = faultFragment(envName);

    if (!raceFired && raceFragment !== null && typeof destination === "string" && destination.includes(raceFragment)) {
      raceFired = true;
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
  readdir: injectable(fsReaddir, "PACKSMITH_DOCTOR_FAULT_READDIR", "scandir"),
  readFile: injectable(fsReadFile, "PACKSMITH_DOCTOR_FAULT_READFILE", "open"),
  open: injectableOpen(fsOpen, "PACKSMITH_DOCTOR_FAULT_WRITE_EIO", "PACKSMITH_DOCTOR_FAULT_HANDLE_STAT_EIO", "PACKSMITH_DOCTOR_FAULT_CLOSE_EIO"),
  link: injectableLink(fsLink, "PACKSMITH_DOCTOR_FAULT_RACE_CREATE", "PACKSMITH_DOCTOR_FAULT_TEMP_SWAP"),
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
