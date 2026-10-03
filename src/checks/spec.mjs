import { stat } from "node:fs/promises";
import path from "node:path";

import { requireRule, diagnosticFromRule, joinDisplayPath, lineOfFrontmatterKey, bodyLineOffset } from "./support.mjs";

/**
 * Specification checks (plan §11): PS-SPEC-001 … PS-SPEC-010.
 *
 * Structural validation of one parsed skill against the Agent Skills spec
 * knowledge rules. Deterministic only — no LLM, no network. The check
 * consumes the normalized parser output (Milestone 1) and the loaded
 * knowledge-base rules (Milestone 3) and emits diagnostic-engine objects
 * (Milestone 2). The only filesystem access is the existence probe for
 * referenced files (PS-SPEC-010).
 *
 * Every rule id below MUST exist in knowledge-base/rules/spec.json; a missing
 * rule throws (broken knowledge base = infrastructure fault).
 */

/** Agent-skills name grammar: lowercase letters, numbers, hyphens; no
 * leading/trailing/consecutive hyphens (knowledge-base rule PS-SPEC-005). */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Markdown link/image targets: `[text](target)` / `![alt](target)`. */
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(\s*([^)\s]+)/g;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isUrlLike(target) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith("//");
}

function isAbsolutePathLike(target) {
  return target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target);
}

/** Collect relative file targets referenced from the Markdown body. Pure.
 * Returns `{ target, line }` pairs (1-based body line of the first link),
 * deduplicated by target in first-seen order. */
export function referencedBodyFiles(body) {
  const targets = [];
  const seen = new Set();
  const lines = String(body ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(MARKDOWN_LINK_PATTERN)) {
      const raw = match[1];
      // Strip a trailing #anchor; skip URLs, emails, bare anchors and
      // absolute paths — only relative file references can be missing on disk.
      const target = raw.replace(/#.*$/, "");

      if (target === "" || isUrlLike(raw) || isAbsolutePathLike(target) || seen.has(target)) {
        continue;
      }

      seen.add(target);
      targets.push({ target, line: index + 1 });
    }
  }

  return targets;
}

async function fileExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run all spec checks for one parsed skill.
 *
 * `skill`  — parseSkill() output (Milestone 1 shape).
 * `context`: { rules, displayDir } where `rules` is the loaded knowledge-base
 *            rule array and `displayDir` is the POSIX display path of the
 *            skill directory relative to the doctor target ("." for a direct
 *            skill target).
 *
 * Returns an array of diagnostic objects (plan §8), in rule order.
 */
export async function checkSpec(skill, context) {
  const { rules, displayDir } = context;
  const skillFileDisplay = joinDisplayPath(displayDir, "SKILL.md");
  const diagnostics = [];

  // PS-SPEC-001 — SKILL.md missing. For discovered skill roots this cannot
  // happen (discovery requires SKILL.md); it is the diagnostic doctor reports
  // when the target contains no skill at all.
  if (skill.parse.status === "missing-skill-file") {
    diagnostics.push(
      diagnosticFromRule(requireRule(rules, "PS-SPEC-001"), {
        file: skillFileDisplay
      })
    );
    return diagnostics;
  }

  const rawContent = skill.rawContent;

  // PS-SPEC-002 — frontmatter block missing.
  if (skill.parse.status === "missing-frontmatter") {
    diagnostics.push(
      diagnosticFromRule(requireRule(rules, "PS-SPEC-002"), {
        file: skillFileDisplay,
        line: 1
      })
    );
  }

  // PS-SPEC-003 — YAML parsing failure (incl. scalar/sequence frontmatter;
  // both hide every metadata field from the runtime). The parser error line
  // is relative to the frontmatter text, which starts on file line 2.
  if (skill.parse.status === "invalid-yaml" || skill.parse.status === "frontmatter-not-mapping") {
    const specRule = requireRule(rules, "PS-SPEC-003");
    const parserLine = skill.parse.error?.line ?? null;
    const detail =
      skill.parse.status === "invalid-yaml"
        ? `YAML error: ${skill.parse.error?.message ?? "unknown parse error"}`
        : "Frontmatter parsed but is not a key-value mapping.";
    diagnostics.push(
      diagnosticFromRule(specRule, {
        message: `${specRule.message} ${detail}`,
        file: skillFileDisplay,
        line: parserLine === null ? null : parserLine + 1
      })
    );
  }

  const frontmatter = skill.frontmatter;

  // Frontmatter-dependent checks. Empty/scalar frontmatter still yields {}
  // from the parser, so the name/description rules fire for those too.
  if (frontmatter) {
    const name = frontmatter.name;
    const nameLine = lineOfFrontmatterKey(rawContent, "name");
    const description = frontmatter.description;
    const descriptionLine = lineOfFrontmatterKey(rawContent, "description");

    // PS-SPEC-004 — name missing (absent, or present but empty).
    if (name === null || name === undefined || (typeof name === "string" && name.trim() === "")) {
      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-004"), {
          file: skillFileDisplay,
          line: nameLine
        })
      );
    } else if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      // PS-SPEC-005 — invalid name format (wrong type, illegal characters,
      // leading/trailing/consecutive hyphens, uppercase).
      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-005"), {
          message: `${requireRule(rules, "PS-SPEC-005").message} Found: ${JSON.stringify(name)}.`,
          file: skillFileDisplay,
          line: nameLine
        })
      );
    } else if (name.length > 64) {
      // PS-SPEC-006 — name too long (spec limit: 64 characters).
      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-006"), {
          message: `${requireRule(rules, "PS-SPEC-006").message} Found: ${name.length} characters.`,
          file: skillFileDisplay,
          line: nameLine
        })
      );
    }

    // PS-SPEC-007 — name/directory mismatch. Only comparable when the name is
    // a usable string.
    if (isNonEmptyString(name) && name !== skill.directoryName) {
      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-007"), {
          message: `Skill name "${name}" does not match directory "${skill.directoryName}".`,
          file: skillFileDisplay,
          line: nameLine
        })
      );
    }

    // PS-SPEC-008 — description missing (or not a usable string).
    if (!isNonEmptyString(description)) {
      const specRule = requireRule(rules, "PS-SPEC-008");
      diagnostics.push(
        diagnosticFromRule(specRule, {
          message:
            description === null || description === undefined
              ? specRule.message
              : `${specRule.message} Found: ${JSON.stringify(description)}.`,
          file: skillFileDisplay,
          line: descriptionLine
        })
      );
    } else if (description.length > 1024) {
      // PS-SPEC-009 — description too long (spec limit: 1024 characters).
      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-009"), {
          message: `${requireRule(rules, "PS-SPEC-009").message} Found: ${description.length} characters.`,
          file: skillFileDisplay,
          line: descriptionLine
        })
      );
    }
  }

  // PS-SPEC-010 — referenced file missing. Scans the Markdown body for
  // relative file links and verifies each resolves inside the skill
  // directory. One diagnostic per missing target (deduplicated in the scan).
  if (typeof rawContent === "string" && typeof skill.body === "string") {
    const offset = bodyLineOffset(rawContent);

    for (const { target, line } of referencedBodyFiles(skill.body)) {
      const absolute = path.resolve(skill.root, target);

      if (await fileExists(absolute)) {
        continue;
      }

      diagnostics.push(
        diagnosticFromRule(requireRule(rules, "PS-SPEC-010"), {
          message: `SKILL.md references "${target}" but that file does not exist inside the skill directory.`,
          file: skillFileDisplay,
          line: offset + line
        })
      );
    }
  }

  return diagnostics;
}
