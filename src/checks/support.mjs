import { createDiagnostic } from "../core/diagnostics.mjs";
import { splitFrontmatter } from "../core/skill-parser.mjs";

/**
 * Shared helpers for the v0.2 checks (plan §5 checks/, Milestone 4).
 *
 * Small pure functions only: every check module (spec/activation/context/
 * compatibility/security) turns a knowledge-base rule (plan §10 shape) into a
 * diagnostic-engine object (plan §8 shape) and reports deterministic
 * file:line locations. No LLM, no network, no global state.
 */

/**
 * Build one validated diagnostic-engine object (plan §8, createDiagnostic)
 * from a knowledge-base rule plus instance-specific overrides. The rule is
 * the single source of truth for id, severity, title, default message, fix
 * metadata and evidence provenance (plan §31 hard requirement 7/8); evidence
 * entries are flattened to their source ids, matching plan §8's example
 * (`evidence: ["agent-skills-spec"]`).
 *
 * `overrides`: { message?, file?, line?, runtime? } — everything optional.
 */
export function diagnosticFromRule(rule, overrides = {}) {
  return createDiagnostic({
    id: rule.id,
    severity: rule.severity,
    category: rule.category,
    title: rule.title,
    message: overrides.message ?? rule.message,
    file: overrides.file ?? null,
    line: overrides.line ?? null,
    runtime: overrides.runtime ?? null,
    evidence: rule.evidence.map((entry) => entry.source),
    fix: rule.fix ? { available: rule.fix.available, safe: rule.fix.safe } : null
  });
}

/** Look up one knowledge rule by id; throws when absent — a check referencing
 * an unknown rule id is a Packsmith bug, never a Skill finding. */
export function requireRule(rules, id) {
  const rule = rules.find((entry) => entry.id === id);

  if (!rule) {
    throw new Error(`Knowledge base is missing rule ${id} required by checks`);
  }

  return rule;
}

/** Join a display directory ("." or "skills/x") with a file name (POSIX). */
export function joinDisplayPath(displayDir, fileName) {
  return displayDir === "." ? fileName : `${displayDir}/${fileName}`;
}

/**
 * Count text lines the way editors do: a trailing newline does not start a
 * new line. CRLF tolerated. Empty text = 0 lines.
 */
export function countTextLines(text) {
  if (text === "") {
    return 0;
  }

  const lines = text.split(/\r?\n/);

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 1-based line of `<key>:` inside the SKILL.md frontmatter block, or null.
 * Line 1 is the opening fence, so frontmatter line i is file line i + 2.
 */
export function lineOfFrontmatterKey(rawContent, key) {
  if (typeof rawContent !== "string") {
    return null;
  }

  const { frontmatterText, hasBlock } = splitFrontmatter(rawContent);

  if (!hasBlock || typeof frontmatterText !== "string") {
    return null;
  }

  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const lines = frontmatterText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index].replace(/\r$/, ""))) {
      return index + 2;
    }
  }

  return null;
}

/** First 1-based line of `text` matching `regex`, or null. */
export function lineOfPattern(text, regex) {
  if (typeof text !== "string") {
    return null;
  }

  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (regex.test(lines[index])) {
      return index + 1;
    }
  }

  return null;
}

/**
 * Number of complete lines that precede the Markdown body inside the raw
 * SKILL.md text, so a 1-based body line `n` maps to file line `offset + n`.
 * The offset is derived structurally from the closing frontmatter fence
 * (skill-parser's bodyStartLine), never from searching for the body text —
 * identical text inside the frontmatter would otherwise drag the offset to
 * the wrong line. 0 without a frontmatter block or without a body.
 */
export function bodyLineOffset(rawContent) {
  if (typeof rawContent !== "string") {
    return 0;
  }

  const { hasBlock, bodyStartLine } = splitFrontmatter(rawContent);

  if (!hasBlock || bodyStartLine === null) {
    return 0;
  }

  return bodyStartLine - 1;
}
