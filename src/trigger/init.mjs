import path from "node:path";
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
  const suitePath = path.join(resolvedTarget, "evals", "triggers.json");
  const displayPath = suiteDisplayPath(targetPath);

  // Hard no-overwrite rule: an existing suite is the author's work.
  let existing = null;

  try {
    existing = await fsPromises.stat(suitePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new InfrastructureError(`Trigger init cannot probe ${suitePath}: ${error.message}`, { cause: error });
    }
  }

  if (existing !== null) {
    return { ok: false, status: "exists", skill, path: displayPath };
  }

  const suite = createStarterSuite(skill);

  try {
    await fsPromises.mkdir(path.dirname(suitePath), { recursive: true });
    await fsPromises.writeFile(suitePath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new InfrastructureError(`Trigger init cannot write ${suitePath}: ${error.message}`, { cause: error });
  }

  return {
    ok: true,
    status: "created",
    skill,
    path: displayPath,
    cases: suite.cases.length
  };
}
