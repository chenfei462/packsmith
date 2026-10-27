import path from "node:path";
import { randomUUID } from "node:crypto";
// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { skillFileExists, toPosixPath } from "../core/paths.mjs";
import { createStarterSuite } from "./schema.mjs";

/**
 * `packsmith trigger init <skill-dir>` (v0.2 Milestone 5, plan §13).
 *
 * Creates `<skill-dir>/evals/triggers.json` with a deterministic, valid
 * starter suite (editable TODO placeholders in English and Chinese). No
 * model, no network, no credentials. Hard rules:
 *
 *   - an EXISTING suite is never overwritten: the init refuses with a
 *     validation failure (exit 1), leaving the file byte-identical;
 *   - the target must be a directory containing SKILL.md (plan §13 form:
 *     `packsmith trigger init ./skills/review-pr`);
 *   - usage mistakes (missing argument, unknown path) and infrastructure
 *     faults (EACCES/EIO) map to exit 2, mirroring the doctor contract.
 */

export const TRIGGER_SUITE_FILE = path.join("evals", "triggers.json");

/** Caller mistakes (bad path shape, missing SKILL.md is NOT one of these). */
export class TriggerUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "TriggerUsageError";
    this.isUsageError = true;
  }
}

/**
 * Resolve and validate the init target: an existing directory. ENOENT and
 * ENOTDIR are the caller's mistake (usage); access failures are
 * infrastructure (plan §4.4).
 */
async function resolveTargetDirectory(targetPath) {
  let info;

  try {
    info = await fsPromises.stat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new TriggerUsageError(`Trigger init target does not exist: ${targetPath} (${error.message})`);
    }
    throw new InfrastructureError(`Trigger init cannot access the target path ${targetPath}: ${error.message}`, {
      cause: error
    });
  }

  if (!info.isDirectory()) {
    throw new TriggerUsageError(`Trigger init target must be a directory: ${targetPath}`);
  }

  return path.resolve(targetPath);
}

function suiteDisplayPath(targetPath) {
  return toPosixPath(path.join(path.resolve(targetPath), "evals", "triggers.json"));
}

/**
 * Inspect `<skill>/evals` as it exists RIGHT NOW: it must be a real
 * directory (never a symlink/junction) whose resolved location is exactly
 * the skill directory's own evals folder. Returns
 * `{ ok: true, realPath }` (realPath null when the directory does not
 * exist yet) or `{ ok: false, message }`.
 */
async function inspectEvalsDir(evalsDir) {
  let entry = null;

  try {
    entry = await fsPromises.lstat(evalsDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ok: true, realPath: null };
    }
    throw new InfrastructureError(`Trigger init cannot inspect ${evalsDir}: ${error.message}`, { cause: error });
  }

  if (entry.isSymbolicLink()) {
    return {
      ok: false,
      message: `${toPosixPath(evalsDir)} is a symbolic link or junction; trigger init refuses to write outside the skill directory.`
    };
  }

  if (!entry.isDirectory()) {
    return {
      ok: false,
      message: `${toPosixPath(evalsDir)} exists and is not a directory.`
    };
  }

  let realDir = null;
  let realRoot = null;

  try {
    realDir = await fsPromises.realpath(evalsDir);
    realRoot = await fsPromises.realpath(path.dirname(evalsDir));
  } catch (error) {
    throw new InfrastructureError(`Trigger init cannot resolve ${evalsDir}: ${error.message}`, { cause: error });
  }

  const relative = path.relative(realRoot, realDir);
  const isOwnEvals = relative === "evals" || (process.platform === "win32" && relative.toLowerCase() === "evals");

  if (!isOwnEvals) {
    return {
      ok: false,
      message: `${toPosixPath(evalsDir)} resolves to ${toPosixPath(realDir)}, which is not the skill directory's own evals folder; trigger init refuses to write outside the skill directory.`
    };
  }

  return { ok: true, realPath: realDir };
}

/**
 * Verify evals BEFORE mkdir, create it, and verify AGAIN afterwards: a
 * junction planted inside the race window must be rejected, and the write
 * location is the VERIFIED real directory, never a path that merely did not
 * exist a moment ago.
 */
async function resolveVerifiedEvalsDir(resolvedTarget) {
  const evalsDir = path.join(resolvedTarget, "evals");

  const pre = await inspectEvalsDir(evalsDir);

  if (!pre.ok) {
    return pre;
  }

  try {
    await fsPromises.mkdir(evalsDir, { recursive: true });
  } catch (error) {
    throw new InfrastructureError(`Trigger init cannot create ${evalsDir}: ${error.message}`, { cause: error });
  }

  const post = await inspectEvalsDir(evalsDir);

  if (!post.ok) {
    return post;
  }

  if (post.realPath === null) {
    throw new InfrastructureError(`Trigger init created ${evalsDir} but it cannot be inspected afterwards`);
  }

  return { ok: true, realPath: post.realPath };
}

/**
 * Close a file handle, returning the close error (if any) instead of
 * throwing, so callers can attach it to their primary diagnostic.
 */
async function closeHandle(handle) {
  try {
    await handle.close();
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * Refuse to continue when an entry this run created is no longer the entry
 * at its path (dev/ino identity): the replacement belongs to someone else —
 * it is never removed, and the situation is infrastructure, not success.
 */
async function assertOwnedEntry(entryPath, owned, label) {
  let entry = null;

  try {
    entry = await fsPromises.lstat(entryPath);
  } catch (error) {
    throw new InfrastructureError(`Trigger init cannot verify ${label} ${entryPath}: ${error.message}`, { cause: error });
  }

  if (entry.dev !== owned.dev || entry.ino !== owned.ino) {
    throw new InfrastructureError(
      `Trigger init detected that ${label} ${entryPath} was replaced by another file; refusing to continue and leaving that file untouched.`
    );
  }
}

/**
 * Remove a temp file ONLY while it is still the file this run created:
 * lstat + identity (dev/ino) comparison guards against the path having been
 * swapped for someone else's file between our last touch and the cleanup.
 * A failed removal is NEVER swallowed — it surfaces so nothing claims a
 * cleanup that did not happen.
 */
async function cleanupOwnedTemp(tempPath, owned) {
  let entry = null;

  try {
    entry = await fsPromises.lstat(tempPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { removed: true };
    }
    throw new InfrastructureError(`Trigger init cannot inspect its temp file ${tempPath}: ${error.message}`, { cause: error });
  }

  if (entry.dev !== owned.dev || entry.ino !== owned.ino) {
    return { removed: false, reason: `${tempPath} is no longer the file this run created` };
  }

  try {
    await fsPromises.rm(tempPath, { force: true });
    return { removed: true };
  } catch (error) {
    throw new InfrastructureError(`Trigger init could not remove its temp file ${tempPath}: ${error.message}`, { cause: error });
  }
}

/**
 * Create the suite content and publish it at `<evals>/triggers.json` without
 * EVER writing to or removing the final path by ownership assumption:
 *
 *   1. claim a private, unpredictable temp file in the verified evals
 *      directory (`open(tmp, "wx")` — exclusive create);
 *   2. verify the temp's identity via its handle (a stat failure here means
 *      the identity is unknown: close the handle, disclose the leftover
 *      location, never racy-delete an unverified file);
 *   3. write the full content through that handle — a write failure removes
 *      OUR temp file (identity-checked), never anything else;
 *   4. close the handle — a close failure on this success path means the
 *      content must not be published: remove our temp and fail;
 *   5. re-verify the temp identity, publish with `link(tmp, final)` — an
 *      atomic, non-covering operation whose EEXIST means an author file won
 *      the race — and re-verify the published entry's identity afterwards.
 *
 * The final path is never renamed over and never removed.
 */
async function createSuiteExclusively(evalsRealDir, content) {
  const finalPath = path.join(evalsRealDir, "triggers.json");
  let tempPath = null;
  let owned = null;
  let handle = null;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = path.join(evalsRealDir, `triggers.json.tmp-${randomUUID()}`);

      try {
        handle = await fsPromises.open(candidate, "wx");
        tempPath = candidate;
        break;
      } catch (error) {
        if (error.code === "EEXIST") {
          continue;
        }
        throw new InfrastructureError(`Trigger init cannot create its temp file in ${evalsRealDir}: ${error.message}`, { cause: error });
      }
    }

    if (handle === null) {
      throw new InfrastructureError(`Trigger init could not claim a unique temp file in ${evalsRealDir}`);
    }

    try {
      owned = await handle.stat();
    } catch (error) {
      const secondary = await closeHandle(handle);
      handle = null;
      const secondaryNote = secondary ? ` A secondary close also failed: ${secondary.message}.` : "";
      throw new InfrastructureError(
        `Trigger init could not verify its temp file ${tempPath} (${error.message}); the unverified temp file remains there and was not removed.${secondaryNote}`,
        { cause: error }
      );
    }

    try {
      await handle.writeFile(content, "utf8");
    } catch (error) {
      const secondary = await closeHandle(handle);
      handle = null;
      let cleanupNote;

      try {
        const cleanup = await cleanupOwnedTemp(tempPath, owned);
        cleanupNote = cleanup.removed ? "; the partial temp file was removed" : `; the partial temp file remains at ${tempPath}`;
      } catch (cleanupError) {
        throw new InfrastructureError(
          `Trigger init failed while writing ${tempPath} (${error.message}); a secondary close ${secondary ? `also failed: ${secondary.message}` : "succeeded"}; the temp cleanup failed too: ${cleanupError.message}`,
          { cause: cleanupError }
        );
      }

      throw new InfrastructureError(
        `Trigger init failed while writing ${tempPath} (${error.message})${cleanupNote}${secondary ? `; a secondary close also failed: ${secondary.message}` : ""}`,
        { cause: error }
      );
    }

    // A close failure on the success path means the content must not be
    // published: remove our temp file and fail with the diagnostic.
    const closeError = await closeHandle(handle);
    handle = null;

    if (closeError !== null) {
      const cleanup = await cleanupOwnedTemp(tempPath, owned);
      throw new InfrastructureError(
        `Trigger init could not close its temp file ${tempPath} (${closeError.message})${cleanup.removed ? "; the temp file was removed and nothing was published" : `; the temp file remains at ${tempPath} and nothing was published`}`,
        { cause: closeError }
      );
    }
  } finally {
    // Leak guard for unexpected throws between the explicit close points
    // above; every expected failure path closes the handle itself and keeps
    // its own diagnostics, so this only ever runs with nothing in flight.
    if (handle !== null) {
      await handle.close().catch(() => {});
      handle = null;
    }
  }

  await assertOwnedEntry(tempPath, owned, "its temp file");

  try {
    await fsPromises.link(tempPath, finalPath);
  } catch (error) {
    if (error.code === "EEXIST") {
      const cleanup = await cleanupOwnedTemp(tempPath, owned);
      return {
        ok: false,
        ...(cleanup.removed ? {} : { warning: `Trigger init could not remove its temp file; it remains at ${tempPath}.` })
      };
    }
    const cleanup = await cleanupOwnedTemp(tempPath, owned);
    throw new InfrastructureError(
      `Trigger init cannot publish ${finalPath} (${error.message})${cleanup.removed ? "" : `; its temp file remains at ${tempPath}`}`,
      { cause: error }
    );
  }

  await assertOwnedEntry(finalPath, owned, "the published suite");

  const cleanup = await cleanupOwnedTemp(tempPath, owned);
  return {
    ok: true,
    ...(cleanup.removed ? {} : { warning: `Trigger init could not remove its temp file; it remains at ${tempPath}.` })
  };
}

/**
 * Run one trigger init.
 *
 * Returns the report the CLI renders:
 *   { ok: true,  status: "created", skill, path, cases }
 *   { ok: false, status: "exists", skill, path }             → exit 1
 *   { ok: false, status: "invalid-target", path, message }    → exit 1
 * Usage mistakes and infrastructure faults are thrown (exit 2 at the CLI).
 */
export async function runTriggerInit({ targetPath }) {
  const resolvedTarget = await resolveTargetDirectory(targetPath);

  // Plan §13 form: the target is one skill directory. A directory without
  // SKILL.md is a fact about the workspace, not a tool fault.
  if (!(await skillFileExists(resolvedTarget))) {
    return {
      ok: false,
      status: "invalid-target",
      path: suiteDisplayPath(targetPath),
      message: `Trigger init target has no SKILL.md; point trigger init at a skill directory (e.g. packsmith trigger init ./skills/${path.basename(resolvedTarget)}).`
    };
  }

  const skill = path.basename(resolvedTarget);
  const displayPath = suiteDisplayPath(targetPath);

  // Never write through a reparse point planted at evals/: verify before
  // mkdir, then trust only the post-mkdir verification, and write into the
  // VERIFIED real directory.
  const evals = await resolveVerifiedEvalsDir(resolvedTarget);

  if (!evals.ok) {
    return { ok: false, status: "invalid-target", path: displayPath, message: evals.message };
  }

  const finalPath = path.join(evals.realPath, "triggers.json");

  // An existing suite is the author's work: refuse, never overwrite. The
  // lstat probe also refuses dangling symlinks before the publish attempt.
  let suiteEntry = null;

  try {
    suiteEntry = await fsPromises.lstat(finalPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new InfrastructureError(`Trigger init cannot probe ${finalPath}: ${error.message}`, { cause: error });
    }
  }

  if (suiteEntry !== null) {
    return { ok: false, status: "exists", skill, path: displayPath };
  }

  const suite = createStarterSuite(skill);
  const created = await createSuiteExclusively(evals.realPath, `${JSON.stringify(suite, null, 2)}\n`);

  if (!created.ok) {
    return {
      ok: false,
      status: "exists",
      skill,
      path: displayPath,
      ...(created.warning !== undefined ? { warning: created.warning } : {})
    };
  }

  return {
    ok: true,
    status: "created",
    skill,
    path: displayPath,
    cases: suite.cases.length,
    ...(created.warning !== undefined ? { warning: created.warning } : {})
  };
}
