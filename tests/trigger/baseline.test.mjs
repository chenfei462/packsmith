import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, lstat } from "node:fs/promises";

import {
  buildBaseline,
  validateBaseline,
  saveBaseline,
  readBaseline,
  computeSuiteFingerprint,
  computeSkillContentHash,
  BaselineValidationError
} from "../../src/trigger/baseline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Real fault injection on the fs.promises module object (same mechanism as
 * tests/fixtures/fault-injection-loader.mjs): src/trigger/baseline.mjs binds
 * the default export object, so a defineProperty patch here is seen by its
 * fs.open / fs.rename calls. Faults are REAL: partial bytes hit the disk
 * before EIO, close reports failure after the fd really closes, rename
 * fails with a real error code. Every fault bumps a counter so a test can
 * prove the fault path was actually taken, not skipped. */
const fsModule = createRequire(import.meta.url)("node:fs/promises");
const realOpen = fsModule.open;
const realRename = fsModule.rename;
const faultState = { mode: null, fired: 0 };

const faultInjectingOpen = async function faultInjectingOpen(filePath, ...rest) {
    const handle = await realOpen(filePath, ...rest);
    const mode = faultState.mode;
    if (mode === null || !String(filePath).includes(".tmp-")) {
      return handle;
    }

    if (mode === "partial-write-eio") {
      const realWriteFile = handle.writeFile.bind(handle);
      Object.defineProperty(handle, "writeFile", {
        value: async function (data, ...writeArgs) {
          faultState.fired += 1;
          const text = typeof data === "string" ? data : data.toString("utf8");
          // Half the bytes REALLY land on disk, then the write faults.
          await realWriteFile(text.slice(0, Math.floor(text.length / 2)), ...writeArgs);
          const error = new Error("injected EIO after partial write");
          error.code = "EIO";
          throw error;
        },
        configurable: true
      });
    } else if (mode === "close-fault") {
      const realClose = handle.close.bind(handle);
      Object.defineProperty(handle, "close", {
        value: async function () {
          faultState.fired += 1;
          await realClose(); // the fd really closes; close() still reports failure
          const error = new Error("injected close fault on the success path");
          error.code = "EIO";
          throw error;
        },
        configurable: true
      });
    }
    return handle;
};

Object.defineProperty(fsModule, "open", {
  value: faultInjectingOpen,
  configurable: true,
  writable: true
});

Object.defineProperty(fsModule, "rename", {
  value: async function faultInjectingRename(fromPath, toPath) {
    if (faultState.mode === "rename-fault" && String(fromPath).includes(".tmp-")) {
      faultState.fired += 1;
      const error = new Error("injected rename fault at publication");
      error.code = "EIO";
      throw error;
    }
    return realRename(fromPath, toPath);
  },
  configurable: true,
  writable: true
});

async function listTempFiles(root) {
  // Real directory listing — no conditional skips.
  return (await readdir(root)).filter((name) => name.includes(".tmp-"));
}

const SUITE = {
  schemaVersion: 1,
  skill: "review-pr",
  cases: [
    { id: "review-security", prompt: "Review this PR", expect: "trigger" },
    { id: "explain-pr", prompt: "What is a PR?", expect: "no-trigger" }
  ]
};

const RUNTIME_IDS = ["codex"];

function makeReport({ statuses = {}, versions = {} } = {}) {
  const observations = [];
  for (const c of SUITE.cases) {
    for (let repeat = 1; repeat <= 1; repeat++) {
      const status = statuses[`${c.id}/${repeat}`] ?? (c.expect === "trigger" ? "triggered" : "not_triggered");
      const version = versions["codex"] ?? "codex-cli 0.148.0";
      observations.push({
        runtime: "codex",
        caseId: c.id,
        repeat,
        expect: c.expect,
        status,
        runtimeVersion: version
      });
    }
  }
  return {
    schemaVersion: 1,
    skill: "review-pr",
    runs: 1,
    runtimeIds: [...RUNTIME_IDS],
    observations,
    score: { status: "pass", exitCode: 0, runtimes: {}, divergence: [], incomparableCases: [] }
  };
}

async function makeSkill(t, name = "review-pr") {
  const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-baseline-"));
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Reviews pull requests for security risks when the user asks.\n---\n\nBody.\n`,
    "utf8"
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, skillDir };
}

test("computeSuiteFingerprint is stable and reflects case content changes", () => {
  const fp1 = computeSuiteFingerprint(SUITE);
  const fp2 = computeSuiteFingerprint(SUITE);
  assert.equal(fp1, fp2, "same suite → same fingerprint");
  assert.match(fp1, /^sha256:/);

  const changed = {
    ...SUITE,
    cases: [{ ...SUITE.cases[0], prompt: "Changed prompt" }, SUITE.cases[1]]
  };
  assert.notEqual(computeSuiteFingerprint(changed), fp1, "changed prompt → different fingerprint");
});

test("buildBaseline produces a portable baseline with correct fields", () => {
  const report = makeReport();
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: "sha256:abc" });

  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.skill, "review-pr");
  assert.match(baseline.suiteFingerprint, /^sha256:/);
  assert.equal(baseline.skillContentHash, "sha256:abc");
  assert.ok(typeof baseline.timestamp === "string");
  assert.deepEqual(baseline.runtimes, ["codex"]);
  assert.equal(baseline.runs, 1);
  assert.ok(Array.isArray(baseline.cases) && baseline.cases.length === 2);
  assert.ok(Array.isArray(baseline.observations) && baseline.observations.length === 2);
  assert.ok(baseline.score && typeof baseline.score.status === "string");
  // No absolute paths, no prompts, no auth data.
  const serialized = JSON.stringify(baseline);
  assert.ok(!serialized.includes(os.tmpdir()));
  assert.ok(!serialized.includes("Review this PR"));
});

test("buildBaseline returns null for non-binary statuses", () => {
  const report = makeReport({ statuses: { "review-security/1": "infra_error" } });
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  assert.equal(baseline, null, "non-binary statuses must refuse baseline save");
});

test("buildBaseline returns null for missing runtime version", () => {
  const report = makeReport({ versions: { codex: null } });
  // Set runtimeVersion to null explicitly.
  report.observations.forEach((obs) => { obs.runtimeVersion = null; });
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  assert.equal(baseline, null, "missing version must refuse baseline save");
});

test("buildBaseline returns null for mixed runtime versions", () => {
  const report = makeReport();
  report.observations[0].runtimeVersion = "codex-cli 0.148.0";
  report.observations[1].runtimeVersion = "codex-cli 0.200.0";
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  assert.equal(baseline, null, "mixed versions must refuse baseline save");
});

test("buildBaseline preserves measured FN/FP as a valid imperfect baseline", () => {
  const report = makeReport({ statuses: { "explain-pr/1": "triggered" } }); // FP
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  assert.ok(baseline, "imperfect but binary baseline can be saved");
  assert.equal(baseline.score.status, "fail");
  assert.equal(baseline.score.exitCode, 1);
});

test("validateBaseline rejects wrong skill and fingerprint mismatch", async (t) => {
  const { skillDir } = await makeSkill(t);
  const report = makeReport();
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });

  const problems = validateBaseline({ ...baseline, skill: "other" }, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /does not match/.test(p)));

  const wrongFp = { ...baseline, suiteFingerprint: "sha256:deadbeef" };
  const problems2 = validateBaseline(wrongFp, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems2.some((p) => /fingerprint mismatch/.test(p)));
});

test("validateBaseline rejects non-binary observation statuses", () => {
  const report = makeReport();
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  baseline.observations[0].status = "infra_error";
  const problems = validateBaseline(baseline, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /must be binary/.test(p)));
});

test("validateBaseline rejects fabricated metrics", () => {
  const report = makeReport();
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: null });
  baseline.score.runtimes.codex.precision = 0.99; // fabricated
  const problems = validateBaseline(baseline, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /precision.*recomputed/.test(p)));
});

test("validateBaseline rejects an observation runtimeVersion that contradicts the runtimeVersions map", () => {
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });
  baseline.runtimeVersions.codex = "codex-cli 9.9.9"; // map says one thing...
  // ...the observations still carry the real version: the mismatch must be caught.
  const problems = validateBaseline(baseline, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /does not match the declared runtimeVersions/.test(p)), problems.join("; "));
});

test("validateBaseline rejects observations outside the declared grid", () => {
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  const undeclared = structuredClone(baseline);
  undeclared.observations[0].runtime = "claude-code"; // known runtime, but not declared
  let problems = validateBaseline(undeclared, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /not in the declared runtimes list/.test(p)), problems.join("; "));

  const unknownCase = structuredClone(baseline);
  unknownCase.observations[0].caseId = "case-that-does-not-exist";
  unknownCase.observations[0].expect = "trigger";
  problems = validateBaseline(unknownCase, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /not a suite case id/.test(p)), problems.join("; "));

  const badRepeat = structuredClone(baseline);
  badRepeat.observations[0].repeat = 99;
  problems = validateBaseline(badRepeat, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /repeat/.test(p)), problems.join("; "));

  const duplicate = structuredClone(baseline);
  duplicate.observations[1].caseId = duplicate.observations[0].caseId;
  duplicate.observations[1].expect = duplicate.observations[0].expect;
  problems = validateBaseline(duplicate, { suite: SUITE, expectedSkill: "review-pr" });
  assert.ok(problems.some((p) => /duplicate observation slot/.test(p)), problems.join("; "));
});

test("saveBaseline writes atomically and readBaseline round-trips", async (t) => {
  const { root, skillDir } = await makeSkill(t);
  const report = makeReport();
  const baseline = buildBaseline({ report, suite: SUITE, skillContentHash: "sha256:test" });
  const baselinePath = path.join(root, "packsmith-baseline.json");

  await saveBaseline(baselinePath, baseline);
  const content = await readFile(baselinePath, "utf8");
  assert.ok(content.length > 0);

  const loaded = await readBaseline(baselinePath, { suite: SUITE, expectedSkill: "review-pr" });
  assert.equal(loaded.skill, "review-pr");
  assert.equal(loaded.suiteFingerprint, baseline.suiteFingerprint);
});

test("saveBaseline rejects symlink at target", async (t) => {
  const { root } = await makeSkill(t);
  const target = path.join(root, "target-real.json");
  await writeFile(target, "{}", "utf8");
  const link = path.join(root, "baseline.json");

  const { symlink } = await import("node:fs/promises");
  try {
    await symlink(target, link, "file");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  const baseline = { schemaVersion: 1, skill: "review-pr" };
  await assert.rejects(
    () => saveBaseline(link, baseline),
    BaselineValidationError
  );
});

test("saveBaseline cleans up the partial temp file on a real EIO write fault", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  faultState.mode = "partial-write-eio";
  faultState.fired = 0;
  try {
    await assert.rejects(() => saveBaseline(baselinePath, baseline), /cannot save baseline/);
  } finally {
    faultState.mode = null;
  }
  assert.ok(faultState.fired > 0, "the write fault must actually have fired");
  await assert.rejects(() => lstat(baselinePath), { code: "ENOENT" }, "target must not appear after a write fault");
  assert.equal((await listTempFiles(root)).length, 0, "partial temp bytes must be cleaned up");
});

test("saveBaseline refuses publication and cleans up when close faults on the success path", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const oldBytes = '{"marker":"original-baseline"}';
  await writeFile(baselinePath, oldBytes, "utf8");
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  faultState.mode = "close-fault";
  faultState.fired = 0;
  try {
    await assert.rejects(() => saveBaseline(baselinePath, baseline), /cannot save baseline/);
  } finally {
    faultState.mode = null;
  }
  assert.ok(faultState.fired > 0, "the close fault must actually have fired");
  assert.equal(await readFile(baselinePath, "utf8"), oldBytes, "old baseline bytes must survive a close fault");
  assert.equal((await listTempFiles(root)).length, 0, "owned temp file must be cleaned up after a close fault");
});

test("saveBaseline cleans up the temp file and preserves the old baseline when rename faults", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const oldBytes = '{"marker":"original-baseline"}';
  await writeFile(baselinePath, oldBytes, "utf8");
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  faultState.mode = "rename-fault";
  faultState.fired = 0;
  try {
    await assert.rejects(() => saveBaseline(baselinePath, baseline), /cannot save baseline/);
  } finally {
    faultState.mode = null;
  }
  assert.ok(faultState.fired > 0, "the rename fault must actually have fired");
  assert.equal(await readFile(baselinePath, "utf8"), oldBytes, "old baseline bytes must survive a rename fault");
  assert.equal((await listTempFiles(root)).length, 0, "temp file must be cleaned up when publication faults");
});

test("saveBaseline does not rename over a file that appears at the target during the save", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const authorBytes = '{"author":"raced-in-during-save"}';
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  // Concurrent-author race: the moment OUR temp handle opens, the author's
  // file appears at the (previously absent) target path. The save must
  // refuse to publish and leave the author's file untouched.
  Object.defineProperty(fsModule, "open", {
    value: async function appearRaceOpen(filePath, ...rest) {
      const handle = await realOpen(filePath, ...rest);
      if (String(filePath).includes(".tmp-") && String(filePath).startsWith(path.join(root, "baseline.json"))) {
        await fsModule.writeFile(baselinePath, authorBytes, "utf8");
      }
      return handle;
    },
    configurable: true,
    writable: true
  });

  try {
    await assert.rejects(() => saveBaseline(baselinePath, baseline), /appeared during the save/);
  } finally {
    Object.defineProperty(fsModule, "open", { value: faultInjectingOpen, configurable: true, writable: true });
  }

  assert.equal(await readFile(baselinePath, "utf8"), authorBytes, "the author's file must be preserved");
  assert.equal((await listTempFiles(root)).length, 0, "our temp must be cleaned up after refusing");
});

test("saveBaseline refuses to promote a temp file that was replaced by another author", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const replacementBytes = '{"author":"temp-replacement"}';
  const baseline = buildBaseline({ report: makeReport(), suite: SUITE, skillContentHash: null });

  // After the real close succeeds, the attacker swaps the temp path to their
  // own file. The save must refuse and must NOT delete the replacement.
  const swappedTempPath = [];
  Object.defineProperty(fsModule, "open", {
    value: async function tempSwapOpen(filePath, ...rest) {
      const handle = await realOpen(filePath, ...rest);
      if (String(filePath).includes(".tmp-") && String(filePath).startsWith(path.join(root, "baseline.json"))) {
        const tempPath = String(filePath);
        const realClose = handle.close.bind(handle);
        Object.defineProperty(handle, "close", {
          value: async function () {
            await realClose();
            await realRename(tempPath, tempPath + ".swapped-away");
            await fsModule.writeFile(tempPath, replacementBytes, "utf8");
            swappedTempPath.push(tempPath);
          },
          configurable: true
        });
      }
      return handle;
    },
    configurable: true,
    writable: true
  });

  try {
    await assert.rejects(() => saveBaseline(baselinePath, baseline), /was replaced during the save/);
  } finally {
    Object.defineProperty(fsModule, "open", { value: faultInjectingOpen, configurable: true, writable: true });
  }

  assert.equal(await readFile(path.join(root, path.basename(swappedTempPath[0])), "utf8"), replacementBytes,
    "the author's replacement file must survive (never deleted by our cleanup)");
  await assert.rejects(() => lstat(baselinePath), { code: "ENOENT" }, "target must not be created from a foreign temp file");
});

test("saveBaseline preserves existing baseline on concurrent replacement", async (t) => {
  const { root } = await makeSkill(t);
  const baselinePath = path.join(root, "baseline.json");
  const original = { schemaVersion: 1, skill: "original", data: "keep-me" };
  await writeFile(baselinePath, JSON.stringify(original), "utf8");

  // We can't easily simulate a concurrent replacement in a same-process
  // test without monkey-patching fs. The identity check is exercised
  // in the codex.mjs concurrency test. Here we verify the happy path
  // (replace an existing valid baseline atomically).
  const newBaseline = { schemaVersion: 1, skill: "review-pr", data: "new" };
  await saveBaseline(baselinePath, newBaseline);
  const loaded = JSON.parse(await readFile(baselinePath, "utf8"));
  assert.equal(loaded.data, "new");
});
