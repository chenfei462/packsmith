/**
 * Diagnostic engine (v0.2 Milestone 2, plan §8).
 *
 * One diagnostic model shared by every Packsmith check. This module is the
 * model + aggregation + exit-code convention ONLY: it deliberately contains
 * no concrete check rules (rules arrive with the knowledge base and checks/
 * in later milestones), never reads the filesystem, and never touches the
 * network. Every function is synchronous and pure unless documented otherwise.
 *
 * Diagnostic shape (plan §8):
 *
 * {
 *   id: "PS-SPEC-007",            // stable rule id, e.g. PS-<CATEGORY>-NNN
 *   severity: "error",            // "error" | "warning" | "info" — nothing else
 *   category: "spec",             // spec | activation | compatibility | context | security
 *   title: "...",                 // short, stable rule label
 *   message: "...",               // instance-specific, human-readable explanation
 *   file: "skills/x/SKILL.md",    // POSIX-style relative path, or null
 *   line: 2,                      // 1-based line, or null
 *   runtime: null,                // runtime id when the finding is runtime-specific
 *   evidence: ["agent-skills-spec"],
 *   fix: { available: true, safe: true } // or null when no automated fix exists
 * }
 *
 * Exit codes (plan §8):
 *   0 = PASS
 *   1 = Skill validation failure or behavioral regression
 *   2 = Packsmith/runtime infrastructure failure
 *
 * Hard requirement (plan §4.4/§8): infrastructure failures must NEVER be
 * reported as exit code 1 — resolveExitCode() therefore gives `infraErrors`
 * precedence over every failure count.
 */

/**
 * The only allowed severity values (plan §8). Ordered most severe first;
 * sorting and summaries rely on this order.
 */
export const SEVERITIES = Object.freeze(["error", "warning", "info"]);

/**
 * The initial diagnostic categories (plan §8), in plan order. The list may
 * grow in later milestones; checks must never invent categories locally.
 */
export const CATEGORIES = Object.freeze([
  "spec",
  "activation",
  "compatibility",
  "context",
  "security"
]);

const SEVERITY_RANK = Object.freeze(Object.fromEntries(SEVERITIES.map((name, index) => [name, index])));
const CATEGORY_RANK = Object.freeze(Object.fromEntries(CATEGORIES.map((name, index) => [name, index])));

/**
 * Exit code convention (plan §8). `VALIDATION_FAILURE` covers both Skill
 * validation failures and behavioral regressions;
 * `INFRASTRUCTURE_FAILURE` covers Packsmith/runtime faults and must never be
 * downgraded to `VALIDATION_FAILURE`.
 */
export const EXIT_CODES = Object.freeze({
  PASS: 0,
  VALIDATION_FAILURE: 1,
  INFRASTRUCTURE_FAILURE: 2
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPositiveIntegerOrNull(value) {
  return value === null || (Number.isInteger(value) && value >= 1);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function normalizeFix(fix) {
  if (fix === null || fix === undefined) {
    return null;
  }

  if (typeof fix !== "object" || Array.isArray(fix)) {
    throw new TypeError("diagnostic fix must be null or an object { available, safe }");
  }

  const { available, safe } = fix;
  if (typeof available !== "boolean" || typeof safe !== "boolean") {
    throw new TypeError("diagnostic fix requires boolean `available` and `safe`");
  }

  return Object.freeze({ available, safe });
}

/**
 * Create one validated, frozen diagnostic (plan §8 shape). Throws a
 * TypeError when a constraint is violated — an invalid diagnostic is a
 * caller bug, never something to silently coerce. Keys are always emitted in
 * the plan §8 order so JSON output is stable for CI consumers.
 */
export function createDiagnostic({
  id,
  severity,
  category,
  title,
  message,
  file = null,
  line = null,
  runtime = null,
  evidence = [],
  fix = null
} = {}) {
  if (!isNonEmptyString(id)) {
    throw new TypeError("diagnostic id must be a non-empty string");
  }

  if (!SEVERITIES.includes(severity)) {
    throw new TypeError(`diagnostic severity must be one of ${SEVERITIES.join("|")}, got ${JSON.stringify(severity)}`);
  }

  if (!CATEGORIES.includes(category)) {
    throw new TypeError(`diagnostic category must be one of ${CATEGORIES.join("|")}, got ${JSON.stringify(category)}`);
  }

  if (!isNonEmptyString(title)) {
    throw new TypeError("diagnostic title must be a non-empty string");
  }

  if (!isNonEmptyString(message)) {
    throw new TypeError("diagnostic message must be a non-empty string");
  }

  if (file !== null && !isNonEmptyString(file)) {
    throw new TypeError("diagnostic file must be a non-empty string or null");
  }

  if (!isPositiveIntegerOrNull(line)) {
    throw new TypeError("diagnostic line must be a positive integer or null");
  }

  if (runtime !== null && !isNonEmptyString(runtime)) {
    throw new TypeError("diagnostic runtime must be a non-empty string or null");
  }

  if (!Array.isArray(evidence) || !evidence.every(isNonEmptyString)) {
    throw new TypeError("diagnostic evidence must be an array of non-empty strings");
  }

  return Object.freeze({
    id,
    severity,
    category,
    title,
    message,
    file,
    line,
    runtime,
    evidence: Object.freeze([...evidence]),
    fix: normalizeFix(fix)
  });
}

/**
 * Structural predicate: true when `value` carries every diagnostic field
 * with a legal value (all fields must be present, null when unknown).
 * Used by collect/sort/summarize to keep invalid objects out of the model.
 */
export function isDiagnostic(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const hasShape =
    "id" in value &&
    "severity" in value &&
    "category" in value &&
    "title" in value &&
    "message" in value &&
    "file" in value &&
    "line" in value &&
    "runtime" in value &&
    "evidence" in value &&
    "fix" in value;

  if (!hasShape) {
    return false;
  }

  const fixIsLegal =
    value.fix === null ||
    (typeof value.fix === "object" &&
      !Array.isArray(value.fix) &&
      typeof value.fix.available === "boolean" &&
      typeof value.fix.safe === "boolean");

  return (
    isNonEmptyString(value.id) &&
    SEVERITIES.includes(value.severity) &&
    CATEGORIES.includes(value.category) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.message) &&
    (value.file === null || isNonEmptyString(value.file)) &&
    isPositiveIntegerOrNull(value.line) &&
    (value.runtime === null || isNonEmptyString(value.runtime)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isNonEmptyString) &&
    fixIsLegal
  );
}

function assertDiagnostics(value, functionName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${functionName} expects an array of diagnostics`);
  }

  for (const entry of value) {
    if (!isDiagnostic(entry)) {
      throw new TypeError(`${functionName} received a non-diagnostic entry: ${JSON.stringify(entry)}`);
    }
  }
}

/**
 * Flatten diagnostics from several sources (one array per check, in the
 * order the checks ran) into a single frozen array. Null/undefined sources
 * are skipped so callers can pass optional check results as-is. Entries are
 * validated; input order is preserved — sorting is a separate step.
 */
export function collectDiagnostics(...sources) {
  const collected = [];

  for (const source of sources) {
    if (source === null || source === undefined) {
      continue;
    }

    assertDiagnostics(source, "collectDiagnostics");
    collected.push(...source);
  }

  return Object.freeze(collected);
}

function compareStrings(a, b) {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/**
 * Deterministic total order: severity (error → warning → info), then
 * category (plan order), then id, file (null first), line (null first), and
 * finally message as the tie-break. Plain string comparison — never
 * locale-dependent — so the order is identical on every machine.
 */
function compareDiagnostics(a, b) {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) {
    return bySeverity;
  }

  const byCategory = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
  if (byCategory !== 0) {
    return byCategory;
  }

  const byId = compareStrings(a.id, b.id);
  if (byId !== 0) {
    return byId;
  }

  const byFile = compareStrings(a.file ?? "", b.file ?? "");
  if (byFile !== 0) {
    return byFile;
  }

  const byLine = (a.line ?? -1) - (b.line ?? -1);
  if (byLine !== 0) {
    return byLine;
  }

  return compareStrings(a.message, b.message);
}

/**
 * Pure sort: returns a new array ordered most-severe-first (see
 * compareDiagnostics); the input array is not mutated.
 */
export function sortDiagnostics(diagnostics) {
  assertDiagnostics(diagnostics, "sortDiagnostics");
  return [...diagnostics].sort(compareDiagnostics);
}

/**
 * Aggregate statistics for reporters and exit-code resolution:
 *
 * {
 *   errors, warnings, infos, total,
 *   byCategory: { spec, activation, compatibility, context, security } // zero-filled
 * }
 *
 * Zero-filling every known category keeps JSON output stable regardless of
 * which checks produced findings.
 */
export function summarizeDiagnostics(diagnostics) {
  assertDiagnostics(diagnostics, "summarizeDiagnostics");

  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byCategory = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));

  for (const entry of diagnostics) {
    bySeverity[entry.severity] += 1;
    byCategory[entry.category] += 1;
  }

  return Object.freeze({
    errors: bySeverity.error,
    warnings: bySeverity.warning,
    infos: bySeverity.info,
    total: diagnostics.length,
    byCategory: Object.freeze(byCategory)
  });
}

/**
 * Map failure counts onto the exit code convention (plan §8).
 *
 * Precedence rule (hard requirement, plan §4.4): any infrastructure failure
 * yields exit code 2 — even when validation errors or regressions are also
 * present — because a broken toolchain must never be reported as a Skill
 * failure. Errors and regressions both yield 1; anything else is 0.
 */
export function resolveExitCode({ errors = 0, regressions = 0, infraErrors = 0 } = {}) {
  if (!isCount(errors) || !isCount(regressions) || !isCount(infraErrors)) {
    throw new TypeError("resolveExitCode expects non-negative integer counts");
  }

  if (infraErrors > 0) {
    return EXIT_CODES.INFRASTRUCTURE_FAILURE;
  }

  if (errors > 0 || regressions > 0) {
    return EXIT_CODES.VALIDATION_FAILURE;
  }

  return EXIT_CODES.PASS;
}

/**
 * Convenience wiring for commands: summarize a diagnostics list and map it
 * through resolveExitCode. Validation errors in the list produce exit code
 * 1; `regressions`/`infraErrors` let behavioral layers feed the same
 * convention (regressions → 1, infra → 2 with precedence).
 */
export function exitCodeForDiagnostics(diagnostics, { regressions = 0, infraErrors = 0 } = {}) {
  const summary = summarizeDiagnostics(diagnostics);
  return resolveExitCode({ errors: summary.errors, regressions, infraErrors });
}
