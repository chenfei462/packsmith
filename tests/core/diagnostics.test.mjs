import test from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORIES,
  EXIT_CODES,
  SEVERITIES,
  collectDiagnostics,
  createDiagnostic,
  exitCodeForDiagnostics,
  isDiagnostic,
  resolveExitCode,
  sortDiagnostics,
  summarizeDiagnostics
} from "../../src/core/diagnostics.mjs";

/**
 * Offline diagnostics-engine tests (plan §8). Pure model, no fixtures, no
 * filesystem, no network, no credentials — the engine itself never touches
 * any of those.
 */

/** The exact example diagnostic from plan §8. */
function planExample() {
  return createDiagnostic({
    id: "PS-SPEC-007",
    severity: "error",
    category: "spec",
    title: "Skill name does not match directory",
    message: 'Skill name "reviewer" does not match directory "review-pr".',
    file: "skills/review-pr/SKILL.md",
    line: 2,
    runtime: null,
    evidence: ["agent-skills-spec"],
    fix: { available: true, safe: true }
  });
}

test("SEVERITIES and CATEGORIES match the plan §8 sets and order", () => {
  assert.deepEqual(SEVERITIES, ["error", "warning", "info"]);
  assert.deepEqual(CATEGORIES, ["spec", "activation", "compatibility", "context", "security"]);
  assert.ok(Object.isFrozen(SEVERITIES));
  assert.ok(Object.isFrozen(CATEGORIES));
});

test("createDiagnostic produces the exact plan §8 structure, in plan key order", () => {
  const diagnostic = planExample();

  assert.deepEqual(Object.keys(diagnostic), [
    "id",
    "severity",
    "category",
    "title",
    "message",
    "file",
    "line",
    "runtime",
    "evidence",
    "fix"
  ]);

  assert.deepEqual(diagnostic, {
    id: "PS-SPEC-007",
    severity: "error",
    category: "spec",
    title: "Skill name does not match directory",
    message: 'Skill name "reviewer" does not match directory "review-pr".',
    file: "skills/review-pr/SKILL.md",
    line: 2,
    runtime: null,
    evidence: ["agent-skills-spec"],
    fix: { available: true, safe: true }
  });

  // stable JSON for CI consumers (plan §12 output stability relies on this)
  assert.equal(
    JSON.stringify(diagnostic),
    '{"id":"PS-SPEC-007","severity":"error","category":"spec",' +
      '"title":"Skill name does not match directory",' +
      '"message":"Skill name \\"reviewer\\" does not match directory \\"review-pr\\".",' +
      '"file":"skills/review-pr/SKILL.md","line":2,"runtime":null,' +
      '"evidence":["agent-skills-spec"],' +
      '"fix":{"available":true,"safe":true}}'
  );
});

test("createDiagnostic applies documented defaults and copies mutable inputs", () => {
  const evidence = ["some-source"];
  const diagnostic = createDiagnostic({
    id: "PS-SEC-001",
    severity: "warning",
    category: "security",
    title: "Sensitive file access pattern",
    message: "scripts/run.sh reads .env.",
    evidence
  });

  assert.equal(diagnostic.file, null);
  assert.equal(diagnostic.line, null);
  assert.equal(diagnostic.runtime, null);
  assert.deepEqual(diagnostic.evidence, ["some-source"]);
  assert.equal(diagnostic.fix, null);

  // evidence is copied: mutating the caller's array must not leak in
  evidence.push("late-addition");
  assert.deepEqual(diagnostic.evidence, ["some-source"]);
});

test("diagnostics are deeply frozen: mutation is rejected in strict mode", () => {
  const diagnostic = planExample();

  assert.ok(Object.isFrozen(diagnostic));
  assert.ok(Object.isFrozen(diagnostic.evidence));
  assert.ok(Object.isFrozen(diagnostic.fix));

  assert.throws(() => {
    diagnostic.severity = "info";
  }, TypeError);
  assert.throws(() => {
    diagnostic.evidence.push("nope");
  }, TypeError);
  assert.throws(() => {
    diagnostic.fix.available = false;
  }, TypeError);
});

test("severity constraint: only error/warning/info are accepted", () => {
  for (const severity of SEVERITIES) {
    assert.equal(
      createDiagnostic({
        id: "PS-CTX-001",
        severity,
        category: "context",
        title: "t",
        message: "m"
      }).severity,
      severity
    );
  }

  for (const bad of ["fatal", "critical", "ERROR", "", null, undefined, 1, {}]) {
    assert.throws(
      () =>
        createDiagnostic({
          id: "PS-CTX-001",
          severity: bad,
          category: "context",
          title: "t",
          message: "m"
        }),
      TypeError
    );
  }
});

test("category constraint: only the five initial categories are accepted", () => {
  for (const category of CATEGORIES) {
    assert.equal(
      createDiagnostic({
        id: "PS-SPEC-001",
        severity: "error",
        category,
        title: "t",
        message: "m"
      }).category,
      category
    );
  }

  for (const bad of ["style", "SPEC", "runtime", "", null, undefined, 42]) {
    assert.throws(
      () =>
        createDiagnostic({
          id: "PS-SPEC-001",
          severity: "error",
          category: bad,
          title: "t",
          message: "m"
        }),
      TypeError
    );
  }
});

test("field constraints: id/title/message/file/line/runtime/evidence/fix are validated", () => {
  const base = { id: "PS-SPEC-001", severity: "error", category: "spec", title: "t", message: "m" };

  assert.throws(() => createDiagnostic({ ...base, id: "" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, id: null }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, title: "" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, message: "" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, file: "" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, file: 12 }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, line: 0 }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, line: 2.5 }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, line: "2" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, runtime: "" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, evidence: "agent-skills-spec" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, evidence: [null] }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, fix: "auto" }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, fix: { available: 1, safe: true } }), TypeError);
  assert.throws(() => createDiagnostic({ ...base, fix: { available: true } }), TypeError);

  // legal edge values
  assert.equal(createDiagnostic({ ...base, line: 1 }).line, 1);
  assert.equal(createDiagnostic({ ...base, runtime: "codex" }).runtime, "codex");
  assert.deepEqual(createDiagnostic({ ...base, evidence: [] }).evidence, []);
  assert.deepEqual(createDiagnostic({ ...base, fix: { available: false, safe: false } }).fix, {
    available: false,
    safe: false
  });
});

test("isDiagnostic accepts valid diagnostics and rejects everything else", () => {
  assert.ok(isDiagnostic(planExample()));
  assert.ok(isDiagnostic(createDiagnostic({ id: "x", severity: "info", category: "spec", title: "t", message: "m" })));

  for (const bad of [
    null,
    undefined,
    42,
    "PS-SPEC-001",
    {},
    { id: "PS-SPEC-001" },
    // valid-looking values but a missing key (runtime) — structure must be complete
    {
      id: "PS-SPEC-001",
      severity: "error",
      category: "spec",
      title: "t",
      message: "m",
      file: null,
      line: null,
      evidence: [],
      fix: null
    },
    // right keys, illegal severity
    { ...planExample(), severity: "fatal" },
    // right keys, unknown category
    { ...planExample(), category: "style" }
  ]) {
    assert.equal(isDiagnostic(bad), false);
  }
});

test("collectDiagnostics flattens sources, skips null sources, and freezes the result", () => {
  const first = planExample();
  const second = createDiagnostic({
    id: "PS-CTX-001",
    severity: "warning",
    category: "context",
    title: "Large SKILL.md",
    message: "Estimated 6000 tokens."
  });
  const third = createDiagnostic({
    id: "PS-COMP-001",
    severity: "info",
    category: "compatibility",
    title: "Non-standard frontmatter",
    message: "Unknown key `x-pack`.",
    runtime: "codex"
  });

  const collected = collectDiagnostics([first, second], null, undefined, [third]);

  assert.deepEqual(collected, [first, second, third]);
  assert.ok(Object.isFrozen(collected));
});

test("collectDiagnostics rejects non-diagnostic entries and non-array sources", () => {
  const valid = planExample();

  assert.throws(() => collectDiagnostics([valid, { id: "PS-SPEC-001" }]), TypeError);
  assert.throws(() => collectDiagnostics([valid, null]), TypeError);
  assert.throws(() => collectDiagnostics(valid), TypeError);
  assert.throws(() => collectDiagnostics("PS-SPEC-001"), TypeError);
});

test("sortDiagnostics orders by severity, then category, then id", () => {
  const errorSpec = planExample(); // PS-SPEC-007, error, spec
  const errorActivation = createDiagnostic({
    id: "PS-ACT-002",
    severity: "error",
    category: "activation",
    title: "Activation boundary unclear",
    message: "m"
  });
  const warningSpec = createDiagnostic({
    id: "PS-SPEC-009",
    severity: "warning",
    category: "spec",
    title: "Description too long",
    message: "m"
  });
  const errorSpecEarlierId = createDiagnostic({
    id: "PS-SPEC-002",
    severity: "error",
    category: "spec",
    title: "Frontmatter missing",
    message: "m"
  });
  const securityWarning = createDiagnostic({
    id: "PS-SEC-002",
    severity: "warning",
    category: "security",
    title: "Remote shell execution pattern",
    message: "m"
  });

  const input = [securityWarning, warningSpec, errorActivation, errorSpec, errorSpecEarlierId];
  const sorted = sortDiagnostics(input);

  assert.deepEqual(sorted, [errorSpecEarlierId, errorSpec, errorActivation, warningSpec, securityWarning]);
  // pure: the input array is untouched
  assert.deepEqual(input, [securityWarning, warningSpec, errorActivation, errorSpec, errorSpecEarlierId]);
  // deterministic: sorting again yields the identical order
  assert.deepEqual(sortDiagnostics(sorted), sorted);
});

test("sortDiagnostics breaks remaining ties by file, line, then message", () => {
  const make = (overrides) =>
    createDiagnostic({ id: "PS-SPEC-010", severity: "error", category: "spec", title: "t", message: "m", ...overrides });

  const noFile = make({ file: null, line: null, message: "b" });
  const fileALine3 = make({ file: "a/SKILL.md", line: 3, message: "z" });
  const fileALine10 = make({ file: "a/SKILL.md", line: 10, message: "a" });
  const fileB = make({ file: "b/SKILL.md", line: 1, message: "m" });

  const sorted = sortDiagnostics([fileB, fileALine10, noFile, fileALine3]);

  assert.deepEqual(sorted, [noFile, fileALine3, fileALine10, fileB]);
});

test("sortDiagnostics rejects non-diagnostic entries", () => {
  assert.throws(() => sortDiagnostics([planExample(), {}]), TypeError);
  assert.throws(() => sortDiagnostics("not-an-array"), TypeError);
});

test("summarizeDiagnostics counts severities and zero-fills every category", () => {
  const diagnostics = collectDiagnostics(
    [planExample()], // error, spec
    [
      createDiagnostic({
        id: "PS-CTX-001",
        severity: "warning",
        category: "context",
        title: "Large SKILL.md",
        message: "m"
      }),
      createDiagnostic({
        id: "PS-SEC-001",
        severity: "warning",
        category: "security",
        title: "Sensitive file access",
        message: "m"
      })
    ],
    [
      createDiagnostic({
        id: "PS-COMP-001",
        severity: "info",
        category: "compatibility",
        title: "Non-standard frontmatter",
        message: "m"
      })
    ]
  );

  const summary = summarizeDiagnostics(diagnostics);

  assert.equal(summary.errors, 1);
  assert.equal(summary.warnings, 2);
  assert.equal(summary.infos, 1);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byCategory, {
    spec: 1,
    activation: 0,
    compatibility: 1,
    context: 1,
    security: 1
  });

  assert.ok(Object.isFrozen(summary));
  assert.ok(Object.isFrozen(summary.byCategory));
});

test("summarizeDiagnostics of an empty list is a valid zero summary", () => {
  assert.deepEqual(summarizeDiagnostics([]), {
    errors: 0,
    warnings: 0,
    infos: 0,
    total: 0,
    byCategory: { spec: 0, activation: 0, compatibility: 0, context: 0, security: 0 }
  });
  assert.equal(summarizeDiagnostics([]).total, 0);
});

test("EXIT_CODES encode the plan §8 convention: 0 PASS, 1 failure, 2 infra", () => {
  assert.deepEqual(EXIT_CODES, { PASS: 0, VALIDATION_FAILURE: 1, INFRASTRUCTURE_FAILURE: 2 });
});

test("resolveExitCode maps validation failures to 1 and clean runs to 0", () => {
  assert.equal(resolveExitCode(), EXIT_CODES.PASS);
  assert.equal(resolveExitCode({}), EXIT_CODES.PASS);
  assert.equal(resolveExitCode({ errors: 0, regressions: 0, infraErrors: 0 }), EXIT_CODES.PASS);

  // warnings/infos never fail the gate
  assert.equal(resolveExitCode({ errors: 0, regressions: 0 }), EXIT_CODES.PASS);

  // skill validation failures → 1
  assert.equal(resolveExitCode({ errors: 1 }), EXIT_CODES.VALIDATION_FAILURE);
  assert.equal(resolveExitCode({ errors: 12 }), EXIT_CODES.VALIDATION_FAILURE);

  // behavioral regression → 1
  assert.equal(resolveExitCode({ regressions: 1 }), EXIT_CODES.VALIDATION_FAILURE);
  assert.equal(resolveExitCode({ errors: 3, regressions: 1 }), EXIT_CODES.VALIDATION_FAILURE);

  assert.throws(() => resolveExitCode({ errors: -1 }), TypeError);
  assert.throws(() => resolveExitCode({ infraErrors: 1.5 }), TypeError);
});

test("HARD RULE: infrastructure errors take precedence and never become exit code 1", () => {
  assert.equal(resolveExitCode({ infraErrors: 1 }), EXIT_CODES.INFRASTRUCTURE_FAILURE);
  assert.equal(resolveExitCode({ infraErrors: 4 }), EXIT_CODES.INFRASTRUCTURE_FAILURE);

  // the critical case: a broken toolchain alongside validation failures
  // must NOT be reported as a skill validation failure (plan §4.4)
  assert.equal(
    resolveExitCode({ errors: 5, infraErrors: 1 }),
    EXIT_CODES.INFRASTRUCTURE_FAILURE
  );
  assert.equal(
    resolveExitCode({ errors: 5, regressions: 2, infraErrors: 1 }),
    EXIT_CODES.INFRASTRUCTURE_FAILURE
  );
});

test("exitCodeForDiagnostics wires the summary into the exit code convention", () => {
  const clean = [
    createDiagnostic({
      id: "PS-ACT-001",
      severity: "warning",
      category: "activation",
      title: "Description lacks semantics",
      message: "m"
    })
  ];
  const failing = [planExample(), ...clean];

  assert.equal(exitCodeForDiagnostics([]), EXIT_CODES.PASS);
  assert.equal(exitCodeForDiagnostics(clean), EXIT_CODES.PASS); // warnings only
  assert.equal(exitCodeForDiagnostics(failing), EXIT_CODES.VALIDATION_FAILURE);
  assert.equal(exitCodeForDiagnostics(clean, { regressions: 1 }), EXIT_CODES.VALIDATION_FAILURE);
  assert.equal(
    exitCodeForDiagnostics(failing, { infraErrors: 1 }),
    EXIT_CODES.INFRASTRUCTURE_FAILURE
  );
});
