# Packsmith v0.2 Wave 2 — M8 trigger reliability report

Date: 2026-10-05. Branch: `feat/v0.2-reliability-gate`. Scope: plan §§18–19. ZCode's original DeepSeek continuation stalled with native protocol errors after M7; Codex completed this offline M8 implementation and independent acceptance in the same workspace.

## Delivered behavior

`packsmith trigger <skill-dir> --runtime claude-code,codex --runs 3 [--format json]` reads the validated `evals/triggers.json` suite, then executes every case/runtime/repeat in a separate M7 Git workspace and private runtime state. It defaults to both live adapters and one repeat; `--runs` accepts 1–20. The existing `trigger init` command and its JSON/usage behavior remain available. Cursor, Gemini CLI and OpenCode are explicitly `unsupported` static adapters.

The report retains every observation with its runtime, case, repeat, expected label, status, version, duration, evidence and retained run directory. Adapter/setup failures become `infra_error` observations and do not suppress later cases. An invalid adapter result becomes `infra_error` in both the retained `result.json` and summary. Validation errors stop before creating run artifacts. The CLI emits one JSON object for JSON intent, including usage/validation/infrastructure error envelopes.

The scorer admits only `triggered` and `not_triggered` into TP/FP/TN/FN. It reports precision, recall, false-positive rate and infrastructure-error rate per runtime. `ambiguous`, `infra_error`, `timeout` and `unsupported` remain separate. A zero denominator is `null` in JSON and `n/a` in text; an infrastructure problem cannot be counted as a false negative or used to manufacture 100%. Cross-runtime divergence compares activation counts only when every repeat for every compared runtime has a binary outcome; incomplete cases are listed as incomparable. Exit 0 means all measured outcomes match, 1 means a measured error/divergence, and 2 means incomplete/usage/infrastructure.

## Verification

- `npm test`: 448 total, 446 passed, zero failed, two Windows file-symlink privilege skips.
- M8 focused tests: 13/13 passed. They cover exact confusion-matrix denominators, all unresolved statuses, complete-grid rejection, divergence, fresh Git workspaces per repeat, retained failure artifacts, invalid adapter responses, static-only CLI output and error envelopes.
- `npm run smoke:trigger:run`: passed, with six isolated mock case executions (3 repeats × 2 cases), exact TP/TN checks, distinct artifacts and static-only incomplete output.
- `npm run smoke:codex-skill-scope`: real Codex CLI 0.148.0 no-model audit passed (37 available Skills → exactly the target).
- `npm run smoke:isolation`: passed after its check was narrowed to roots owned by that smoke; the initial concurrent run collided with another legitimate trigger run in the shared OS temp directory. Other smoke groups (`smoke:v01`, `smoke:trigger:init`, `smoke:runtimes`, `smoke:example`, `smoke:doctor:packaged`) passed.
- No model calls were made by M8 tests or smoke. Real post-scope Codex activation remains unverified: the two finite earlier launches returned HTTP 401 without a local `~/.codex/auth.json`. The configured Claude backend had no observed natural positive. These are outstanding live evidence gates, not successful activation claims.

## Remaining gate

M8's offline implementation is accepted. Wave 2 as a whole remains incomplete until authenticated scoped positive and negative runs and a natural Claude positive can be observed and honestly recorded. The CLI reports infrastructure errors and undefined metrics in the meantime.
