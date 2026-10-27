import { requireRule, diagnosticFromRule, countTextLines } from "./support.mjs";

/**
 * Context-budget checks (plan §11): PS-CTX-001 … PS-CTX-002.
 *
 * These checks report MEASURABLE values only (plan §11: "Do not invent an
 * arbitrary 'AI Context Score'. Report measurable values instead."):
 *
 *   PS-CTX-001  SKILL.md line count vs the recommended 500-line budget
 *               (knowledge-base rule limit: recommendedLines)
 *   PS-CTX-002  deterministic chars/4 token estimate of the SKILL.md body
 *               (parser estimateTokens) vs the recommended ~5000-token
 *               instruction budget (rule limit: recommendedTokens)
 *
 * Thresholds come from the knowledge-base rules, not from this module.
 */
export function checkContext(skill, context) {
  const { rules } = context;
  const diagnostics = [];

  // Both checks judge the SKILL.md file itself; without one there is nothing
  // to measure (PS-SPEC-001 already reported the missing file).
  if (typeof skill.rawContent !== "string") {
    return diagnostics;
  }

  // PS-CTX-001 — SKILL.md excessively large. Line count of the whole file.
  const ctxRule1 = requireRule(rules, "PS-CTX-001");
  const recommendedLines = ctxRule1.check?.limits?.recommendedLines ?? 500;
  const lineCount = countTextLines(skill.rawContent);

  if (lineCount > recommendedLines) {
    diagnostics.push(
      diagnosticFromRule(ctxRule1, {
        message: `SKILL.md: ${lineCount} lines\nRecommended limit: ${recommendedLines} lines`
      })
    );
  }

  // PS-CTX-002 — estimated instruction tokens too high. The estimate is the
  // parser's deterministic ceil(chars / 4) over the SKILL.md body — the same
  // number on every machine, no tokenizer, no synthesized score.
  const ctxRule2 = requireRule(rules, "PS-CTX-002");
  const recommendedTokens = ctxRule2.check?.limits?.recommendedTokens ?? 5000;
  const estimatedTokens = skill.stats.estimatedTokens;

  if (estimatedTokens > recommendedTokens) {
    diagnostics.push(
      diagnosticFromRule(ctxRule2, {
        message: `SKILL.md: ${estimatedTokens} estimated tokens (deterministic chars/4 estimate of the body)\nRecommended limit: ${recommendedTokens} estimated tokens`
      })
    );
  }

  return diagnostics;
}
