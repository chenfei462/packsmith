import { stat } from "node:fs/promises";
import path from "node:path";

import { parseSkill } from "./core/skill-parser.mjs";
import { discoverSkillRoots } from "./core/workspace.mjs";
import { toPosixPath } from "./core/paths.mjs";
import { loadKnowledgeBase } from "./knowledge/loader.mjs";
import {
  collectDiagnostics,
  createDiagnostic,
  sortDiagnostics,
  summarizeDiagnostics,
  resolveExitCode
} from "./core/diagnostics.mjs";

import { checkSpec } from "./checks/spec.mjs";
import { checkActivation } from "./checks/activation.mjs";
import { checkContext } from "./checks/context.mjs";
import { checkCompatibility } from "./checks/compatibility.mjs";
import { checkSecurity } from "./checks/security.mjs";

/**
 * packsmith doctor (v0.2 Milestone 4, plan §12).
 *
 * Orchestrates one doctor run: knowledge base → workspace discovery →
 * parser → checks → diagnostic engine → report. No LLM, no network, no
 * credentials (plan §12 acceptance). The command is a reliability GATE:
 *
 *   exit 0 = PASS (no error-severity diagnostics)
 *   exit 1 = Skill validation failure (plan §8)
 *   exit 2 = infrastructure failure — thrown as DoctorInfrastructureError by
 *            this module (broken knowledge base, unreadable target); the CLI
 *            maps it. It is never produced by Skill findings (plan §4.4).
 */

/** Runtimes doctor can take a view on (plan §3 static scope + KB records). */
export const DOCTOR_TARGET_RUNTIMES = Object.freeze([
  "claude-code",
  "codex",
  "cursor",
  "gemini-cli",
  "opencode"
]);

/**
 * Default runtime view of the per-skill check sections. Plan §12's terminal
 * example shows "Agent Skills specification", "Claude Code" and "Codex" —
 * the spec plus the two v0.2 live runtimes (plan §15). `--target` narrows it.
 */
export const DOCTOR_DEFAULT_RUNTIME_VIEW = Object.freeze(["claude-code", "codex"]);

export const RUNTIME_LABELS = Object.freeze({
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  opencode: "OpenCode",
  "agent-skills": "Agent Skills specification"
});

/** Raised for caller mistakes (bad path, unknown --target): usage, not infra. */
export class DoctorUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "DoctorUsageError";
    this.isUsageError = true;
  }
}

/** Raised for Packsmith-side faults (broken knowledge base, fs failures). */
export class DoctorInfrastructureError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "DoctorInfrastructureError";
    this.isInfrastructureError = true;
    if (cause) {
      this.cause = cause;
    }
  }
}

function runtimeLabel(runtimeId) {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId;
}

/** Resolve and validate the doctor target: an existing directory. A path
 * that does not exist (or is not a directory) is the caller's mistake — a
 * usage error. An ACCESS failure on an existing path (EACCES, EIO, …) is a
 * Packsmith-side infrastructure fault and must surface as exit 2 (plan §8,
 * plan §4.4), never as "target does not exist". */
async function resolveTargetDirectory(targetPath) {
  let info;

  try {
    info = await stat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new DoctorUsageError(`Doctor target does not exist: ${targetPath} (${error.message})`);
    }
    throw new DoctorInfrastructureError(`Doctor cannot access the target path ${targetPath}: ${error.message}`, {
      cause: error
    });
  }

  if (!info.isDirectory()) {
    throw new DoctorUsageError(`Doctor target must be a directory: ${targetPath}`);
  }

  return path.resolve(targetPath);
}

/**
 * Run one doctor pass.
 *
 * `targetPath`          — workspace root or single skill directory (plan §12).
 * `target`              — optional runtime id; narrows the runtime view
 *                         (plan §12 `--target`). Null = default view.
 * `knowledgeBaseRoot`   — override for the bundled knowledge base (tests).
 * `knowledgeBase`       — pre-loaded knowledge base snapshot (tests);
 *                         skips loading when given.
 *
 * Returns the report consumed by the reporters (plan §12):
 *
 * {
 *   status: "pass" | "fail",
 *   exitCode,                      // 0 | 1  (2 = thrown, not reported)
 *   targetPath, userPath, targetRuntime, runtimeView,
 *   skills: [{ name, directory, displayDir, sections: [{label, ok}], diagnostics }],
 *   workspaceDiagnostics,          // findings not tied to a skill
 *   diagnostics,                   // all findings, canonical sort order
 *   counts: { errors, warnings, infos, total }
 * }
 */
export async function runDoctor({
  targetPath,
  target = null,
  knowledgeBaseRoot,
  knowledgeBase = null
} = {}) {
  if (target !== null && !DOCTOR_TARGET_RUNTIMES.includes(target)) {
    throw new DoctorUsageError(
      `Unknown doctor target runtime: ${JSON.stringify(target)}. Supported: ${DOCTOR_TARGET_RUNTIMES.join(", ")}.`
    );
  }

  let base;

  if (knowledgeBase) {
    base = knowledgeBase;
  } else {
    try {
      base = await loadKnowledgeBase(knowledgeBaseRoot ? { root: knowledgeBaseRoot } : {});
    } catch (error) {
      throw new DoctorInfrastructureError(`Doctor cannot load the knowledge base: ${error.message}`, { cause: error });
    }
  }

  const userPath = targetPath;
  const resolvedTarget = await resolveTargetDirectory(targetPath);
  const runtimeView = target ? [target] : [...DOCTOR_DEFAULT_RUNTIME_VIEW];

  let skillRoots;

  try {
    skillRoots = await discoverSkillRoots(resolvedTarget);
  } catch (error) {
    throw new DoctorInfrastructureError(`Doctor cannot read the target directory: ${error.message}`, { cause: error });
  }

  const skills = [];
  const workspaceDiagnostics = [];

  if (skillRoots.length === 0) {
    // The target holds no skill at all. Reported as PS-SPEC-001 (the spec
    // rule for a directory that must contain SKILL.md) — a validation
    // failure of the thing doctor was pointed at, never an infra error.
    const specRule = base.rules.find((rule) => rule.id === "PS-SPEC-001");

    if (!specRule) {
      throw new DoctorInfrastructureError("Knowledge base is missing rule PS-SPEC-001 required by doctor");
    }

    workspaceDiagnostics.push(
      createDiagnostic({
        id: specRule.id,
        severity: specRule.severity,
        category: specRule.category,
        title: specRule.title,
        message: `${specRule.message} No skill directory was found under "${userPath}".`,
        file: "SKILL.md",
        line: null,
        runtime: null,
        evidence: specRule.evidence.map((entry) => entry.source),
        fix: specRule.fix ? { available: specRule.fix.available, safe: specRule.fix.safe } : null
      })
    );
  }

  // Parse every skill first: PS-ACT-003 compares each description against the
  // full sibling set, so all parses must exist before the checks run.
  const parsedSkills = [];

  for (const skillRoot of skillRoots) {
    try {
      parsedSkills.push(await parseSkill(skillRoot));
    } catch (error) {
      throw new DoctorInfrastructureError(`Doctor cannot parse skill at ${skillRoot}: ${error.message}`, { cause: error });
    }
  }

  for (const parsed of parsedSkills) {
    const relativeRoot = toPosixPath(path.relative(resolvedTarget, parsed.root));
    const displayDir = relativeRoot === "" ? "." : relativeRoot;
    const context = { rules: base.rules, displayDir, targetRuntime: target, siblings: parsedSkills };

    // The check order is the plan §8 category order; sortDiagnostics below
    // applies the canonical engine ordering for output. Check failures that
    // carry infrastructure semantics (filesystem EACCES/EIO, …) are
    // re-raised as doctor infrastructure errors — they must surface as
    // exit 2, never as Skill findings or a silent PASS (plan §4.4).
    let specDiagnostics;
    let activationDiagnostics;
    let compatibilityDiagnostics;
    let contextDiagnostics;
    let securityDiagnostics;

    try {
      specDiagnostics = await checkSpec(parsed, context);
      activationDiagnostics = checkActivation(parsed, context);
      compatibilityDiagnostics = checkCompatibility(parsed, context);
      contextDiagnostics = checkContext(parsed, context);
      securityDiagnostics = await checkSecurity(parsed, context);
    } catch (error) {
      if (error.isInfrastructureError) {
        throw new DoctorInfrastructureError(`Doctor checks failed for skill at ${parsed.root}: ${error.message}`, {
          cause: error
        });
      }
      throw error;
    }

    const skillDiagnostics = collectDiagnostics(
      specDiagnostics,
      activationDiagnostics,
      compatibilityDiagnostics,
      contextDiagnostics,
      securityDiagnostics
    );

    // Per-skill check sections (plan §12 terminal example): the Agent Skills
    // specification area fails on spec errors; each runtime area fails on
    // diagnostics bound to that runtime.
    const hasErrors = (predicate) =>
      skillDiagnostics.some((diagnostic) => diagnostic.severity === "error" && predicate(diagnostic));

    const sections = [
      { label: "Agent Skills specification", ok: !hasErrors((diagnostic) => diagnostic.category === "spec") },
      ...runtimeView.map((runtimeId) => ({
        label: runtimeLabel(runtimeId),
        ok: !hasErrors((diagnostic) => diagnostic.runtime === runtimeId)
      }))
    ];

    skills.push({
      name: parsed.directoryName,
      directory: displayDir,
      displayDir,
      sections,
      diagnostics: skillDiagnostics
    });
  }

  const diagnostics = sortDiagnostics(collectDiagnostics(...skills.map((skill) => skill.diagnostics), workspaceDiagnostics));
  const summary = summarizeDiagnostics(diagnostics);
  const status = summary.errors > 0 ? "fail" : "pass";

  return {
    status,
    exitCode: resolveExitCode({ errors: summary.errors }),
    targetPath: resolvedTarget,
    userPath,
    targetRuntime: target,
    runtimeView,
    skills,
    workspaceDiagnostics,
    diagnostics,
    counts: {
      errors: summary.errors,
      warnings: summary.warnings,
      infos: summary.infos,
      total: summary.total
    }
  };
}
