# Packsmith v0.2 Wave 3 — M9 matrix report

Date: 2026-10-07. Branch: `feat/v0.2-reliability-gate`. Scope: plan §20. Roles: ZCode (GLM-5.3-Flash) implements; Codex independently reviews. Starting HEAD: `2bb0b2b`.

## Delivered behavior

`packsmith matrix <skill-dir> [--results <report.json>] [--format json]` explicitly separates STATIC COMPATIBILITY from OBSERVED BEHAVIOR (plan §20). Default is model-free.

- **STATIC COMPATIBILITY**: built from the knowledge-base runtime records (`knowledge-base/runtimes/<id>.json`) and adapter `capabilities()`. Each row carries: runtime id, `staticCompatibility` (from `v02Scope`), `liveTriggerRunner` (from `v02Scope` — `false`/`null` for Cursor/Gemini/OpenCode, never claimed as live), skill discovery entry file, frontmatter required fields, evidence source, verifiedOn date, and a provenance path. Missing or optional fields are `null` (unknown), never defaulted to true/false.
- **OBSERVED BEHAVIOR**: available only via `--results <report.json>`, which must be a valid M8 trigger-evaluation report. Observations are recomputed from the raw per-observation statuses — self-reported score fields are ignored. Missing or non-binary observations produce `null` activation/FP rates with `observed: false`, never 100%. If `--results` is not provided, the OBSERVED BEHAVIOR section reports `null` / "not available".

## Import validation (plan requirement)

The M8 report importer enforces:
- `report.skill` matches the target skill's frontmatter name
- `runtimeIds` are valid known runtime IDs (from `RUNTIME_IDS`)
- every observation's `caseId` exists in the target skill's current `evals/triggers.json`
- every observation's `status` is one of the six trigger statuses
- the (runtime, caseId, repeat) grid has no duplicate rows and no out-of-range repeats
- metrics (activation rate, FP rate, infra rate) are recomputed from raw statuses

Malformed input (bad JSON, wrong skill, unknown runtime, invalid status, duplicate grid entries, wrong case IDs) produces `MatrixValidationError` (exit 1) or `MatrixUsageError` (exit 2) with the standard JSON envelope, never a false-green output.

## Static section contract

A missing or absent `v02Scope` or `skillDiscovery` or `frontmatter` field in a KB record produces `null` for the corresponding matrix cell — the matrix never guesses or defaults. Static facts are traceable to the KB `evidence` array (source, verifiedOn). The static section records capability facts from the KB, not per-skill validation; it does not copy the doctor's per-runtime `ok` boolean (which only indicates the absence of runtime-bound errors and could mask a global spec error).

## Files

- `src/trigger/matrix.mjs` — buildStaticCompatibility, importObservedBehavior, resolveMatrixExitCode, runMatrix
- `src/cli.mjs` — matrix command handler, renderMatrix, COMMAND_FLAGS entry, help text
- `tests/trigger/matrix.test.mjs` — 11 offline unit tests
- `scripts/smoke-matrix.mjs` — offline CLI smoke (static/json/results/usage/validation)
- `package.json` — test script + `smoke:matrix` registration

## Verification

- Full test suite (`node --test` with the 29 test files listed in `npm test`): **477 total, 472 passed, zero failed, 5 privilege-skips** (3 file-symlink, 2 junction). Skips are not counted as passes.
- M9 matrix tests: **11/11 passed**.
- `node scripts/smoke-matrix.mjs`: **PASS** (static/json/results/usage/validation).
- All other smokes pass: `smoke:v01` 5/5, `smoke:trigger:init` PASS, `smoke:doctor` PASS, `smoke:doctor:packaged` PASS, `smoke:runtimes` PASS, `smoke:isolation` PASS, `smoke:codex-skill-scope` PASS (real Codex 0.148.0 no-model 37→1), `smoke:trigger:run` PASS.
- No model calls by M9 tests or smoke.

## Limitations

- Observed behavior is imported historical data; same-name/same-case IDs cannot prove the prompt content hasn't changed since the original M8 run. The `isImportedHistorical: true` flag is set on the imported behavior for downstream consumers.
- A results file is bound to its single skill; multi-skill workspaces show other skills as unobserved.
- The matrix does not launch trigger evaluation; use `packsmith trigger` first, then pass the report via `--results`.
- Static compatibility facts reflect the KB records' provenance/verifiedOn dates; they are not live runtime probes.
- Natural Claude positive activation remains unobserved (as recorded in the M8 report); this limitation carries forward.

## Commits (M9)

- This commit: `feat: add packsmith matrix with static compatibility and observed behavior import`
