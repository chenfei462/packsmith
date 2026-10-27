/**
 * Trigger suite schema (v0.2 Milestone 5, plan §13).
 *
 * A trigger suite declares when a Skill SHOULD and should NOT activate:
 *
 * {
 *   "schemaVersion": 1,
 *   "skill": "review-pr",
 *   "cases": [
 *     { "id": "review-security", "prompt": "…", "expect": "trigger" },
 *     { "id": "explain-pr",      "prompt": "…", "expect": "no-trigger" }
 *   ]
 * }
 *
 * This module is the strict, deterministic contract for that file — the
 * source `trigger init` writes from and the runner (Milestone 8) will
 * validate against. Pure: no filesystem, no network, no model calls.
 * Problems are plain strings so CLI and library callers can report them
 * verbatim.
 */

/** Suite schema version (plan §13). Bumped only by a deliberate contract change. */
export const TRIGGER_SUITE_SCHEMA_VERSION = 1;

/** The only allowed case expectations (plan §13). */
export const TRIGGER_EXPECTATIONS = Object.freeze(["trigger", "no-trigger"]);

/** Case ids use the same grammar as skill names (kebab-case). */
const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate one trigger suite (plan §13 shape). Pure. Returns an array of
 * problem strings — empty means valid. `options.expectedSkill` (when given)
 * additionally requires `suite.skill` to name that skill, which is how the
 * runner will detect a suite copied or renamed out of its skill directory.
 */
export function validateTriggerSuite(data, { expectedSkill = null } = {}) {
  const problems = [];

  if (!isPlainObject(data)) {
    problems.push("trigger suite must be a JSON object");
    return problems;
  }

  if (data.schemaVersion !== TRIGGER_SUITE_SCHEMA_VERSION) {
    problems.push(
      `trigger suite schemaVersion must be ${TRIGGER_SUITE_SCHEMA_VERSION}, got ${JSON.stringify(data.schemaVersion)}`
    );
  }

  if (!isNonEmptyString(data.skill)) {
    problems.push("trigger suite skill must be a non-empty string");
  }

  if (!Array.isArray(data.cases) || data.cases.length === 0) {
    problems.push("trigger suite cases must be a non-empty array");
    return problems;
  }

  const seenIds = new Map();

  data.cases.forEach((entry, index) => {
    const label = `cases[${index}]`;

    if (!isPlainObject(entry)) {
      problems.push(`${label} must be a JSON object`);
      return;
    }

    const keys = Object.keys(entry).sort();
    const expectedKeys = ["expect", "id", "prompt"];

    if (keys.join("\u0000") !== expectedKeys.join("\u0000")) {
      problems.push(`${label} must have exactly the fields id, prompt, expect (got ${keys.join(", ") || "none"})`);
    }

    if (!isNonEmptyString(entry.id)) {
      problems.push(`${label}.id must be a non-empty string`);
    } else if (!CASE_ID_PATTERN.test(entry.id)) {
      problems.push(
        `${label}.id ${JSON.stringify(entry.id)} must match the kebab-case grammar (lowercase letters, digits, hyphens)`
      );
    } else if (seenIds.has(entry.id)) {
      problems.push(`${label}.id "${entry.id}" is a duplicate of cases[${seenIds.get(entry.id)}] — case ids must be unique`);
    } else {
      seenIds.set(entry.id, index);
    }

    if (!isNonEmptyString(entry.prompt)) {
      problems.push(`${label}.prompt must be a non-empty string`);
    }

    if (!TRIGGER_EXPECTATIONS.includes(entry.expect)) {
      problems.push(
        `${label}.expect must be one of ${TRIGGER_EXPECTATIONS.join("|")}, got ${JSON.stringify(entry.expect)}`
      );
    }
  });

  if (expectedSkill !== null && isNonEmptyString(data.skill) && data.skill !== expectedSkill) {
    problems.push(`trigger suite skill "${data.skill}" does not match the target skill "${expectedSkill}"`);
  }

  return problems;
}

/**
 * Parse and validate raw JSON text. Pure. Returns exactly one of
 * `{ ok: true, suite }` or `{ ok: false, problems }`.
 */
export function parseTriggerSuiteJson(text, options = {}) {
  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`trigger suite is not valid JSON: ${error.message}`] };
  }

  const problems = validateTriggerSuite(data, options);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, suite: data };
}

/**
 * Deterministic starter suite for `trigger init`: four editable placeholder
 * cases covering both expectations in English and Chinese, so the author
 * begins from valid UTF-8 content in either language. The TODO markers make
 * it impossible to mistake the placeholders for real evaluation prompts.
 */
export function createStarterSuite(skillName) {
  return {
    schemaVersion: TRIGGER_SUITE_SCHEMA_VERSION,
    skill: skillName,
    cases: [
      {
        id: "example-trigger",
        prompt: `TODO: describe a task that should activate the ${skillName} skill.`,
        expect: "trigger"
      },
      {
        id: "example-trigger-locale",
        prompt: `TODO: 用中文描述一个应当激活 ${skillName} 技能的任务。`,
        expect: "trigger"
      },
      {
        id: "example-no-trigger",
        prompt: `TODO: describe a related task that should NOT activate the ${skillName} skill.`,
        expect: "no-trigger"
      },
      {
        id: "example-no-trigger-locale",
        prompt: `TODO: 用中文描述一个不应当激活 ${skillName} 技能的任务。`,
        expect: "no-trigger"
      }
    ]
  };
}
