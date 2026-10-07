# Packsmith v0.2 Wave 3 — M10 portable baseline report

Date: 2026-10-07. Branch: `feat/v0.2-reliability-gate`. Scope: plan §M10. Roles: ZCode (GLM-5.3-Flash) implements; Codex independently reviews. Starting point: M9 accepted at `7479df5`.

## Delivered behavior

`packsmith trigger <skill-dir> --save-baseline [--baseline <path>]` saves a portable, self-validating trigger baseline next to the skill (default `packsmith-baseline.json`). The baseline contains only whitelisted portable fields (schemaVersion, skill, suite fingerprint, optional SKILL.md content hash, timestamp, runtimes + per-runtime versions, runs, per-case id/expect, per-observation binary results with runtime versions, and a score recomputed from raw observations). Prompts, absolute paths, evidence payloads and auth data are never written.

- **buildBaseline** refuses (returns null) unless the grid is complete (runtimes × cases × runs observations, no duplicates), every observation is binary (`triggered`/`not_triggered`), and every runtime carries exactly one non-empty version across all its observations. The score is recomputed from raw observations via the M8 scorer; self-reported metrics are ignored.
- **validateBaseline / readBaseline** are strict: unknown top-level fields rejected, required fields present, fingerprint must match the CURRENT suite, per-observation `runtimeVersion` must equal the declared `runtimeVersions` map entry for its runtime (the wrong-version-map poison), observations must reference declared runtimes, real suite case ids, in-range repeats, and unique (runtime, case, repeat) slots; all score metrics, confusion, unresolved and divergence counts are recomputed and cross-checked.

## Save transaction (identity from open to commit)

`saveBaseline` writes to an exclusive temp file and re-verifies the whole chain before the rename:

- Temp ownership is captured from the opened FileHandle (`handle.stat()`, fstat) immediately after `open(tempPath, "wx")` — never from a path `lstat`, which could observe an author replacement that raced in before open returned.
- A close fault on the success path propagates: publication is refused, the error reaches the outer catch, and the identity-checked cleanup removes the temp. Only the second close inside a cleanup path may be ignored.
- Before the rename, all three identities are re-validated: the temp file must still be the inode we opened (a swapped temp is refused and never deleted — the other author's file survives), the parent directory must still be the same dev/ino (no junction/mkdir replacement), and the target must be unchanged: present-at-preflight targets are re-checked for identity AND content hash (removal lets the save proceed), absent-at-preflight targets must still be absent (a file that appeared during the save is never renamed over).
- Any fault (write EIO, close fault, rename fault, refusal) leaves the old baseline bytes intact and cleans up only files we still own (dev/ino identity-checked `rm`).

## CLI wiring

- Preflight (before any adapter call) reads and parses the suite, capturing: the suite RAW file hash, the SKILL.md content hash, and the existing baseline file's content hash (if present). Output path preflight rejects symlink targets and non-directory parents before any adapter runs.
- Post-run: the suite raw bytes, the existing baseline bytes and SKILL.md must all be unchanged; any drift refuses with an `infrastructure_error` envelope (native exit 2) and preserves the on-disk state — the preflight hashes exist precisely because a mid-run edit would otherwise be invisible to the save-time identity check.
- `--baseline` without `--save-baseline` is a usage error (exit 2) before any adapter call; the flag alone never runs the grid.
- When the run is unresolved (e.g. all `infra_error`, native exit 2), the refusal envelope's `exitCode` equals the native exit code (2), removing the earlier JSON exit1/native exit2 contradiction. A fully measured FN baseline is still saved with native exit 1.
- Suite read failures are classified per the M9 fix (EACCES/EIO → InfrastructureError).

## Files

- `src/trigger/baseline.mjs` — computeSuiteFingerprint, computeSkillContentHash, validateReportForBaseline, buildBaseline, validateBaseline, saveBaseline, readBaseline
- `src/cli.mjs` — `--save-baseline`/`--baseline` preflight + post-run drift checks, usage guards, exit-code agreement, `COMMAND_FLAGS.trigger` registration
- `tests/trigger/baseline.test.mjs` — real fault injection + strict reader poison suite
- `tests/trigger/baseline-cli.test.mjs` — CLI baseline regressions through the real `cli.mjs` process (zero model calls)
- `scripts/smoke-baseline.mjs` — portable 8-control baseline smoke (repo root via `fileURLToPath(new URL('../', import.meta.url))`, no hardcoded paths)
- `package.json` — test list registration + `smoke:baseline` script

## Test evidence (this host, real exit codes)

- Full `npm test`: **503 tests / 495 passed / 0 failed / 8 skipped (Windows symlink/junction privilege skips), exit 0.** Both M10 test files are registered in the npm test list.
- `node --test tests/trigger/baseline.test.mjs`: 19 tests, 18 pass, 1 skip, 0 fail. The rewritten fault tests use REAL fault injection on the `node:fs/promises` module object: `FileHandle.writeFile` writes half the bytes to disk before throwing EIO, the close fault fires after the fd really closes, the rename fault fires at publication — each test asserts a fired-counter > 0, lists leftovers with a real `readdir`, and asserts the old baseline bytes survived byte-identically. The previously inadequate circular-JSON-as-write-fault test and the `readdirSync` conditional were removed.
- `node --test tests/trigger/baseline-cli.test.mjs`: 4 tests, 4 pass. Machinery follows the reviewer's proven pattern: owned `APPDATA/npm/codex.cmd` resolving via `%~dp0` to a Node fake client that only serves `--version` and the no-model `debug prompt-input` audit; a `node --import` preload replaces `codexAdapter.runTriggerCase` (the adapter object is mutable; DEFAULT_ADAPTERS freezes only the map) with a synthetic binary adapter and injects suite/SKILL/baseline drift on the first adapter call; owned HOME/USERPROFILE so no real credentials are read.
- `npm run smoke:baseline`: 8/8 controls pass, exit 0 — normal save exit0, measured FN save exit1, unresolved exit2 with envelope `validation_error`/exitCode 2 equal to native, suite-drift and skill-drift refusals `infrastructure_error`/exit2 with prior baseline byte-preserved, baseline-drift refusal with the mid-run edit preserved, bad output parent usage2 with 0 adapter calls, `--baseline` without `--save-baseline` usage2 with 0 adapter calls. `actualModelCalls: 0`.

## Independent review status (relayed)

The independent reviewer reported: strict-reader normal + 9 poison controls 10/10; save-path 7 safety controls and 3 transaction boundary guards all passing after the close-fault propagation and `handle.stat()` ownership corrections; CLI 8/8 controls (normal save exit0, FN save exit1, drift refusals exit2, JSON envelope/native exit agreement, zero-adapter-call usage errors) passing on Windows with zero model calls. The reviewer's control scripts are retained under TEMP; the intermediate CLI SyntaxError observed during editing was transient and resolved before this report.

## Boundary

No real model or network calls were made by any M10 test or smoke; all adapter results are synthetic. Natural activation on Claude Code remains unestablished (honest FN, unchanged from Wave 2). Baseline portability across hosts relies on version strings recorded per runtime; it does not claim model-behavior stability across runtime upgrades. M11 (regression gate) is NOT started and waits for Codex acceptance of M10. The user's pre-existing staged content and the user's 55 pre-existing unstaged file blocks were not touched or committed, and the reviewer-owned Wave 3 acceptance report was left to its owner.
