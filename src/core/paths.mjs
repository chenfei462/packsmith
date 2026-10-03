import path from "node:path";
// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";

import { InfrastructureError } from "./diagnostics.mjs";

/**
 * Path helpers for the v0.2 core (Milestone 1).
 *
 * Scope is deliberately small: everything the skill parser and the workspace
 * discovery need to talk about paths unambiguously. Validation of *whether a
 * path is a legal skill asset* belongs to later milestones (checks/); these
 * helpers only normalize and contain paths.
 */

export const SKILL_FILE_NAME = "SKILL.md";
export const SKILLS_DIR_NAME = "skills";

/** Convert a platform-relative path to POSIX separators (stable on win32). */
export function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

/** First path segment of a POSIX relative path, or null when empty. */
export function firstSegment(posixRelativePath) {
  const [head] = posixRelativePath.split("/");
  return head || null;
}

/**
 * Resolve `relativePath` against `root` and require the result to stay inside
 * `root`. Returns the absolute path, or null when the path escapes the root
 * (e.g. `../outside`) — the caller decides what escaping means; we do not
 * judge validity here.
 */
export function resolveWithinRoot(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), absolute);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return absolute;
}

/**
 * True when `<root>/SKILL.md` exists as an entry on disk. A missing file is
 * a fact (false); any other stat failure (EACCES, EIO, …) is an
 * infrastructure fault and is thrown, never converted into "missing".
 */
export async function skillFileExists(root) {
  const skillFile = path.join(root, SKILL_FILE_NAME);
  try {
    const info = await fsPromises.stat(skillFile);
    return info.isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw new InfrastructureError(`Cannot probe ${skillFile}: ${error.message}`, { cause: error });
  }
}
