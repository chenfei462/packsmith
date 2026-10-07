# Packsmith v0.2 Wave 3 — M11 regression gate report

Date: 2026-10-07. Branch: `feat/v0.2-reliability-gate`. Scope: plan §M11. Roles: ZCode implements; Codex independently reviews. Starting point: M10 committed at `06640f1` (portable baseline, fail-closed save transaction).

## Delivered behavior

`packsmith ci <path> [--results <report.json>] [--runs N] [--format json|text]` is the trigger regression gate. It combines static validation (doctor), freshly observed behavior (M8 runner, default) or an explicitly imported M8 report (`--results`, labeled `mode: "imported"`, single-skill only), and baseline comparison (M10 strict reader + the M11 comparator). Comparison semantics are defined before implementation in `docs/regression-gate.md`.

- **Two-phase gate.** Phase 1 pref lights EVERY discovered skill (suite, baseline, evidence shape) before phase 2 executes anything. A missing or invalid later skill must never spend model calls on an earlier one; prepared skills are reported `prepared, not executed` with zero adapter calls.
- **Read-boundary replacement race (closed).** The baseline enters the gate through the additive M10 `readBaselineSnapshot` (single read: validated bytes and drift-check hash come from the SAME revision). A pre-model snapshot recheck (suite bytes, SKILL.md hash, baseline bytes) refuses with exit 2 and ZERO adapter calls before any model runs; the author's replacement is preserved. Mid-run drift produces an unable gate (exit 2) with the run's measured diagnostics retained — never a comparison of mixed revisions.
- **Comparator (whole definition in docs/regression-gate.md).** Per case, per runtime: rates only — regression iff activation decreases on a `trigger` case or increases on a `no-trigger` case; a stable measured FN/FP does NOT regress and stays fully visible. Aggregates (recall/precision/FPR) are recomputed from raw binary observations on both sides; null is structural N/A, never 0%/100%. Cross-runtime paired divergence (baselines declaring ≥2 runtimes): regression iff the current divergence rate exceeds the baseline's. `failedChecks` enumerate the exact causes. No aggregate score is invented anywhere.
- **Incomplete is never a pass.** Non-binary outcomes, absent expected slots, missing/incoherent runtime versions, dropped baseline runtimes and fresh-run infra/timeout are comparison-unable (exit 2) with measured diagnostics retained; malformed identity/schema (wrong schemaVersion, duplicate grid slots, expect conflicts, report-skill mismatch) is a validation failure (exit 1). Exit codes: 0 pass; 1 validation failure or measured behavioral regression; 2 infrastructure/incomplete/unable. `ci` never writes or updates a baseline.
- **Sanitization.** The uploadable JSON report is a whitelist: skill/case identities, counts, rates, version strings, fingerprints, check kinds and stable knowledge-base rule messages only. Path references are deliberate relative references anchored to the target; malformed SKILL YAML sentinels and EIO/EACCES read faults surface as sanitized envelopes — the raw fault stays a local cause, never an uploadable value.

## Opt-in integration run (`scripts/integration-trigger.mjs`)

NOT part of `npm test` (`npm run test:integration`). It refuses (exit 2, zero model calls) unless every gate is satisfied: `PACKSMITH_INTEGRATION=1`, a skill directory with a valid `evals/triggers.json`, and an EXPLICIT auth source file for every selected runtime (`PACKSMITH_INTEGRATION_CODEX_AUTH`, `PACKSMITH_INTEGRATION_CLAUDE_SETTINGS`) — no implicit workstation-login fallback. The suite, the runtime selection and the total budget are validated BEFORE any model call: at most 4 explicit cases (default the first 4), runs bounded 1..2, total case×runtime×repeat calls capped at 16 and printed before launch. Execution uses the programmatic M8 runner API (`runTriggerEvaluation`) with an explicit `timeoutMs` and explicit `runtimeOptions` — nothing is parsed out of raw child stdout. Output is a whitelist summary only (identities, statuses, counts); failures print `{error, code}` plus a message only for usage/validation error classes.

**Credential honesty:** when auth source files are provided, the M8 isolation bridge performs a PRIVATE read of those files and a private copy into the isolated runtime state (`src/trigger/isolation.mjs` `bridgeAuth`). The script never prints credentials, raw client output or auth state — and the docs no longer claim that credentials are never read; they say exactly this.

## Workflow example (`.github/workflows/regression-gate.yml`)

MANUAL ONLY (`workflow_dispatch`); no push/pull_request triggers; never a required check; does not participate in `pull_request_target`. All review findings fixed:

- `npm ci` step added (lockfile-pinned project dependencies — the repo ships `package-lock.json`).
- Credential restore now targets a temporary private `HOME` written to `$RUNNER_TEMP/packsmith-home/.codex/auth.json` — the path the M8 bridge actually reads by default (`HOME/.codex/auth.json`); the previous `CODEX_HOME`-only restore would never have been consumed. Secret reaches the filesystem only through an environment variable, `chmod 700`, and an `always()` cleanup deletes the whole private HOME.
- The ignored `runtimes` input is removed: the gate's runtime set is the committed baseline's by design (comparing like with like).
- `target` is now REQUIRED with no default, and a zero-model-call preflight fails fast unless `evals/triggers.json` AND `packsmith-baseline.json` are committed under it (this repository currently ships no committed baseline; the honest failure mode is a clear refusal, not a fake run).
- Exit capture fixed (`set +e` … `code=$?` … `set -e`) so the gate's native exit code is not lost to `bash -e`.
- `actions/upload-artifact` pinned to the reviewed official SHA `ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2, verified against the official tag list at authoring time). Kept: checkout v7.0.1 / setup-node v7.0.0 pins, Node 24, pinned tested `@openai/codex@0.148.0`, `persist-credentials: false`, environment indirection with quoted variables (never shell-interpolated), artifact limited to the sanitized `ci` JSON report.

Platform facts, stated honestly: the offline unit/CLI controls are Windows-verified (owned `npm/codex.cmd` shim); this workflow runs the REAL gate on ubuntu-latest where the client resolves from PATH — no offline mock involved or claimed. **This workflow has never been executed on GitHub Actions; no real Actions run is claimed.**

## Files

- `src/trigger/regression.mjs` — the comparator: identity validation, per-case/per-aggregate/divergence regression detection, unable-reason enumeration, measured diagnostics retention
- `src/trigger/ci.mjs` — the two-phase gate (preflight, snapshot drift, fresh/imported evidence, sanitization, exit-code mapping)
- `src/cli.mjs` — `ci` command wiring (`COMMAND_FLAGS.ci`, JSON/text envelopes, usage errors)
- `src/trigger/baseline.mjs` — additive `readBaselineSnapshot` (single-read validation + rawHash); `readBaseline` kept as a wrapper
- `tests/trigger/regression.test.mjs` — comparator unit tests (real files, no models)
- `tests/trigger/ci-cli.test.mjs` — gate regressions through the real `cli.mjs` process, including the read-boundary replacement race (refuses exit 2, zero adapters) and YAML/EIO sanitization controls
- `tests/trigger/baseline-cli.test.mjs` — machinery updates for the snapshot reader + race injection
- `scripts/smoke-ci.mjs` — 11-control end-to-end smoke through the real CLI (Windows-gated, honest POSIX refusal)
- `scripts/smoke-baseline.mjs` — Windows platform gate + `NODE_OPTIONS` join fix
- `scripts/integration-trigger.mjs` — the bounded opt-in integration run described above
- `docs/regression-gate.md` — comparator definition + opt-in usage (updated to the honest credential/budget/workflow wording)
- `.github/workflows/regression-gate.yml` — the manual-only workflow example
- `package.json` — test registration (`tests/trigger/regression.test.mjs`, `tests/trigger/ci-cli.test.mjs`), `smoke:ci`, `test:integration`
- `docs/plans/packsmith-v0.2-m10-report.md` — wording correction: the preserved user work is the pre-existing staged content AND the 55 pre-existing unstaged file blocks (previously mislabeled "55 staged blocks")

## Test evidence (this host, real exit codes)

- Full `npm test`: **531 tests / 523 passed / 0 failed / 8 skipped (Windows symlink/junction privilege skips), exit 0** (~81 s). The two new registrations reconcile exactly: 503 (M10) + 19 (`regression.test.mjs`) + 9 (`ci-cli.test.mjs`, including the 9th read-boundary race control) = 531.
- `node --test tests/trigger/regression.test.mjs`: 19/19, exit 0. `node --test tests/trigger/ci-cli.test.mjs`: 9/9, exit 0. `tests/trigger/baseline-cli.test.mjs`: 4/4, exit 0.
- `npm run smoke:ci`: **11/11 controls pass, exit 0, `actualModelCalls: 0`** — fresh pass (exit 0) and measured regression (exit 1, `case-activation-decrease`); imported valid (exit 0, `mode: "imported"`, zero adapters); imported unresolved (exit 2, unable, measured regressions retained, `validRuns: 0` — no invented cells); imported schemaVersion 2 / duplicate slot / expect conflict (exit 1); imported empty observations (exit 2); mid-run suite drift (exit 2, unable, drift reason surfaced); two-phase preflight (second skill without baseline blocks ALL adapters, zero calls); `--runs 0` usage error (exit 2, JSON envelope). No control's report leaks the private temp root (no absolute paths).
- `npm run smoke:baseline`: 8/8, exit 0 (`actualModelCalls: 0`, `actualAuthReads: 0`) — M10 controls unchanged on the snapshot refactor.
- `npm run smoke:trigger:run`: PASS. `npm run smoke:matrix`: PASS (both touch the modified `cli.mjs`/`baseline.mjs` surfaces).
- `npm run test:integration` negative control (no opt-in env): **refuses with exit 2, zero model calls**, as documented.

## Independent review status (relayed)

Codex evidence for the pre-finalization revisions: comparator controls 28/28; imported CLI evidence 24/24; poisonCLI 11/11; freshCLI 7/7; YAML/EIO sanitization controls pass; repository ci-cli 8/8 before the 9th race control was added; smoke 11/11 independently reproduced; the read-boundary replacement race refuses exit 2 before ANY adapters with the author file preserved and the injection observed fired; the M10 reader's valid + 9 poison cases still match expected after the additive `readBaselineSnapshot`. (Check counts differ between harnesses; both sides are green on their own counting.)

## Boundary

- No real model or network calls were made by any M11 test, smoke or control on this host; all adapter results are synthetic. The integration script was exercised only as a refusal negative control. No integration models were launched by either role.
- The workflow example has never executed on GitHub Actions; structure only. The `upload-artifact` SHA was verified against the official tag list at authoring time.
- Natural activation on Claude Code remains unestablished (honest FN, unchanged since Wave 2); nothing in any report claims a natural Claude success.
- POSIX offline CLI mocking is unclaimed: the smokes gate on `win32` and say so; the workflow example runs real clients on POSIX by design.
- User work protection: the pre-existing staged content and the 55 pre-existing unstaged file blocks were not touched or committed; the reviewer-owned Wave 3 acceptance and execution-plan documents were not modified or committed. Junk files `1`, `nul` and `site/nul` exist at the repo root; their ownership could not be verified, so they were left in place and are reported here. No `.tmp` smoke/debug residue was found; smoke scripts clean their own temp roots.
