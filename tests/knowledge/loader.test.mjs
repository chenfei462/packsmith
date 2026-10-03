import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { SEVERITIES } from "../../src/core/diagnostics.mjs";
import {
  DEFAULT_KNOWLEDGE_BASE_PATH,
  NORMATIVE_KEYWORDS,
  RULE_FILES,
  RUNTIME_IDS,
  findRuleById,
  loadKnowledgeBase,
  rulesByCategory,
  validateManifest,
  validateManifestCounts,
  validateRule,
  validateRules,
  validateRuntimeRecord,
  validateSource
} from "../../src/knowledge/loader.mjs";

/**
 * Offline knowledge-base tests (plan §9/§10/§11, v0.2 Milestone 3).
 *
 * No network, no credentials, no model calls. The only filesystem writes are
 * mkdtemp fixtures under os.tmpdir() (removed in t.after) for the negative
 * loader cases — the real ~/.packsmith and ~/.codex state is never touched.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

/** Every rule id the plan §11 checklist requires, per category. */
const PLAN_RULE_IDS = {
  spec: ["PS-SPEC-001", "PS-SPEC-002", "PS-SPEC-003", "PS-SPEC-004", "PS-SPEC-005", "PS-SPEC-006", "PS-SPEC-007", "PS-SPEC-008", "PS-SPEC-009", "PS-SPEC-010"],
  activation: ["PS-ACT-001", "PS-ACT-002", "PS-ACT-003"],
  context: ["PS-CTX-001", "PS-CTX-002"],
  compatibility: ["PS-COMP-001", "PS-COMP-002"],
  security: ["PS-SEC-001", "PS-SEC-002", "PS-SEC-003"]
};

const EXPECTED_JSON_FILES = new Set([
  "manifest.json",
  "sources/sources.json",
  ...RUNTIME_IDS.map((id) => `runtimes/${id}.json`),
  ...Object.keys(RULE_FILES).map((category) => `rules/${RULE_FILES[category]}`)
]);

// ---------------------------------------------------------------------------
// Fixture helpers for the negative loader cases (offline, temp-dir isolated).
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE = {
  id: "agent-skills-spec",
  title: "Agent Skills specification",
  sourceType: "spec",
  url: "https://agentskills.example.com/specification"
};

const FIXTURE_RUNTIME = {
  id: "agent-skills",
  name: "Agent Skills (open specification)",
  kind: "spec",
  evidence: [{ source: "agent-skills-spec", sourceType: "spec", normative: "MUST", verifiedOn: "2026-10-03" }]
};

function fixtureRule(overrides = {}) {
  return {
    id: "PS-SPEC-001",
    title: "SKILL.md missing",
    category: "spec",
    severity: "error",
    appliesTo: { runtimes: ["all"] },
    check: { type: "skill-file-exists" },
    message: "Every skill directory must contain a SKILL.md file at its root.",
    fix: { available: true, safe: true },
    evidence: [{ source: "agent-skills-spec", sourceType: "spec", normative: "MUST", verifiedOn: "2026-10-03" }],
    ...overrides
  };
}

function fixtureManifest(ruleCount) {
  return {
    schemaVersion: 1,
    name: "packsmith-knowledge-base",
    description: "Test fixture knowledge base.",
    version: "0.0.0",
    updatedAt: "2026-10-03",
    runtimes: ["agent-skills"],
    ruleFiles: ["spec"],
    counts: {
      sources: 1,
      runtimes: 1,
      rules: ruleCount,
      rulesByCategory: { spec: ruleCount, activation: 0, compatibility: 0, context: 0, security: 0 }
    }
  };
}

function defaultFixture() {
  return {
    manifest: fixtureManifest(1),
    sources: [structuredClone(FIXTURE_SOURCE)],
    runtimes: [structuredClone(FIXTURE_RUNTIME)],
    rules: { spec: [fixtureRule()] }
  };
}

async function writeFixtureKnowledgeBase(root, { manifest, sources, runtimes, rules }) {
  await mkdir(path.join(root, "sources"), { recursive: true });
  await mkdir(path.join(root, "runtimes"), { recursive: true });
  await mkdir(path.join(root, "rules"), { recursive: true });
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(path.join(root, "sources", "sources.json"), JSON.stringify(sources, null, 2), "utf8");

  for (const runtime of runtimes) {
    await writeFile(path.join(root, "runtimes", `${runtime.id}.json`), JSON.stringify(runtime, null, 2), "utf8");
  }

  for (const [category, categoryRules] of Object.entries(rules)) {
    await writeFile(path.join(root, "rules", `${category}.json`), JSON.stringify(categoryRules, null, 2), "utf8");
  }
}

async function makeTempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-kb-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
    } else if (entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("every JSON file under knowledge-base/ parses and the inventory matches plan §9", async () => {
  const kbRoot = path.join(repoRoot, "knowledge-base");
  const files = await listJsonFiles(kbRoot);

  assert.equal(files.length, EXPECTED_JSON_FILES.size);

  for (const file of files) {
    const relative = path.relative(kbRoot, file).split(path.sep).join("/");
    assert.ok(EXPECTED_JSON_FILES.has(relative), `unexpected knowledge-base file: ${relative}`);

    const parsed = JSON.parse(await readFile(file, "utf8"));
    assert.ok(parsed !== undefined, `${relative} parsed to undefined`);
  }
});

test("loadKnowledgeBase returns the complete frozen knowledge base, deterministically", async () => {
  const kb = await loadKnowledgeBase();

  assert.equal(kb.root, path.resolve(DEFAULT_KNOWLEDGE_BASE_PATH));
  assert.equal(kb.sources.length, 7);
  assert.deepEqual(kb.runtimes.map((runtime) => runtime.id), [...RUNTIME_IDS]);
  assert.equal(kb.rules.length, 20);

  // deeply frozen: nothing may mutate the knowledge base at runtime
  assert.ok(Object.isFrozen(kb));
  assert.ok(Object.isFrozen(kb.manifest));
  assert.ok(Object.isFrozen(kb.sources));
  assert.ok(Object.isFrozen(kb.sources[0]));
  assert.ok(Object.isFrozen(kb.runtimes));
  assert.ok(Object.isFrozen(kb.rules));
  assert.ok(Object.isFrozen(kb.rules[0]));
  assert.ok(Object.isFrozen(kb.rules[0].evidence));
  assert.ok(Object.isFrozen(kb.rules[0].fix));
  assert.throws(() => {
    kb.rules.push({});
  }, TypeError);
  assert.throws(() => {
    kb.rules[0].severity = "info";
  }, TypeError);

  // deterministic: a second load yields an equal snapshot
  const again = await loadKnowledgeBase();
  assert.deepEqual(again, kb);
});

test("all 20 plan §11 rules are present with exactly the planned ids", async () => {
  const kb = await loadKnowledgeBase();
  const actualByCategory = {};

  for (const rule of kb.rules) {
    (actualByCategory[rule.category] ??= []).push(rule.id);
  }

  for (const [category, expectedIds] of Object.entries(PLAN_RULE_IDS)) {
    assert.deepEqual(
      [...(actualByCategory[category] ?? [])].sort(),
      [...expectedIds].sort(),
      `category ${category} must contain exactly the plan §11 rules`
    );
  }

  const total = Object.values(PLAN_RULE_IDS).reduce((sum, ids) => sum + ids.length, 0);
  assert.equal(kb.rules.length, total);
  assert.equal(new Set(kb.rules.map((rule) => rule.id)).size, total, "rule ids must be unique");
});

test("every rule passes structural validation and carries traceable evidence verified on 2026-10-03", async () => {
  const kb = await loadKnowledgeBase();
  const sourceIds = new Set(kb.sources.map((source) => source.id));

  for (const rule of kb.rules) {
    assert.deepEqual(validateRule(rule, { sources: kb.sources, runtimes: kb.runtimes }), [], `rule ${rule.id} must validate cleanly`);
    assert.ok(rule.evidence.length >= 1, `rule ${rule.id} must cite at least one source`);

    for (const entry of rule.evidence) {
      assert.equal(entry.verifiedOn, "2026-10-03", `rule ${rule.id} evidence must be verified on 2026-10-03`);
      assert.ok(NORMATIVE_KEYWORDS.includes(entry.normative), `rule ${rule.id} normative keyword must be RFC 2119`);
      assert.ok(sourceIds.has(entry.source), `rule ${rule.id} evidence source must resolve in sources.json`);
    }
  }

  // runtime records carry the same provenance discipline
  for (const runtime of kb.runtimes) {
    assert.deepEqual(validateRuntimeRecord(runtime, { sources: kb.sources }), [], `runtime ${runtime.id} must validate cleanly`);

    for (const entry of runtime.evidence) {
      assert.equal(entry.verifiedOn, "2026-10-03", `runtime ${runtime.id} evidence must be verified on 2026-10-03`);
    }
  }
});

test("rule severities follow the documented gate policy: spec=error, quality heuristics=warning, COMP-001=info", async () => {
  const kb = await loadKnowledgeBase();
  const counts = { error: 0, warning: 0, info: 0 };

  for (const rule of kb.rules) {
    assert.ok(SEVERITIES.includes(rule.severity));
    counts[rule.severity] += 1;

    if (rule.category === "spec") {
      assert.equal(rule.severity, "error", `${rule.id}: hard spec violations gate as errors`);
    }

    if (["activation", "context", "security"].includes(rule.category)) {
      assert.equal(rule.severity, "warning", `${rule.id}: heuristic/review findings stay warnings`);
    }
  }

  assert.deepEqual(counts, { error: 10, warning: 9, info: 1 });
  assert.equal(findRuleById(kb.rules, "PS-COMP-001").severity, "info");
  assert.equal(findRuleById(kb.rules, "PS-COMP-002").severity, "warning");
});

test("manifest counts match the loaded content", async () => {
  const kb = await loadKnowledgeBase();
  const rulesByCategoryActual = Object.fromEntries(
    Object.keys(RULE_FILES).map((category) => [category, rulesByCategory(kb.rules, category).length])
  );

  assert.deepEqual(validateManifest(kb.manifest), []);
  assert.deepEqual(
    validateManifestCounts(kb.manifest, {
      sources: kb.sources.length,
      runtimes: kb.runtimes.length,
      rules: kb.rules.length,
      rulesByCategory: rulesByCategoryActual
    }),
    []
  );

  assert.equal(kb.manifest.schemaVersion, 1);
  assert.equal(kb.manifest.updatedAt, "2026-10-03");
  assert.equal(kb.manifest.counts.rules, 20);
  assert.deepEqual(kb.manifest.counts.rulesByCategory, { spec: 10, activation: 3, compatibility: 2, context: 2, security: 3 });
});

test("rules are accessible by id and by category", async () => {
  const kb = await loadKnowledgeBase();

  assert.equal(findRuleById(kb.rules, "PS-SPEC-007").title, "name/directory mismatch");
  assert.equal(findRuleById(kb.rules, "PS-SEC-003").category, "security");
  assert.equal(findRuleById(kb.rules, "PS-DOES-NOT-EXIST"), null);

  assert.deepEqual(
    Object.keys(RULE_FILES).map((category) => rulesByCategory(kb.rules, category).length),
    [10, 3, 2, 2, 3]
  );

  const security = rulesByCategory(kb.rules, "security");
  assert.ok(Object.isFrozen(security));
  assert.ok(security.every((rule) => rule.category === "security"));

  assert.throws(() => rulesByCategory(kb.rules, "style"), TypeError);
  assert.throws(() => rulesByCategory(kb.rules, null), TypeError);
  assert.throws(() => findRuleById("not-an-array", "PS-SPEC-001"), TypeError);
});

test("pure validators reject malformed rules with precise problems", () => {
  const context = { sources: [structuredClone(FIXTURE_SOURCE)], runtimes: [structuredClone(FIXTURE_RUNTIME)] };

  const cases = [
    [null, /rule must be a JSON object/],
    [{}, /must have exactly the fields/],
    [fixtureRule({ id: "XX-SPEC-001" }), /id must match the pattern/],
    [fixtureRule({ id: "PS-ACT-001" }), /id must use the PS-SPEC-NNN prefix/],
    [fixtureRule({ category: "style" }), /category must be one of/],
    [fixtureRule({ severity: "fatal" }), /severity must be one of/],
    [fixtureRule({ title: "  " }), /title must be a non-empty string/],
    [fixtureRule({ message: "" }), /message must be a non-empty string/],
    [fixtureRule({ appliesTo: {} }), /appliesTo\.runtimes must be a non-empty array/],
    [fixtureRule({ appliesTo: { runtimes: ["not-a-runtime"] } }), /is not a known runtime id/],
    [fixtureRule({ check: "skill-file-exists" }), /check must be an object/],
    [fixtureRule({ check: {} }), /check\.type must be a non-empty string/],
    [fixtureRule({ fix: { available: true } }), /fix must have exactly the boolean fields/],
    [fixtureRule({ evidence: [] }), /evidence must be a non-empty array/],
    [
      fixtureRule({ evidence: [{ source: "ghost-source", sourceType: "spec", normative: "MUST", verifiedOn: "2026-10-03" }] }),
      /is not declared in sources\/sources\.json/
    ],
    [
      fixtureRule({ evidence: [{ source: "agent-skills-spec", sourceType: "docs", normative: "MUST", verifiedOn: "2026-10-03" }] }),
      /sourceType "docs" does not match the type declared for source "agent-skills-spec"/
    ],
    [
      fixtureRule({ evidence: [{ source: "agent-skills-spec", sourceType: "spec", normative: "PROBABLY", verifiedOn: "2026-10-03" }] }),
      /normative must be one of/
    ],
    [
      fixtureRule({ evidence: [{ source: "agent-skills-spec", sourceType: "spec", normative: "MUST", verifiedOn: "2026-2-30" }] }),
      /verifiedOn must be a valid ISO date/
    ],
    [
      fixtureRule({ evidence: [{ source: "agent-skills-spec", sourceType: "spec", normative: "MUST", verifiedOn: "2026-02-30" }] }),
      /verifiedOn must be a valid ISO date/
    ],
    [fixtureRule({ extra: true }), /must have exactly the fields/]
  ];

  for (const [rule, pattern] of cases) {
    const problems = validateRule(rule, context);
    assert.ok(problems.length >= 1, `expected problems for ${JSON.stringify(rule?.id ?? rule)}`);
    assert.match(problems.join("\n"), pattern);
  }
});

test("validateRules detects duplicate ids across the whole knowledge base", () => {
  const context = { sources: [structuredClone(FIXTURE_SOURCE)], runtimes: [structuredClone(FIXTURE_RUNTIME)] };

  assert.deepEqual(validateRules([fixtureRule(), fixtureRule({ id: "PS-SPEC-002" })], context), []);

  const problems = validateRules([fixtureRule(), fixtureRule()], context);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate rule id "PS-SPEC-001"/);

  assert.deepEqual(validateRules("not-an-array"), ["rules must be an array"]);
});

test("pure validators reject malformed sources, runtimes, and manifests", () => {
  assert.match(
    validateSource({ ...FIXTURE_SOURCE, id: "" }).join("\n"),
    /source id must be a non-empty string/
  );
  assert.match(
    validateSource({ ...FIXTURE_SOURCE, url: "http://insecure.example.com" }).join("\n"),
    /source url must be an https:\/\/ URL/
  );
  assert.match(
    validateSource({ ...FIXTURE_SOURCE, sourceType: "blog" }).join("\n"),
    /sourceType must be one of spec\|docs/
  );
  assert.match(validateSource({ ...FIXTURE_SOURCE, sneaky: true }).join("\n"), /unknown field "sneaky"/);

  assert.match(
    validateRuntimeRecord({ ...FIXTURE_RUNTIME, kind: "database" }, { sources: [FIXTURE_SOURCE] }).join("\n"),
    /runtime kind must be one of spec\|runtime/
  );
  assert.match(
    validateRuntimeRecord({ ...FIXTURE_RUNTIME, evidence: [] }, { sources: [FIXTURE_SOURCE] }).join("\n"),
    /evidence must be a non-empty array/
  );

  const manifest = fixtureManifest(1);
  assert.deepEqual(validateManifest(manifest), []);
  assert.match(validateManifest({ ...manifest, schemaVersion: 2 }).join("\n"), /schemaVersion must be 1/);
  assert.match(validateManifest({ ...manifest, updatedAt: "October 3rd" }).join("\n"), /updatedAt must be a valid ISO date/);
  assert.match(validateManifest({ ...manifest, ruleFiles: ["spec", "spec"] }).join("\n"), /more than once/);
  assert.match(validateManifest({ ...manifest, ruleFiles: ["hundreds-of-rules"] }).join("\n"), /is not a diagnostic category/);

  const loaded = { sources: 1, runtimes: 1, rules: 1, rulesByCategory: { spec: 1, activation: 0, compatibility: 0, context: 0, security: 0 } };
  assert.deepEqual(validateManifestCounts(manifest, loaded), []);

  const drifted = {
    sources: 1,
    runtimes: 1,
    rules: 2,
    rulesByCategory: { spec: 2, activation: 0, compatibility: 0, context: 0, security: 0 }
  };
  const driftProblems = validateManifestCounts(manifest, drifted);
  assert.equal(driftProblems.length, 2);
  assert.match(driftProblems.join("\n"), /counts\.rules is 1 but the knowledge base contains 2/);
  assert.match(driftProblems.join("\n"), /counts\.rulesByCategory\.spec is 1 but the knowledge base contains 2/);
});

test("loadKnowledgeBase throws one aggregated error on invalid content, and loads a clean minimal fixture", async (t) => {
  const root = await makeTempRoot(t);
  const fixture = defaultFixture();
  await writeFixtureKnowledgeBase(root, fixture);

  // control: the minimal fixture itself is a valid knowledge base
  const kb = await loadKnowledgeBase({ root });
  assert.equal(kb.rules.length, 1);
  assert.equal(kb.runtimes.length, 1);
  assert.equal(kb.sources.length, 1);

  // broken rule: empty title — loadKnowledgeBase is async, so promise
  // rejections are asserted with assert.rejects, never assert.throws
  const brokenTitle = defaultFixture();
  brokenTitle.rules.spec[0].title = "";
  const titleRoot = await makeTempRoot(t);
  await writeFixtureKnowledgeBase(titleRoot, brokenTitle);
  await assert.rejects(() => loadKnowledgeBase({ root: titleRoot }), /rules\[0\]: rule "PS-SPEC-001" title must be a non-empty string/);

  // duplicate rule ids across the pack
  const duplicated = defaultFixture();
  duplicated.manifest.counts.rules = 2;
  duplicated.manifest.counts.rulesByCategory.spec = 2;
  duplicated.rules.spec = [fixtureRule(), fixtureRule()];
  const duplicateRoot = await makeTempRoot(t);
  await writeFixtureKnowledgeBase(duplicateRoot, duplicated);
  await assert.rejects(() => loadKnowledgeBase({ root: duplicateRoot }), /duplicate rule id "PS-SPEC-001"/);

  // manifest lists a runtime whose file does not exist
  const missingRuntime = defaultFixture();
  missingRuntime.manifest.runtimes = ["agent-skills", "codex"];
  missingRuntime.manifest.counts.runtimes = 2;
  const missingRoot = await makeTempRoot(t);
  await writeFixtureKnowledgeBase(missingRoot, missingRuntime);
  await assert.rejects(
    () => loadKnowledgeBase({ root: missingRoot }),
    /Knowledge base file cannot be read:[\s\S]*codex\.json/
  );

  // evidence source not declared in sources.json
  const unknownSource = defaultFixture();
  unknownSource.rules.spec[0].evidence = [{ source: "ghost", sourceType: "spec", normative: "MUST", verifiedOn: "2026-10-03" }];
  const unknownRoot = await makeTempRoot(t);
  await writeFixtureKnowledgeBase(unknownRoot, unknownSource);
  await assert.rejects(
    () => loadKnowledgeBase({ root: unknownRoot }),
    /evidence source "ghost" is not declared in sources\/sources\.json/
  );

  // manifest counts drifted from content
  const drifted = defaultFixture();
  drifted.manifest.counts.rules = 5;
  const driftedRoot = await makeTempRoot(t);
  await writeFixtureKnowledgeBase(driftedRoot, drifted);
  await assert.rejects(
    () => loadKnowledgeBase({ root: driftedRoot }),
    /manifest counts\.rules is 5 but the knowledge base contains 1/
  );
});
