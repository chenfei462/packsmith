import { requireRule, diagnosticFromRule, joinDisplayPath, lineOfFrontmatterKey } from "./support.mjs";

/**
 * Activation checks (plan §11): PS-ACT-001 … PS-ACT-003.
 *
 * Deterministic heuristics over the skill description ONLY — the plan is
 * explicit (§11): "Activation checks should initially use deterministic
 * heuristics. Do not call an LLM." These checks measure the description an
 * agent actually reads when deciding whether to activate a skill:
 *
 *   PS-ACT-001  description too thin to describe a capability (length/word
 *               count floors)
 *   PS-ACT-002  description states what the skill does but gives no
 *               activation boundary (no "when to use" phrasing)
 *   PS-ACT-003  sibling skill descriptions overlap excessively (word-token
 *               Jaccard similarity above a fixed threshold)
 *
 * The heuristics are intentionally conservative: they only fire on clear,
 * measurable deficiencies, because a wrong warning costs author trust.
 */

/** Descriptions shorter than this cannot describe a capability meaningfully. */
const MIN_DESCRIPTION_CHARS = 40;
/** Below this word count (whitespace-delimited) a description is too thin. */
const MIN_DESCRIPTION_WORDS = 8;
/** Pairwise description token-overlap (Jaccard) above which siblings are
 * considered ambiguous for trigger selection. */
const SIBLING_OVERLAP_THRESHOLD = 0.7;

/**
 * Phrases that plausibly state when a skill applies: explicit "when/use"
 * language, workflow position ("before/during/after …"), intended audience
 * ("for …"), conditional ("if …") and trigger/activation vocabulary. CJK
 * equivalents included. Purely lexical, case-insensitive.
 */
const ACTIVATION_CUE_PATTERNS = [
  /\bwhen(ever)?\b/i,
  /\buse (this|it|me|cases?)\b/i,
  /\buse cases?\b/i,
  /\bif\b/i,
  /\bfor\b/i,
  /\bbefore\b/i,
  /\bduring\b/i,
  /\bafter\b/i,
  /\buntil\b/i,
  /\btrigger/i,
  /\bactivat/i,
  /\binvok/i,
  /\bideal\b/i,
  /\bintended\b/i,
  /\bapplicable\b/i,
  /\bhelps? (you|with|to|when)\b/i,
  /适合|何时|当你|用于|适用于/
];

/** Word tokens used for the sibling-overlap comparison (≥3 letters/digits). */
function descriptionTokens(description) {
  return new Set((description.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasActivationCue(description) {
  return ACTIVATION_CUE_PATTERNS.some((pattern) => pattern.test(description));
}

/**
 * Run the activation checks for one parsed skill.
 *
 * `skill`    — parseSkill() output.
 * `context`: { rules, displayDir, siblings } where `siblings` is the array of
 *            OTHER parsed skills in the same workspace (for PS-ACT-003).
 */
export function checkActivation(skill, context) {
  const { rules, displayDir, siblings = [] } = context;
  const diagnostics = [];

  // Activation heuristics judge the frontmatter description; without a usable
  // one the spec checks already reported the structural problem.
  if (skill.parse.status !== "ok") {
    return diagnostics;
  }

  const description = skill.frontmatter.description;

  if (typeof description !== "string" || description.trim() === "") {
    return diagnostics;
  }

  const trimmed = description.trim();
  const charCount = trimmed.length;
  const wordCount = trimmed.split(/\s+/).length;
  const descriptionLine = lineOfFrontmatterKey(skill.rawContent, "description");
  const skillFileDisplay = joinDisplayPath(displayDir, "SKILL.md");

  // PS-ACT-001 — description lacks useful semantic information. Measured
  // values are reported instead of a synthesized score. CJK descriptions
  // have no whitespace, so the word floor applies only when whitespace
  // separation is meaningful.
  const tooFewWords = /\s/.test(trimmed) && wordCount < MIN_DESCRIPTION_WORDS;

  if (charCount < MIN_DESCRIPTION_CHARS || tooFewWords) {
    const actRule = requireRule(rules, "PS-ACT-001");
    diagnostics.push(
      diagnosticFromRule(actRule, {
        message: `${actRule.message} Measured: ${charCount} characters, ${wordCount} words (floors: ${MIN_DESCRIPTION_CHARS} characters, ${MIN_DESCRIPTION_WORDS} words).`,
        file: skillFileDisplay,
        line: descriptionLine
      })
    );
  }

  // PS-ACT-002 — description lacks a clear activation/use-case boundary.
  if (!hasActivationCue(trimmed)) {
    diagnostics.push(
      diagnosticFromRule(requireRule(rules, "PS-ACT-002"), {
        file: skillFileDisplay,
        line: descriptionLine
      })
    );
  }

  // PS-ACT-003 — sibling descriptions overlap excessively. Compared against
  // every other skill in the workspace; each overlapping pair is reported
  // once, attached to the lexicographically later skill directory so no pair
  // is double-reported.
  const ownTokens = descriptionTokens(trimmed);

  for (const sibling of siblings) {
    if (sibling.directoryName <= skill.directoryName) {
      continue;
    }

    const siblingDescription = sibling.parse?.status === "ok" ? sibling.frontmatter?.description : null;

    if (typeof siblingDescription !== "string" || siblingDescription.trim() === "") {
      continue;
    }

    const similarity = jaccardSimilarity(ownTokens, descriptionTokens(siblingDescription));

    if (similarity > SIBLING_OVERLAP_THRESHOLD) {
      const actRule = requireRule(rules, "PS-ACT-003");
      diagnostics.push(
        diagnosticFromRule(actRule, {
          message: `${actRule.message} Descriptions of "${skill.directoryName}" and "${sibling.directoryName}" overlap at Jaccard similarity ${similarity.toFixed(2)} (threshold ${SIBLING_OVERLAP_THRESHOLD.toFixed(2)}).`,
          file: skillFileDisplay,
          line: descriptionLine
        })
      );
    }
  }

  return diagnostics;
}
