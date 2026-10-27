# Trigger regression gate (`packsmith ci`) — comparator definition and policy

Date: 2026-10-07. Scope: Wave 3 M11. This document defines the comparison
semantics BEFORE implementation; `src/trigger/regression.mjs` implements
exactly this definition and nothing more.

## Inputs and identity

`packsmith ci <path>` discovers target skills with the same discovery and
doctor behavior as `packsmith doctor <path>` (single skill dir, `skills/`
container, or loose layout). Every discovered skill is gated; nothing may
disappear into a passing gate.

For each skill, before any model execution:

- the current suite (`evals/triggers.json`) is read and parsed;
- the baseline (`packsmith-baseline.json` beside the skill, M10 schema) is
  loaded through the M10 strict reader, which enforces the suite fingerprint
  against the CURRENT suite and recomputes every claimed metric from the
  stored raw observations.

The gate runs in TWO PHASES: phase 1 pref lights EVERY discovered skill
(suite, baseline, evidence shape) before phase 2 executes anything. A missing
or invalid later skill must never spend model calls on an earlier one; when
preflight finds failures, prepared skills are reported as
`prepared, not executed` and no adapter runs. Fresh execution snapshots the
suite bytes, the SKILL.md hash and the baseline bytes before the run and
re-verifies them after it: a mid-run edit produces an unable gate (exit 2)
with the run's measured diagnostics retained — never a comparison of mixed
revisions. (A pre-existing SKILL.md difference from the baseline's optional
historical content hash remains allowed provenance metadata.)

Evidence shape validation distinguishes deliberately: malformed identity or
schema — wrong schemaVersion, unknown/duplicate runtimes, out-of-range runs,
malformed observations, invalid statuses, suite-identity or expect conflicts,
duplicate grid slots — is a validation failure (exit 1). ABSENT expected
slots (including an empty observation list), non-binary outcomes and
missing/incoherent runtime versions are incomplete evidence (comparison
unable, exit 2). Validation messages reference positions and validated enums,
never arbitrary imported values.

Identity rules:

- **Suite identity** is the prompt/expect fingerprint. A fingerprint mismatch
  means the suite changed since the baseline: the comparison cannot run and is
  reported as a validation failure (exit 1) — the baseline must be re-saved
  with `trigger --save-baseline`.
- **SKILL.md content hash** is provenance metadata only. Normal skill code
  changes are exactly what the gate should test; a changed hash is reported as
  `skillContentChanged: true` and never rejects the comparison.
- **Runtime-set drift**: a baseline runtime missing from the current evidence
  is a dropped runtime — comparison unable (exit 2), never a pass. Current
  runtimes absent from the baseline are compared on the baseline intersection
  only and reported as `unbaselinedRuntimes` (metadata). Completeness,
  version-coherence and binary checks apply to ALL declared current runtimes,
  including unbaselined ones: an extra runtime carrying unresolved, incomplete
  or unversioned evidence makes the comparison unable and can never disappear
  into a pass by being outside the compared intersection.
- **Runtime version coherence**: every current observation must carry a
  non-empty `runtimeVersion`, and each declared runtime must present exactly
  ONE coherent version across all of its observations. Missing, empty or
  mixed current versions are incomplete evidence (comparison unable, exit 2).
  A coherent single current version that DIFFERS from the baseline remains
  the documented visible metadata policy (`versionDrift.changed`): drift is
  not missing or incoherent evidence.
- **Sample-count drift**: different complete sample counts compare RATES, not
  raw counts. Runs drift is reported (`runsDrift`), never a failure by itself.
- **Runtime version drift**: reported per runtime (`versionDrift`), policy:
  rates remain comparable; drift is visible metadata, never silently dropped
  and never a gate failure by itself.

## Evidence modes

- **fresh (default)**: a new M8 execution with the baseline's runtime
  selection and the baseline's runs as the default sample count (overridable
  with `--runs`). This is authenticated, current evidence.
- **imported (`--results <report.json>`)**: an explicit M8 report file is
  imported through the M9 grid validation and labeled
  `mode: "imported"` in every output. Imported evidence is NOT fresh and NOT
  authenticated; the report says so. Single-skill discovery only.

## Comparison (the whole definition)

Only binary statuses (`triggered` / `not_triggered`) are comparable. Any
non-binary observation (ambiguous / infra_error / timeout / unsupported) or
incomplete grid in the CURRENT evidence makes the comparison UNABLE — exit 2
with the affected cases listed. It is never a behavioral negative and never a
pass. This mirrors the M10 baseline writer: baselines only ever contain
complete binary grids.

**Infrastructure precedence retains measured diagnostics.** When the gate
exits 2, the report still preserves every fully measured cell with its real
valid-run denominator (`validRuns`, never runs-activations invention of
FN/TN for non-binary outcomes), the measured confusion/quality computed over
valid cells only, the explicit unresolved states, and the per-case measured
regression candidates (e.g. a positive case whose measured activation rate
fell from the baseline while another cell was unresolved). Measured
diagnostics are retained but cannot produce a pass: partial or incomplete
evidence never passes.

**Exit 1 vs exit 2 is a deliberate distinction.** Missing expected rows,
non-binary outcomes, missing/incoherent runtime versions, dropped baseline
runtimes, fresh-run infrastructure or timeout are INCOMPLETE evidence —
exit 2. Truly malformed identity or schema — a report whose skill does not
match the baseline, invalid shapes, invalid imported report structure — is a
validation failure — exit 1.

The baseline's own aggregates are recomputed from `baseline.observations`
(independently of the stored score; the M10 reader already cross-checks the
stored score).

Per runtime, per case:

- `baselineRate` = activations / runs from the baseline observations;
  `currentRate` = activations / runs from the current binary observations.
- expect `trigger`: **regression iff currentRate < baselineRate**
  (activation decrease on a positive case).
- expect `no-trigger`: **regression iff currentRate > baselineRate**
  (activation increase on a negative case).
- Equal rates — including a stable measured FN or FP — do NOT regress; the
  imperfect-but-stable state stays fully visible in the report. No claim that
  "all cases pass" and no 100% reliability claim is ever produced.

Per runtime, aggregates recomputed from raw binary observations on both sides:

- `recall` = tp / (tp + fn); structurally N/A (null) when the suite has no
  positive-labeled cases.
- `precision` = tp / (tp + fp); null when tp + fp = 0 (no positive evidence —
  structural, not missing).
- `falsePositiveRate` = fp / (fp + tn); structurally N/A (null) when the suite
  has no negative-labeled cases.
- Regression iff both sides are non-null and recall or precision DECREASED, or
  falsePositiveRate INCREASED. A null on either side cannot regress and is
  reported as `null` (not-applicable), never 100% and never 0%.

Cross-runtime divergence (only when the baseline declares ≥ 2 runtimes):

- Per case, per repeat: the repeat pair is comparable iff every runtime's
  observation at that repeat is binary; divergent iff the activation outcomes
  differ across runtimes.
- Per-case divergence rate = divergent pairs / comparable pairs (normalized by
  comparable repeats, not raw counts).
- **Regression iff current rate > baseline rate** (new or increased paired
  divergence). Single-runtime baselines are structurally N/A.

## Verdict and exit codes

Per skill, `pass` = no per-case regression AND no aggregate regression AND no
divergence regression AND no unable reason. `failedChecks` enumerate the exact
causes (`case-activation-decrease`, `case-activation-increase`,
`recall-regression`, `precision-regression`, `fpr-regression`,
`divergence-increase`).

Overall exit code (max severity across skills):

- **0** — regression gate pass (imperfect baselines may pass; measured FN/FP
  and divergence stay visible in the report).
- **1** — static validation failure (doctor errors, invalid suite, malformed
  imported report identity/schema, suite identity mismatch) or a measured
  behavioral regression.
- **2** — infrastructure, incomplete evidence, or comparison unable to run
  (missing baseline, missing suite evidence, non-binary observations,
  missing/incoherent runtime versions, incomplete grids, dropped runtime,
  fresh-run infra/timeout). Infrastructure precedence preserves the measured
  regression diagnostics in the report.

`ci` never writes or updates a baseline.

## Sanitization

The JSON report is one sanitized structured object: skill names, case ids,
expectations, counts, rates, version strings, fingerprints and check lists
only. Prompts, raw traces, evidence payloads, run directories, auth/config
state and private paths are excluded by construction. All path references are
deliberate RELATIVE references anchored to the target path (never
`.replace`-derived), and validation messages never echo arbitrary imported
values — only positions and validated enum names.

## Opt-in CI usage

- `npm test` never launches models: comparator unit tests, CLI controls and
  smokes run on synthetic adapters and a no-model mock client only.
- `npm run test:integration` is the explicit opt-in real-model run
  (`scripts/integration-trigger.mjs`). It is NOT part of `npm test` and it
  refuses (exit 2, zero model calls) unless every gate is satisfied:
  `PACKSMITH_INTEGRATION=1`, a skill directory with a valid
  `evals/triggers.json`, and an EXPLICIT auth source file for every selected
  runtime (`PACKSMITH_INTEGRATION_CODEX_AUTH`,
  `PACKSMITH_INTEGRATION_CLAUDE_SETTINGS`) — there is no implicit
  workstation-login fallback. The suite, the runtime selection and the total
  call budget are validated BEFORE any model call: at most 4 explicit cases
  (`PACKSMITH_INTEGRATION_CASES`, default the first 4), runs bounded to 1..2,
  and the total case×runtime×repeat count capped at 16. Execution uses the
  programmatic M8 runner API with an explicit `caseIds` selection, an
  explicit `timeoutMs` and explicit `runtimeOptions`. The selection is
  enforced at the RUNNER boundary — the runner re-validates it against its
  own suite read (unknown, duplicate or empty selections refuse with zero
  model calls) and iterates only the selected cases, so the budget bounds
  the ACTUAL model calls even if the suite file changes between validation
  and execution. Credential honesty: when auth source files are provided,
  the M8 isolation bridge performs a PRIVATE read of those files and a
  private copy into the isolated runtime state; the script never prints
  credentials, raw client output or auth state, and its only output is a
  whitelist summary (or a whitelist error object). Results are labeled as a
  bounded real-model sample — not proof of natural activation for any
  runtime.
- `.github/workflows/regression-gate.yml` is a MANUAL-ONLY (`workflow_dispatch`)
  example: pinned `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0 and
  `actions/upload-artifact` v4.6.2 by reviewed SHA, Node 24, `npm ci` for
  lockfile-pinned project dependencies, a pinned tested Codex CLI version, a
  REQUIRED explicit target preflighted for a committed suite AND baseline,
  secret-to-file credential restore into a temporary private `HOME` matching
  the M8 bridge's default `HOME/.codex/auth.json` path (environment
  indirection, never interpolated into shell program text), an `always()`
  cleanup step, and an artifact limited to the sanitized `ci` JSON report.
  The gate's runtime set comes from the committed baseline by design (the
  gate compares like with like). It has no push/pull_request triggers, is
  never a required check, and has NOT been executed on GitHub Actions —
  structure verified by review only.
- Platform facts, stated honestly: the offline CLI mocks are Windows-verified
  (owned `npm/codex.cmd` shim); the real gate resolves the runtime client
  from PATH on POSIX. No POSIX offline CLI portability is claimed without a
  controlled test.

## Exit code summary

- **0** — gate pass (imperfect-but-stable baselines pass with measured
  FN/FP/divergence visible).
- **1** — validation failure (doctor errors, invalid suite, malformed
  baseline, malformed imported report identity/schema, suite identity
  mismatch) or a measured behavioral regression.
- **2** — infrastructure / incomplete / comparison unable: missing baseline,
  missing suite, non-binary or incomplete current evidence, missing or
  incoherent runtime versions, dropped runtimes, mid-run or pre-execution
  snapshot drift, fresh-run infrastructure or timeout. Measured regression
  diagnostics are retained; nothing passes on incomplete evidence.
