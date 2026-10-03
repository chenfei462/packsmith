import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { CATEGORIES, SEVERITIES } from "../core/diagnostics.mjs";

/**
 * Knowledge base loader (v0.2 Milestone 3, plan §9/§10/§11).
 *
 * Loads the version-controlled JSON knowledge base that separates Packsmith's
 * runtime/spec knowledge from executable checking logic. Plain files only —
 * no database, no SQLite, no vector store, no embeddings, no RAG (plan §9).
 *
 * Structure (plan §9):
 *
 *   knowledge-base/
 *   ├── manifest.json          — schema + counts, cross-checked against content
 *   ├── sources/sources.json   — evidence source registry (rule traceability)
 *   ├── runtimes/<id>.json     — one record per runtime, listed in manifest
 *   └── rules/<category>.json  — one array of rules per diagnostic category
 *
 * Rule shape (plan §10): { id, title, category, severity, appliesTo, check,
 * message, fix, evidence } where every evidence entry carries { source,
 * sourceType, normative, verifiedOn } and `source` must resolve to a record in
 * sources/sources.json (hard requirement 7/8: evidence provenance + verifiedOn).
 *
 * Design:
 * - Pure validators (validateSource / validateRuntimeRecord / validateRule /
 *   validateRules / validateManifest / validateManifestCounts) take plain data
 *   and return arrays of problem strings — testable without any filesystem.
 * - loadKnowledgeBase() is the only I/O entry point: it reads the files, runs
 *   every validator, and throws one aggregated Error on any problem. A broken
 *   knowledge base is an infrastructure fault, never a silent empty result.
 * - The loaded knowledge base is deeply frozen; nothing may mutate it at
 *   runtime.
 * - Rules carry the five diagnostic categories and severities shared with the
 *   diagnostic engine (imported from ../core/diagnostics.mjs) so the two can
 *   never drift apart.
 */

/** Absolute path of the bundled knowledge base, independent of process cwd. */
export const DEFAULT_KNOWLEDGE_BASE_PATH = fileURLToPath(
  new URL("../../knowledge-base/", import.meta.url)
);

/** Rule file per diagnostic category (plan §9). Keys follow plan §8 category order. */
export const RULE_FILES = Object.freeze({
  spec: "spec.json",
  activation: "activation.json",
  compatibility: "compatibility.json",
  context: "context.json",
  security: "security.json"
});

/** The initial runtime ids from plan §9/§15 (agent-skills is the spec record). */
export const RUNTIME_IDS = Object.freeze([
  "agent-skills",
  "claude-code",
  "codex",
  "cursor",
  "gemini-cli",
  "opencode"
]);

/** Allowed evidence sourceType values for this knowledge base. */
export const SOURCE_TYPES = Object.freeze(["spec", "docs"]);

/** Allowed runtime record kinds: the spec itself, or an agent runtime. */
export const RUNTIME_KINDS = Object.freeze(["spec", "runtime"]);

/** RFC 2119 normative keywords accepted on evidence entries. */
export const NORMATIVE_KEYWORDS = Object.freeze([
  "MUST",
  "MUST NOT",
  "REQUIRED",
  "SHALL",
  "SHALL NOT",
  "SHOULD",
  "SHOULD NOT",
  "RECOMMENDED",
  "MAY",
  "OPTIONAL"
]);

/** Rule ids encode their category: PS-<PREFIX>-NNN. */
const CATEGORY_PREFIX = Object.freeze({
  spec: "SPEC",
  activation: "ACT",
  compatibility: "COMP",
  context: "CTX",
  security: "SEC"
});

const RULE_ID_PATTERN = /^PS-[A-Z]{3,4}-\d{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALL_RUNTIMES = "all";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/** Strict ISO calendar date (YYYY-MM-DD), rejects impossible dates like 2026-02-30. */
function isValidIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function exactKeys(value, expectedKeys, label, problems) {
  const actual = [...Object.keys(value)].sort();
  const expected = [...expectedKeys].sort();

  if (actual.join("\u0000") !== expected.join("\u0000")) {
    problems.push(
      `${label} must have exactly the fields ${expected.join(", ")} (got ${actual.join(", ") || "none"})`
    );
    return false;
  }

  return true;
}

function allowedKeys(value, requiredKeys, optionalKeys, label, problems) {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      problems.push(`${label} has unknown field "${key}" (allowed: ${[...allowed].sort().join(", ")})`);
    }
  }
}

function hasExactFields(value, expectedKeys) {
  const actual = [...Object.keys(value)].sort();
  const expected = [...expectedKeys].sort();
  return actual.join("\u0000") === expected.join("\u0000");
}

/**
 * Validate one evidence entry (plan §10). Every entry must carry exactly
 * { source, sourceType, normative, verifiedOn }; `source` must be declared in
 * sources/sources.json and `sourceType` must agree with that record.
 */
function validateEvidenceEntry(entry, context, label, problems) {
  if (!isPlainObject(entry)) {
    problems.push(`${label} evidence entry must be an object`);
    return;
  }

  if (!hasExactFields(entry, ["source", "sourceType", "normative", "verifiedOn"])) {
    problems.push(
      `${label} evidence entry must have exactly the fields source, sourceType, normative, verifiedOn`
    );
    return;
  }

  if (!isNonEmptyString(entry.source)) {
    problems.push(`${label} evidence source must be a non-empty string`);
  } else if (!context.sourceIds.has(entry.source)) {
    problems.push(
      `${label} evidence source "${entry.source}" is not declared in sources/sources.json`
    );
  }

  if (!isNonEmptyString(entry.sourceType)) {
    problems.push(`${label} evidence sourceType must be a non-empty string`);
  } else if (!SOURCE_TYPES.includes(entry.sourceType)) {
    problems.push(
      `${label} evidence sourceType must be one of ${SOURCE_TYPES.join("|")}, got ${JSON.stringify(entry.sourceType)}`
    );
  }

  if (
    isNonEmptyString(entry.source) &&
    isNonEmptyString(entry.sourceType) &&
    context.sourceTypesById.get(entry.source) &&
    context.sourceTypesById.get(entry.source) !== entry.sourceType
  ) {
    problems.push(
      `${label} evidence sourceType "${entry.sourceType}" does not match the type declared for source "${entry.source}" (${context.sourceTypesById.get(entry.source)})`
    );
  }

  if (!NORMATIVE_KEYWORDS.includes(entry.normative)) {
    problems.push(
      `${label} evidence normative must be one of ${NORMATIVE_KEYWORDS.join("|")}, got ${JSON.stringify(entry.normative)}`
    );
  }

  if (!isValidIsoDate(entry.verifiedOn)) {
    problems.push(
      `${label} evidence verifiedOn must be a valid ISO date (YYYY-MM-DD), got ${JSON.stringify(entry.verifiedOn)}`
    );
  }
}

function buildEvidenceContext(sources) {
  const sourceIds = new Set();
  const sourceTypesById = new Map();

  for (const source of sources) {
    if (isPlainObject(source) && isNonEmptyString(source.id)) {
      sourceIds.add(source.id);
      sourceTypesById.set(source.id, source.sourceType);
    }
  }

  return { sourceIds, sourceTypesById };
}

function validateEvidenceList(evidence, context, label, problems) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    problems.push(`${label} evidence must be a non-empty array`);
    return;
  }

  evidence.forEach((entry, index) => {
    validateEvidenceEntry(entry, context, `${label} evidence[${index}]`, problems);
  });
}

/**
 * Validate one source record from sources/sources.json. Pure.
 * Required: id, title, sourceType, url. Optional: publisher, notes.
 */
export function validateSource(source) {
  const problems = [];

  if (!isPlainObject(source)) {
    problems.push("source must be a JSON object");
    return problems;
  }

  allowedKeys(source, ["id", "title", "sourceType", "url"], ["publisher", "notes"], "source", problems);

  if (!isNonEmptyString(source.id)) {
    problems.push("source id must be a non-empty string");
  }

  if (!isNonEmptyString(source.title)) {
    problems.push("source title must be a non-empty string");
  }

  if (!isNonEmptyString(source.sourceType)) {
    problems.push("source sourceType must be a non-empty string");
  } else if (!SOURCE_TYPES.includes(source.sourceType)) {
    problems.push(`source sourceType must be one of ${SOURCE_TYPES.join("|")}, got ${JSON.stringify(source.sourceType)}`);
  }

  if (!isNonEmptyString(source.url) || !source.url.startsWith("https://")) {
    problems.push("source url must be an https:// URL");
  }

  if (source.publisher !== undefined && !isNonEmptyString(source.publisher)) {
    problems.push("source publisher must be a non-empty string when present");
  }

  if (source.notes !== undefined && !isNonEmptyString(source.notes)) {
    problems.push("source notes must be a non-empty string when present");
  }

  return problems;
}

/**
 * Validate one runtime record from runtimes/<id>.json. Pure.
 * Required: id, name, kind, evidence. Payload keys (skillDiscovery,
 * frontmatter, v02Scope, ...) are open knowledge and not enumerated here.
 */
export function validateRuntimeRecord(record, { sources = [] } = {}) {
  const problems = [];

  if (!isPlainObject(record)) {
    problems.push("runtime record must be a JSON object");
    return problems;
  }

  for (const field of ["id", "name", "kind"]) {
    if (!isNonEmptyString(record[field])) {
      problems.push(`runtime ${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(record.kind) && !RUNTIME_KINDS.includes(record.kind)) {
    problems.push(`runtime kind must be one of ${RUNTIME_KINDS.join("|")}, got ${JSON.stringify(record.kind)}`);
  }

  validateEvidenceList(record.evidence, buildEvidenceContext(sources), `runtime "${record.id ?? "?"}"`, problems);

  return problems;
}

/**
 * Validate one knowledge rule against the plan §10 schema. Pure.
 * `sources`/`runtimes` are the loaded records used to check evidence and
 * appliesTo traceability. Returns an array of problem strings (empty = valid).
 */
export function validateRule(rule, { sources = [], runtimes = [] } = {}) {
  const problems = [];

  if (!isPlainObject(rule)) {
    problems.push("rule must be a JSON object");
    return problems;
  }

  exactKeys(
    rule,
    ["id", "title", "category", "severity", "appliesTo", "check", "message", "fix", "evidence"],
    `rule ${isNonEmptyString(rule.id) ? `"${rule.id}"` : "(missing id)"}`,
    problems
  );

  const label = `rule "${isNonEmptyString(rule.id) ? rule.id : "(missing id)"}"`;

  if (!isNonEmptyString(rule.id)) {
    problems.push(`${label} id must be a non-empty string`);
  } else if (!RULE_ID_PATTERN.test(rule.id)) {
    problems.push(`${label} id must match the pattern PS-<CATEGORY>-NNN (three or four uppercase letters, three digits)`);
  }

  if (!CATEGORIES.includes(rule.category)) {
    problems.push(`${label} category must be one of ${CATEGORIES.join("|")}, got ${JSON.stringify(rule.category)}`);
  } else if (
    isNonEmptyString(rule.id) &&
    RULE_ID_PATTERN.test(rule.id) &&
    !rule.id.startsWith(`PS-${CATEGORY_PREFIX[rule.category]}-`)
  ) {
    problems.push(
      `${label} id must use the PS-${CATEGORY_PREFIX[rule.category]}-NNN prefix for category "${rule.category}"`
    );
  }

  if (!SEVERITIES.includes(rule.severity)) {
    problems.push(`${label} severity must be one of ${SEVERITIES.join("|")}, got ${JSON.stringify(rule.severity)}`);
  }

  if (!isNonEmptyString(rule.title)) {
    problems.push(`${label} title must be a non-empty string`);
  }

  if (!isNonEmptyString(rule.message)) {
    problems.push(`${label} message must be a non-empty string`);
  }

  if (!isPlainObject(rule.appliesTo)) {
    problems.push(`${label} appliesTo must be an object`);
  } else {
    const runtimesField = rule.appliesTo.runtimes;

    if (!Array.isArray(runtimesField) || runtimesField.length === 0) {
      problems.push(`${label} appliesTo.runtimes must be a non-empty array`);
    } else {
      const knownRuntimeIds = new Set(runtimes.filter(isPlainObject).map((runtime) => runtime.id));

      for (const runtimeId of runtimesField) {
        if (!isNonEmptyString(runtimeId)) {
          problems.push(`${label} appliesTo.runtimes entries must be non-empty strings`);
        } else if (runtimeId !== ALL_RUNTIMES && !knownRuntimeIds.has(runtimeId)) {
          problems.push(
            `${label} appliesTo.runtimes entry "${runtimeId}" is not a known runtime id or "${ALL_RUNTIMES}"`
          );
        }
      }
    }
  }

  if (!isPlainObject(rule.check)) {
    problems.push(`${label} check must be an object`);
  } else if (!isNonEmptyString(rule.check.type)) {
    problems.push(`${label} check.type must be a non-empty string`);
  }

  if (!isPlainObject(rule.fix)) {
    problems.push(`${label} fix must be an object`);
  } else if (
    !hasExactFields(rule.fix, ["available", "safe"]) ||
    typeof rule.fix.available !== "boolean" ||
    typeof rule.fix.safe !== "boolean"
  ) {
    problems.push(`${label} fix must have exactly the boolean fields available and safe`);
  }

  validateEvidenceList(rule.evidence, buildEvidenceContext(sources), label, problems);

  return problems;
}

/**
 * Validate a whole rules array: per-rule structure plus id uniqueness across
 * the entire knowledge base. Pure.
 */
export function validateRules(rules, context = {}) {
  const problems = [];

  if (!Array.isArray(rules)) {
    problems.push("rules must be an array");
    return problems;
  }

  const seenIds = new Map();

  rules.forEach((rule, index) => {
    for (const problem of validateRule(rule, context)) {
      problems.push(`rules[${index}]: ${problem}`);
    }

    if (isPlainObject(rule) && isNonEmptyString(rule.id)) {
      if (seenIds.has(rule.id)) {
        problems.push(`duplicate rule id "${rule.id}" (also at rules[${seenIds.get(rule.id)}])`);
      } else {
        seenIds.set(rule.id, index);
      }
    }
  });

  return problems;
}

/**
 * Validate the manifest shape: schema metadata plus the runtime/rule file
 * lists that drive loading. Count cross-checks live in validateManifestCounts.
 */
export function validateManifest(manifest) {
  const problems = [];

  if (!isPlainObject(manifest)) {
    problems.push("manifest must be a JSON object");
    return problems;
  }

  if (manifest.schemaVersion !== 1) {
    problems.push(`manifest schemaVersion must be 1, got ${JSON.stringify(manifest.schemaVersion)}`);
  }

  for (const field of ["name", "description", "version"]) {
    if (!isNonEmptyString(manifest[field])) {
      problems.push(`manifest ${field} must be a non-empty string`);
    }
  }

  if (!isValidIsoDate(manifest.updatedAt)) {
    problems.push("manifest updatedAt must be a valid ISO date (YYYY-MM-DD)");
  }

  if (!Array.isArray(manifest.runtimes) || manifest.runtimes.length === 0) {
    problems.push("manifest runtimes must be a non-empty array of runtime ids");
  } else {
    const seen = new Set();

    for (const runtimeId of manifest.runtimes) {
      if (!isNonEmptyString(runtimeId)) {
        problems.push("manifest runtimes entries must be non-empty strings");
      } else if (seen.has(runtimeId)) {
        problems.push(`manifest runtimes lists "${runtimeId}" more than once`);
      } else {
        seen.add(runtimeId);
      }
    }
  }

  if (!Array.isArray(manifest.ruleFiles) || manifest.ruleFiles.length === 0) {
    problems.push("manifest ruleFiles must be a non-empty array of category names");
  } else {
    const seen = new Set();

    for (const category of manifest.ruleFiles) {
      if (!CATEGORIES.includes(category)) {
        problems.push(`manifest ruleFiles entry ${JSON.stringify(category)} is not a diagnostic category (${CATEGORIES.join("|")})`);
      } else if (seen.has(category)) {
        problems.push(`manifest ruleFiles lists "${category}" more than once`);
      } else {
        seen.add(category);
      }
    }
  }

  if (!isPlainObject(manifest.counts)) {
    problems.push("manifest counts must be an object");
    return problems;
  }

  for (const field of ["sources", "runtimes", "rules"]) {
    if (!isNonNegativeInteger(manifest.counts[field])) {
      problems.push(`manifest counts.${field} must be a non-negative integer`);
    }
  }

  if (isPlainObject(manifest.counts.rulesByCategory)) {
    const keys = Object.keys(manifest.counts.rulesByCategory).sort();
    const expected = [...CATEGORIES].sort();

    if (keys.join("\u0000") !== expected.join("\u0000")) {
      problems.push(`manifest counts.rulesByCategory must have exactly the keys ${expected.join(", ")}`);
    } else {
      for (const category of CATEGORIES) {
        if (!isNonNegativeInteger(manifest.counts.rulesByCategory[category])) {
          problems.push(`manifest counts.rulesByCategory.${category} must be a non-negative integer`);
        }
      }
    }
  } else {
    problems.push("manifest counts.rulesByCategory must be an object keyed by category");
  }

  return problems;
}

/**
 * Cross-check the manifest counts against the actually loaded content.
 * Pure. `actual` = { sources, runtimes, rules, rulesByCategory }.
 */
export function validateManifestCounts(manifest, actual) {
  const problems = [];

  if (!isPlainObject(manifest) || !isPlainObject(manifest.counts)) {
    problems.push("manifest counts cannot be cross-checked: manifest.counts is missing");
    return problems;
  }

  const counts = manifest.counts;

  for (const field of ["sources", "runtimes", "rules"]) {
    if (isNonNegativeInteger(counts[field]) && counts[field] !== actual[field]) {
      problems.push(
        `manifest counts.${field} is ${counts[field]} but the knowledge base contains ${actual[field]}`
      );
    }
  }

  if (isPlainObject(counts.rulesByCategory)) {
    let categoryTotal = 0;
    let countsUsable = true;

    for (const category of CATEGORIES) {
      const declared = counts.rulesByCategory[category];
      const loaded = actual.rulesByCategory[category] ?? 0;

      if (!isNonNegativeInteger(declared)) {
        countsUsable = false;
        continue;
      }

      categoryTotal += declared;

      if (declared !== loaded) {
        problems.push(
          `manifest counts.rulesByCategory.${category} is ${declared} but the knowledge base contains ${loaded}`
        );
      }
    }

    if (countsUsable && isNonNegativeInteger(counts.rules) && counts.rules !== categoryTotal) {
      problems.push(`manifest counts.rules (${counts.rules}) does not equal the rulesByCategory total (${categoryTotal})`);
    }
  }

  return problems;
}

/**
 * Look up one rule by id. Pure. Returns the rule object or null when absent;
 * throws only when `rules` is not an array (caller bug).
 */
export function findRuleById(rules, id) {
  if (!Array.isArray(rules)) {
    throw new TypeError("findRuleById expects an array of rules");
  }

  return rules.find((rule) => isPlainObject(rule) && rule.id === id) ?? null;
}

/**
 * Filter rules by diagnostic category. Pure. Unknown categories throw (they
 * are caller bugs — the legal set is fixed by the diagnostic engine); a legal
 * category with no rules yields an empty frozen array.
 */
export function rulesByCategory(rules, category) {
  if (!Array.isArray(rules)) {
    throw new TypeError("rulesByCategory expects an array of rules");
  }

  if (!CATEGORIES.includes(category)) {
    throw new TypeError(`rulesByCategory category must be one of ${CATEGORIES.join("|")}, got ${JSON.stringify(category)}`);
  }

  return Object.freeze(rules.filter((rule) => isPlainObject(rule) && rule.category === category));
}

function deepFreeze(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    if (!Object.isFrozen(value)) {
      Object.freeze(value);
    }

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

async function readJsonFile(filePath) {
  let raw;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Knowledge base file cannot be read: ${filePath} (${error.message})`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Knowledge base file is not valid JSON: ${filePath} (${error.message})`);
  }
}

/**
 * Load and validate the whole knowledge base. Throws one aggregated Error
 * listing every structural problem when anything is invalid; otherwise
 * returns a deeply frozen snapshot:
 *
 * {
 *   root,       // absolute knowledge-base/ directory used
 *   manifest,   // parsed manifest.json
 *   sources,    // array of source records
 *   runtimes,   // array of runtime records (order of manifest.runtimes)
 *   rules       // array of all rules, category files in plan §8 order
 * }
 */
export async function loadKnowledgeBase({ root = DEFAULT_KNOWLEDGE_BASE_PATH } = {}) {
  const baseRoot = path.resolve(root);
  const problems = [];

  const manifest = await readJsonFile(path.join(baseRoot, "manifest.json"));

  for (const problem of validateManifest(manifest)) {
    problems.push(`manifest.json: ${problem}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid knowledge base at ${baseRoot}:\n${problems.map((entry) => `  - ${entry}`).join("\n")}`);
  }

  const sourcesRaw = await readJsonFile(path.join(baseRoot, "sources", "sources.json"));

  if (!Array.isArray(sourcesRaw)) {
    throw new Error(`Invalid knowledge base at ${baseRoot}:\n  - sources/sources.json must be an array of source records`);
  }

  const sources = [];

  sourcesRaw.forEach((source, index) => {
    for (const problem of validateSource(source)) {
      problems.push(`sources/sources.json[${index}]: ${problem}`);
    }

    sources.push(source);
  });

  const seenSourceIds = new Map();

  sources.forEach((source, index) => {
    if (isPlainObject(source) && isNonEmptyString(source.id)) {
      if (seenSourceIds.has(source.id)) {
        problems.push(
          `sources/sources.json[${index}]: duplicate source id "${source.id}" (also at [${seenSourceIds.get(source.id)}])`
        );
      } else {
        seenSourceIds.set(source.id, index);
      }
    }
  });

  const runtimes = [];

  for (const runtimeId of manifest.runtimes) {
    const record = await readJsonFile(path.join(baseRoot, "runtimes", `${runtimeId}.json`));

    if (isPlainObject(record) && record.id !== runtimeId) {
      problems.push(`runtimes/${runtimeId}.json: record id ${JSON.stringify(record.id)} must match the file name`);
    }

    for (const problem of validateRuntimeRecord(record, { sources })) {
      problems.push(`runtimes/${runtimeId}.json: ${problem}`);
    }

    runtimes.push(record);
  }

  const rules = [];

  for (const category of manifest.ruleFiles) {
    const categoryRules = await readJsonFile(path.join(baseRoot, "rules", RULE_FILES[category]));

    if (!Array.isArray(categoryRules)) {
      problems.push(`rules/${RULE_FILES[category]} must be an array of rules`);
      continue;
    }

    categoryRules.forEach((rule, index) => {
      if (isPlainObject(rule) && rule.category !== category) {
        problems.push(
          `rules/${RULE_FILES[category]}[${index}]: rule category ${JSON.stringify(rule.category)} must match the file category "${category}"`
        );
      }
    });

    rules.push(...categoryRules);
  }

  for (const problem of validateRules(rules, { sources, runtimes })) {
    problems.push(problem);
  }

  const rulesByCategoryCounts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      rules.filter((rule) => isPlainObject(rule) && rule.category === category).length
    ])
  );

  for (const problem of validateManifestCounts(manifest, {
    sources: sources.length,
    runtimes: runtimes.length,
    rules: rules.length,
    rulesByCategory: rulesByCategoryCounts
  })) {
    problems.push(`manifest.json: ${problem}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid knowledge base at ${baseRoot}:\n${problems.map((entry) => `  - ${entry}`).join("\n")}`);
  }

  return deepFreeze({
    root: baseRoot,
    manifest,
    sources,
    runtimes,
    rules
  });
}
