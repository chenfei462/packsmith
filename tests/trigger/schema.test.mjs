import test from "node:test";
import assert from "node:assert/strict";

import {
  TRIGGER_SUITE_SCHEMA_VERSION,
  TRIGGER_EXPECTATIONS,
  validateTriggerSuite,
  parseTriggerSuiteJson,
  createStarterSuite
} from "../../src/trigger/schema.mjs";

/**
 * Offline trigger-suite schema tests (v0.2 Milestone 5, plan §13).
 *
 * The suite contract: schemaVersion 1, skill, and a non-empty cases array
 * where every case carries exactly { id, prompt, expect } with
 * expect ∈ { trigger, no-trigger }. Validation is strict and deterministic;
 * prompts are free-form UTF-8 (CJK included). Pure — no filesystem, no
 * network, no model calls.
 */

const VALID_SUITE = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "review-security", prompt: "Review this pull request for security vulnerabilities.", expect: "trigger" },
    { id: "review-cn", prompt: "帮我看看这个 PR 有没有安全问题", expect: "trigger" },
    { id: "explain-pr", prompt: "Explain what a pull request is.", expect: "no-trigger" }
  ]
};

test("a valid suite passes with no problems", () => {
  assert.deepEqual(validateTriggerSuite(VALID_SUITE), []);
  assert.equal(TRIGGER_SUITE_SCHEMA_VERSION, 1);
  assert.deepEqual([...TRIGGER_EXPECTATIONS].sort(), ["no-trigger", "trigger"]);
});

test("non-object and null suites are rejected", () => {
  assert.ok(validateTriggerSuite(null).length > 0);
  assert.ok(validateTriggerSuite("nope").length > 0);
  assert.ok(validateTriggerSuite([]).length > 0);
});

test("schemaVersion must be exactly 1", () => {
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, schemaVersion: 2 }).length > 0);
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, schemaVersion: "1" }).length > 0);
  const problems = validateTriggerSuite({ ...VALID_SUITE, schemaVersion: undefined });
  assert.ok(problems.some((problem) => /schemaVersion/.test(problem)));
});

test("skill must be a non-empty string", () => {
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, skill: "" }).length > 0);
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, skill: 42 }).length > 0);
});

test("cases must be a non-empty array (empty suites are invalid)", () => {
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, cases: [] }).length > 0);
  assert.ok(validateTriggerSuite({ ...VALID_SUITE, cases: "nope" }).length > 0);
});

test("case ids must be unique", () => {
  const suite = {
    ...VALID_SUITE,
    cases: [
      { id: "dup", prompt: "one", expect: "trigger" },
      { id: "dup", prompt: "two", expect: "no-trigger" }
    ]
  };
  const problems = validateTriggerSuite(suite);
  assert.ok(problems.some((problem) => /dup/.test(problem) && /unique|duplicate/i.test(problem)));
});

test("case ids follow the kebab-case grammar", () => {
  const problems = validateTriggerSuite({
    ...VALID_SUITE,
    cases: [{ id: "Bad Id!", prompt: "x", expect: "trigger" }]
  });
  assert.ok(problems.length > 0);
});

test("case fields are exactly id, prompt, expect", () => {
  const problems = validateTriggerSuite({
    ...VALID_SUITE,
    cases: [{ id: "extra", prompt: "x", expect: "trigger", runtime: "codex" }]
  });
  assert.ok(problems.some((problem) => /runtime|unknown|exactly/i.test(problem)));
});

test("expect must be trigger or no-trigger", () => {
  const problems = validateTriggerSuite({
    ...VALID_SUITE,
    cases: [{ id: "bad-expect", prompt: "x", expect: "sometimes" }]
  });
  assert.ok(problems.some((problem) => /expect/.test(problem)));
});

test("prompts must be non-empty strings", () => {
  const problems = validateTriggerSuite({
    ...VALID_SUITE,
    cases: [{ id: "empty-prompt", prompt: "   ", expect: "trigger" }]
  });
  assert.ok(problems.length > 0);
});

test("CJK and emoji prompts are valid UTF-8 content", () => {
  assert.deepEqual(
    validateTriggerSuite({
      ...VALID_SUITE,
      cases: [
        { id: "cjk", prompt: "帮我审查这个 PR 的安全问题，越详细越好 🔍", expect: "trigger" },
        { id: "cjk-no", prompt: "写一首关于春天的诗", expect: "no-trigger" }
      ]
    }),
    []
  );
});

test("skill mismatch against the target skill directory is reported", () => {
  const problems = validateTriggerSuite(VALID_SUITE, { expectedSkill: "other-skill" });
  assert.ok(problems.some((problem) => /skill/.test(problem)));
  assert.deepEqual(validateTriggerSuite(VALID_SUITE, { expectedSkill: "review-pr" }), []);
});

test("parseTriggerSuiteJson captures JSON syntax errors as problems", () => {
  const parsed = parseTriggerSuiteJson("{ not json ]");
  assert.equal(parsed.ok, false);
  assert.ok(parsed.problems.length > 0);

  const good = parseTriggerSuiteJson(JSON.stringify(VALID_SUITE), { expectedSkill: "review-pr" });
  assert.equal(good.ok, true);
  assert.equal(good.suite.skill, "review-pr");
});

test("createStarterSuite yields a valid template for the skill", () => {
  const suite = createStarterSuite("review-pr");

  assert.deepEqual(validateTriggerSuite(suite, { expectedSkill: "review-pr" }), []);
  assert.equal(suite.skill, "review-pr");
  assert.equal(suite.cases.length, 4);
  // The template exercises both expectations and both script directions,
  // so the author starts from working UTF-8 content in either language.
  assert.equal(suite.cases.filter((entry) => entry.expect === "trigger").length, 2);
  assert.equal(suite.cases.filter((entry) => entry.expect === "no-trigger").length, 2);
  assert.ok(suite.cases.some((entry) => /[\u4e00-\u9fff]/.test(entry.prompt)));
  // Placeholders must be edited, and say so.
  assert.ok(suite.cases.every((entry) => /TODO/.test(entry.prompt)));
});
