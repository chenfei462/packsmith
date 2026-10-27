import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import {
  buildStaticCompatibility,
  importObservedBehavior,
  runMatrix,
  resolveMatrixExitCode,
  MatrixUsageError,
  MatrixValidationError
} from "../../src/trigger/matrix.mjs";
import { loadKnowledgeBase } from "../../src/knowledge/loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeBase = await loadKnowledgeBase();

const SUITE = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "review-security", prompt: "Review this PR", expect: "trigger" },
    { id: "explain-pr", prompt: "What is a PR?", expect: "no-trigger" }
  ]
};

async function makeSkill(t, name = "review-pr") {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-matrix-"));
  const skillDir = path.join(root, name);
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Reviews pull requests for security risks when the user asks.\n---\n\nBody.\n`,
    "utf8"
  );
  await writeFile(path.join(skillDir, "evals", "triggers.json"), JSON.stringify(SUITE, null, 2), "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, skillDir };
}

test("buildStaticCompatibility returns evidence-backed rows for all KB runtimes", () => {
  const rows = buildStaticCompatibility(knowledgeBase);

  assert.ok(rows.length >= 5, "at least 5 runtime records");
  const ids = rows.map((r) => r.runtime);
  assert.ok(ids.includes("codex"), "codex present");
  assert.ok(ids.includes("claude-code"), "claude-code present");

  for (const row of rows) {
    assert.ok(row.provenance.startsWith("knowledge-base/runtimes/"));
    // KB records must have evidence for provenance
    assert.ok(row.evidenceSource !== null, `${row.runtime} must have evidenceSource`);
    assert.ok(row.evidenceVerifiedOn !== null, `${row.runtime} must have evidenceVerifiedOn`);
    // staticCompatibility comes from v02Scope
    assert.equal(typeof row.staticCompatibility, "boolean", `${row.runtime} staticCompatibility`);
  }

  // Static-only runtimes (cursor/gemini-cli/opencode) have liveTriggerRunner: false or null
  const cursor = rows.find((r) => r.runtime === "cursor");
  assert.ok(cursor, "cursor present");
  assert.equal(cursor.liveTriggerRunner, false, "cursor must not claim live trigger");
});

test("importObservedBehavior recomputes metrics from raw observations", () => {
  const behavior = importObservedBehavior({
    reportJson: {
      schemaVersion: 1,
      skill: "review-pr",
      runs: 2,
      runtimeIds: ["codex"],
      observations: [
        { runtime: "codex", caseId: "review-security", repeat: 1, status: "triggered" },
        { runtime: "codex", caseId: "review-security", repeat: 2, status: "not_triggered" },
        { runtime: "codex", caseId: "explain-pr", repeat: 1, status: "not_triggered" },
        { runtime: "codex", caseId: "explain-pr", repeat: 2, status: "not_triggered" }
      ]
    },
    suite: SUITE,
    expectedSkill: "review-pr"
  });

  assert.equal(behavior.isImportedHistorical, true);
  assert.equal(behavior.observedRuntimes.includes("codex"), true);
  const cell = behavior.behavior.codex["review-security"];
  assert.equal(cell.observed, true);
  assert.equal(cell.activationRate, 0.5);
  assert.equal(cell.validRuns, 2);
  const tn = behavior.behavior.codex["explain-pr"];
  assert.equal(tn.activationRate, 0);
  assert.equal(tn.falsePositiveRate, 0);
});

test("importObservedBehavior rejects incomplete grids (missing rows)", () => {
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: {
          schemaVersion: 1,
          skill: "review-pr",
          runs: 1,
          runtimeIds: ["codex"],
          observations: [
            { runtime: "codex", caseId: "review-security", repeat: 1, status: "triggered" }
            // explain-pr is missing → incomplete grid
          ]
        },
        suite: SUITE,
        expectedSkill: "review-pr"
      }),
    (error) => error instanceof MatrixValidationError && /grid is incomplete/.test(error.message)
  );
});

test("importObservedBehavior rejects a mismatched skill", () => {
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: { schemaVersion: 1, skill: "other-skill", runs: 1, runtimeIds: ["codex"], observations: [] },
        suite: SUITE,
        expectedSkill: "review-pr"
      }),
    (error) => error instanceof MatrixValidationError && /does not match/.test(error.message)
  );
});

test("importObservedBehavior rejects unknown runtimes and statuses", () => {
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: {
          schemaVersion: 1,
          skill: "review-pr", runs: 1, runtimeIds: ["__proto__"],
          observations: [{ runtime: "__proto__", caseId: "review-security", repeat: 1, status: "triggered" }]
        },
        suite: SUITE, expectedSkill: "review-pr"
      }),
    MatrixValidationError
  );
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: {
          schemaVersion: 1,
          skill: "review-pr", runs: 1, runtimeIds: ["codex"],
          observations: [{ runtime: "codex", caseId: "review-security", repeat: 1, status: "fabricated" }]
        },
        suite: SUITE, expectedSkill: "review-pr"
      }),
    /not a valid trigger status/
  );
});

test("importObservedBehavior rejects duplicate observations and wrong caseIds", () => {
  const base = { schemaVersion: 1, skill: "review-pr", runs: 1, runtimeIds: ["codex"] };
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: {
          ...base,
          observations: [
            { runtime: "codex", caseId: "review-security", repeat: 1, status: "triggered" },
            { runtime: "codex", caseId: "review-security", repeat: 1, status: "not_triggered" }
          ]
        },
        suite: SUITE, expectedSkill: "review-pr"
      }),
    /duplicate observation/
  );
  assert.throws(
    () =>
      importObservedBehavior({
        reportJson: {
          ...base,
          observations: [{ runtime: "codex", caseId: "nonexistent-case", repeat: 1, status: "triggered" }]
        },
        suite: SUITE, expectedSkill: "review-pr"
      }),
    /does not exist in the current trigger suite/
  );
});

test("resolveMatrixExitCode: infra > validation > pass", () => {
  assert.equal(resolveMatrixExitCode({ observationErrors: 1 }), 2);
  assert.equal(resolveMatrixExitCode({ staticErrors: 1 }), 1);
  assert.equal(resolveMatrixExitCode({}), 0);
});

test("runMatrix returns static-only output without --results", async (t) => {
  const { skillDir } = await makeSkill(t);
  const report = await runMatrix({ targetPath: skillDir, knowledgeBase });

  assert.equal(report.skill, "review-pr");
  assert.ok(report.staticCompatibility.length > 0);
  assert.equal(report.observedBehavior, null, "no --results → no observed behavior section");
});

test("runMatrix with --results imports observed behavior", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const resultsPath = path.join(root, "m8-results.json");
  await writeFile(
    resultsPath,
    JSON.stringify({
      schemaVersion: 1, skill: "review-pr", runs: 1, runtimeIds: ["codex"],
      observations: [
        { runtime: "codex", caseId: "review-security", repeat: 1, status: "triggered" },
        { runtime: "codex", caseId: "explain-pr", repeat: 1, status: "not_triggered" }
      ]
    }),
    "utf8"
  );

  const report = await runMatrix({ targetPath: skillDir, knowledgeBase, resultsJson: resultsPath });
  assert.ok(report.observedBehavior, "observed behavior present");
  assert.equal(report.observedBehavior.isImportedHistorical, true);
  assert.equal(report.observedBehavior.behavior.codex["review-security"].activationRate, 1);
});

test("runMatrix rejects a nonexistent results file", async (t) => {
  const { skillDir } = await makeSkill(t);
  await assert.rejects(
    () => runMatrix({ targetPath: skillDir, knowledgeBase, resultsJson: "/nonexistent/results.json" }),
    (error) => error instanceof MatrixUsageError && /does not exist/.test(error.message)
  );
});

test("runMatrix rejects invalid YAML", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-matrix-bad-"));
  const skillDir = path.join(root, "review-pr");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\n{{invalid yaml\n---\n\nBody.\n", "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () => runMatrix({ targetPath: skillDir, knowledgeBase }),
    (error) => error instanceof MatrixValidationError && /structural errors/.test(error.message)
  );
});

// ---------------------------------------------------------------------------
// Round-3 I/O fault and JSON null regressions: EACCES/EIO on the suite file
// is infrastructure (exit 2), not "suite missing" (exit 1); a legal JSON
// null in the results file is a validation error (exit 1), not a TypeError.
// ---------------------------------------------------------------------------

test('suite readFile EACCES is infrastructure_error, not suite-missing validation', async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const suitePath = path.join(skillDir, //eslint-disable-line
'evals', 'triggers.json');
  const resultsPath = path.join(root, "results.json");
  const validObs = SUITE.cases.map((c) => ({
    runtime: "codex", caseId: c.id, repeat: 1, expect: c.expect,
    status: c.expect === "trigger" ? "triggered" : "not_triggered",
    runtimeVersion: "mock-1"
  }));
  await writeFile(resultsPath, JSON.stringify({ schemaVersion: 1, skill: "review-pr", runs: 1, runtimeIds: ["codex"], observations: validObs }), "utf8");

  // Patch fs.readFile on the same default-export object that matrix.mjs uses.
  const fsPromises = (await import("node:fs/promises")).default;
  const originalReadFile = fsPromises.readFile;
  let injectedCalls = 0;
  const suitePathNormalized = suitePath.replace(/\+/g, "/");
  fsPromises.readFile = async function patchedReadFile(...args) {
    const normalized = path.resolve(String(args[0])).replace(/\+/g, "/");
    if (normalized === suitePathNormalized || normalized === path.resolve(suitePath).replace(/\+/g, "/")) {
      injectedCalls += 1;
      const error = new Error("synthetic EACCES");
      error.code = "EACCES";
      throw error;
    }
    return originalReadFile(...args);
  };

  try {
    await assert.rejects(
      () => runMatrix({ targetPath: skillDir, knowledgeBase, resultsJson: resultsPath }),
      (error) => error.isInfrastructureError === true
    );
    assert.ok(injectedCalls > 0, "fault injection must have been triggered");
  } finally {
    fsPromises.readFile = originalReadFile;
  }
});
test("legal JSON null in results file is a validation error, not a TypeError", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const resultsPath = path.join(root, "null-results.json");
  await writeFile(resultsPath, "null", "utf8");

  await assert.rejects(
    () => runMatrix({ targetPath: skillDir, knowledgeBase, resultsJson: resultsPath }),
    (error) => error instanceof MatrixValidationError && /must contain a JSON object/.test(error.message)
  );
});

test("JSON array in results file is a validation error", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const resultsPath = path.join(root, "array-results.json");
  await writeFile(resultsPath, "[]", "utf8");

  await assert.rejects(
    () => runMatrix({ targetPath: skillDir, knowledgeBase, resultsJson: resultsPath }),
    (error) => error instanceof MatrixValidationError && /must contain a JSON object/.test(error.message)
  );
});
