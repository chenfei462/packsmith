import { requireRule, diagnosticFromRule, joinDisplayPath, lineOfFrontmatterKey } from "./support.mjs";

/**
 * Compatibility checks (plan §11): PS-COMP-001 … PS-COMP-002.
 *
 * Static, deterministic frontmatter portability analysis against the
 * knowledge-base rules:
 *
 *   PS-COMP-001 (info)    frontmatter keys outside the standard field set
 *   PS-COMP-002 (warning) runtime-specific frontmatter keys, which other
 *                         runtimes ignore or reject
 *
 * `--target <runtime>` narrows the runtime view (plan §12): frontmatter keys
 * that belong to the requested target runtime are intentional there and are
 * not reported for it.
 */
export function checkCompatibility(skill, context) {
  const { rules, displayDir, targetRuntime = null } = context;
  const diagnostics = [];

  // Both checks judge a usable frontmatter mapping; structural problems are
  // already reported by the spec checks.
  if (skill.parse.status !== "ok") {
    return diagnostics;
  }

  const skillFileDisplay = joinDisplayPath(displayDir, "SKILL.md");
  const frontmatterKeys = Object.keys(skill.frontmatter);

  const compRule2 = requireRule(rules, "PS-COMP-002");
  const knownRuntimeKeys = compRule2.check?.knownRuntimeKeys ?? {};

  // Keys documented by the requested target runtime are intentional there.
  // Ownership is a SUPPORT question relative to the target: a key documented
  // by several runtimes is not "cursor-specific" noise when the target is
  // Claude Code and both document it — only runtimes that do NOT document
  // it keep the portability warning (PS-COMP-002).
  const targetOwnedKeys =
    targetRuntime !== null && Array.isArray(knownRuntimeKeys[targetRuntime])
      ? knownRuntimeKeys[targetRuntime]
      : [];

  // PS-COMP-001 — non-standard frontmatter keys. The standard field set comes
  // from the knowledge-base rule (check.standardFields); keys owned by the
  // requested target runtime are exempt (they are that runtime's documented
  // fields, not portable-metadata noise).
  const compRule1 = requireRule(rules, "PS-COMP-001");
  const standardFields = new Set(compRule1.check?.standardFields ?? ["name", "description"]);
  const nonStandardKeys = frontmatterKeys
    .filter((key) => !standardFields.has(key) && !targetOwnedKeys.includes(key))
    .sort();

  if (nonStandardKeys.length > 0) {
    const firstLine = nonStandardKeys
      .map((key) => lineOfFrontmatterKey(skill.rawContent, key))
      .find((line) => line !== null);

    diagnostics.push(
      diagnosticFromRule(compRule1, {
        message: `${compRule1.message} Non-standard key(s): ${nonStandardKeys.join(", ")}.`,
        file: skillFileDisplay,
        line: firstLine ?? null
      })
    );
  }

  // PS-COMP-002 — runtime-specific metadata reduces portability. The mapping
  // of runtime id → that runtime's documented frontmatter keys comes from the
  // knowledge-base rule (check.knownRuntimeKeys). Keys the requested target
  // runtime supports are intentional there and are not reported for it.
  for (const runtimeId of Object.keys(knownRuntimeKeys).sort()) {
    const runtimeKeys = Array.isArray(knownRuntimeKeys[runtimeId]) ? knownRuntimeKeys[runtimeId] : [];
    const offendingKeys = frontmatterKeys
      .filter((key) => runtimeKeys.includes(key) && !targetOwnedKeys.includes(key))
      .sort();

    if (offendingKeys.length === 0) {
      continue;
    }

    const firstLine = offendingKeys
      .map((key) => lineOfFrontmatterKey(skill.rawContent, key))
      .find((line) => line !== null);

    diagnostics.push(
      diagnosticFromRule(compRule2, {
        message: `${compRule2.message} ${runtimeId}-specific key(s): ${offendingKeys.join(", ")}.`,
        file: skillFileDisplay,
        line: firstLine ?? null,
        runtime: runtimeId
      })
    );
  }

  return diagnostics;
}
