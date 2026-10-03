import path from "node:path";

// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";

import { InfrastructureError } from "./diagnostics.mjs";
import { SKILLS_DIR_NAME, skillFileExists } from "./paths.mjs";

/**
 * Workspace discovery (v0.2 Milestone 1, plan §5 target architecture).
 *
 * Given a directory, find the skill roots Packsmith should operate on. This
 * module only *locates* candidate roots — it does not parse them (that is
 * `skill-parser.mjs`) and does not judge them (that is `checks/`).
 *
 * Discovery is deterministic and shallow, matching the v0.2 invocation
 * forms (`packsmith doctor .` and `packsmith doctor ./skills/review-pr`):
 *   1. the directory itself contains SKILL.md   → single-skill workspace;
 *   2. otherwise, if a conventional `skills/` container exists, EVERY
 *      immediate subdirectory of it is a candidate — including one whose
 *      SKILL.md is missing, so the spec check can report PS-SPEC-001
 *      instead of the gap being silently skipped;
 *   3. otherwise, immediate subdirectories of `<dir>` containing SKILL.md
 *      (loose layout). Without the reserved container there is no
 *      convention marking a plain project directory as a skill, so only
 *      directories that actually carry a SKILL.md are candidates.
 *
 * Returns absolute candidate roots, sorted. Empty array when nothing found.
 * Filesystem faults other than "does not exist" (EACCES, EIO, …) are
 * infrastructure errors and are thrown, never converted into "no skills".
 */
export async function discoverSkillRoots(workspaceDir) {
  const root = path.resolve(workspaceDir);

  if (await skillFileExists(root)) {
    return [root];
  }

  const containerCandidates = await listChildDirectories(path.join(root, SKILLS_DIR_NAME));

  if (containerCandidates.length > 0) {
    return containerCandidates;
  }

  return listLooseSkillRoots(root);
}

/**
 * Immediate child directories of `parentDir`, sorted. ENOENT means the
 * directory does not exist (no container / nothing to scan); every other
 * read failure is an infrastructure fault.
 */
async function listChildDirectories(parentDir) {
  let entries;

  try {
    entries = await fsPromises.readdir(parentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw new InfrastructureError(`Cannot list directory ${parentDir}: ${error.message}`, { cause: error });
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDir, entry.name))
    .sort();
}

/** Loose layout: only subdirectories that actually contain a SKILL.md. */
async function listLooseSkillRoots(root) {
  const children = await listChildDirectories(root);
  const roots = [];

  for (const child of children) {
    if (await skillFileExists(child)) {
      roots.push(child);
    }
  }

  return roots;
}
