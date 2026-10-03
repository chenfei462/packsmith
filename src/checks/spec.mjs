import path from "node:path";
// Default import so tests can inject fs faults through the module object
// (same pattern as src/lib/pack.mjs and tests/fixtures/fault-injection-loader.mjs).
import fsPromises from "node:fs/promises";

import { InfrastructureError } from "../core/diagnostics.mjs";
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

/** Markdown link/image destinations: `[text](target)` / `![alt](target)`.
 * The destination is either an angle-bracket form `<…>` (may contain
 * spaces) or a bare run up to the first whitespace or `)`; anything after
 * it (a `"title"`, `'title'` or `(title)`) is not part of the destination. */
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)[^)]*\)/g;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isUrlLike(target) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith("//");
}

function isAbsolutePathLike(target) {
  return target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target);
}

/** Percent-decode a destination without throwing on malformed sequences
 * (e.g. a literal filename like `100%.md` stays verbatim). */
function safeDecodePercent(target) {
  if (!target.includes("%")) {
    return target;
  }

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/**
 * Normalize one raw Markdown destination into the file path a reader would
 * resolve it to (CommonMark: the destination is a URI). One deterministic
 * pipeline for BOTH destination forms:
 *   1. remove the `<…>` wrapper when present;
 *   2. remove backslash escapes before ASCII punctuation — backslash
 *      escapes are processed in bare and angle-bracket destinations alike;
 *   3. drop a trailing `?query` / `#fragment`. Encoded separators (`%23`,
 *      `%3F`) are untouched here and decode into literal filename
 *      characters in step 4;
 *   4. percent-decode exactly once. Malformed sequences (a literal file
 *      named `100%.md`) stay verbatim.
 * Pure.
 */
export function normalizeLinkDestination(raw) {
  let target = raw;

  if (target.startsWith("<") && target.endsWith(">") && target.length >= 2) {
    target = target.slice(1, -1);
  }

  target = target.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
  target = target.replace(/[?#].*$/, "");
  return safeDecodePercent(target);
}

/**
 * Collect relative file targets referenced from the Markdown body. Pure.
 * Returns `{ target, line }` — `target` is the decoded path the link
 * resolves to (single decode; see normalizeLinkDestination) and `line` the
 * 1-based body line of the first link. Deduplicated by target in
 * first-seen order. URLs, bare anchors and absolute paths are not file
 * references and are skipped.
 */
export function referencedBodyFiles(body) {
  const targets = [];
  const seen = new Set();
  const lines = String(body ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(MARKDOWN_LINK_PATTERN)) {
      const raw = match[1];
      const isAngle = raw.startsWith("<") && raw.endsWith(">") && raw.length >= 2;
      const schemeProbe = isAngle ? raw.slice(1, -1) : raw.replace(/[?#].*$/, "");
      const target = normalizeLinkDestination(raw);

      if (target === "" || isUrlLike(schemeProbe) || isAbsolutePathLike(target) || seen.has(target)) {
        continue;
      }

      seen.add(target);
      targets.push({ target, line: index + 1 });
    }
  }

  return targets;
}

/**
 * Existence probe for referenced files: ENOENT is a fact (false), any other
 * stat failure (EACCES, EIO, …) is an infrastructure fault and is thrown —
 * a probe failure must never be reported as a missing reference (plan §4.4).
 */
async function fileExists(absolutePath) {
  try {
    await fsPromises.stat(absolutePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw new InfrastructureError(`Cannot stat referenced file ${absolutePath}: ${error.message}`, { cause: error });
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
  // relative file links (percent-encoded, angle-bracket, escaped and
  // anchored destinations included) and verifies each resolves inside the
  // skill directory. The link resolves to exactly ONE decoded path — a
  // literal on-disk name like `p%20q.md` does not satisfy a reference to
  // `p%20q.md` (which decodes to `p q.md`); double-encoding (`%2520`)
  // addresses it instead. One diagnostic per missing target.
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
