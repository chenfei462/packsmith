import path from "node:path";

import { readdir } from "node:fs/promises";

import { SKILLS_DIR_NAME, skillFileExists } from "./paths.mjs";

/**
 * Workspace discovery (v0.2 Milestone 1, plan §5 target architecture).
 *
 * Given a directory, find the skill roots Packsmith should operate on. This
 * module only *locates* candidate roots — it does not parse them (that is
 * `skill-parser.mjs`) and does not judge them (that is `checks/`, later).
 *
 * Discovery is deterministic and shallow, matching the two v0.2 invocation
 * forms (`packsmith doctor .` and `packsmith doctor ./skills/review-pr`):
 *   1. the directory itself contains SKILL.md  → single-skill workspace;
 *   2. otherwise, immediate subdirectories of `<dir>/skills/` containing
 *      SKILL.md (agent-skills convention);
 *   3. otherwise, immediate subdirectories of `<dir>` containing SKILL.md.
 * Returns absolute skill-root paths, sorted. Empty array when nothing found.
 */
export async function discoverSkillRoots(workspaceDir) {
  const root = path.resolve(workspaceDir);

  if (await skillFileExists(root)) {
    return [root];
  }

  const skillsDirChildren = await listChildSkillRoots(path.join(root, SKILLS_DIR_NAME));

  if (skillsDirChildren.length > 0) {
    return skillsDirChildren;
  }

  return listChildSkillRoots(root);
}

async function listChildSkillRoots(parentDir) {
  let entries;

  try {
    entries = await readdir(parentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const roots = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const child = path.join(parentDir, entry.name);

    if (await skillFileExists(child)) {
      roots.push(child);
    }
  }

  return roots.sort();
}
