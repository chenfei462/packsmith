# Packsmith v0.2 Wave 2 — M8 trigger reliability report

Date: 2026-10-05 (round-2 fixes: 2026-10-05). Branch: `feat/v0.2-reliability-gate`. Scope: plan §§18–19. ZCode (GLM-5.3-Flash / DeepSeek) implements; Codex independently reviews. The original M8 code was produced in a prior session; this round fixes 8 counterexamples found by Codex's independent zero-model review (`packsmith-wave2-m8-independent-review.mjs`) plus the actual-discovery parentheses bypass (`packsmith-m7-parentheses-native-review.mjs`).

## Round-2 fixes (this commit)

1. **Scorer infra priority (plan §8)**: `anyUnresolved` (including `infra_error`) now takes precedence over binary FP/FN failures. A mixed FP+infra_error grid returns `status: "incomplete"`, `exitCode: 2` — never exit 1. FP/FN counts are retained in the confusion matrix for diagnostic visibility; infra errors are never counted as FN. Regression: `mixed FP + infra_error` test.
2. **Per-repeat paired divergence**: divergence now compares each case × repeat as a binary pair across runtimes (not aggregate activation counts). A[t,n]/B[n,t] with identical aggregate counts still diverges. A[t,infra]/B[n,t] keeps the repeat-1 binary divergence and marks repeat 2 non-comparable. The four non-binary states never enter the denominator. `activationCounts` replaced by `pairs` with per-repeat `statuses`, `comparable` and `divergent` flags. Regressions: equal-counts and partial-divergence tests.
3. **Runtime ID validation**: `runtimeIds: ["__proto__"]` (and other Object.prototype property names) are rejected with `TypeError: invalid runtime id` instead of silently producing a false pass via prototype slot assignment. The per-runtime results dictionary uses `Object.create(null)`. Regression: `__proto__` rejection test.
4. **Runner frontmatter validation**: `runTriggerEvaluation` parses the actual SKILL.md via the core parser BEFORE creating any run artifacts or invoking any adapter. A frontmatter `name` that doesn't match the trigger suite's `skill` field or the containing directory name is a `TriggerRunValidationError` (exit 1) with zero adapter calls and zero artifacts. Bad YAML and missing/empty frontmatter are likewise rejected. Regression: frontmatter-mismatch test in the independent review (`rejected: true, adapterCalls: 0`).
5. **CLI duplicate flag rejection**: duplicate `--runs` or `--runtime` (including `=` form) produce an upfront `UsageError` (exit 2, JSON envelope when JSON intent is present) instead of silently taking the last value. Regression: independent review (`exitCode: 2, hasUsageEnvelope: true`).
6. **Parenthesized locator parsing**: the locator regex `[^)]+SKILL\.md` truncated at the first `(` inside a path like `/fixture/global/collection(with-parentheses)/other-skill/SKILL.md`, causing scoping to miss that skill. The parser now JSON-parses the render (falling back to raw text), extracts the `<skills_instructions>` block, and matches each entry line for its trailing `(file: …)` group — capturing the full path regardless of inner parentheses. Bare `(file: …)` lines (without bullet prefix) are also matched. Fail-closed: an entry that looks like a skill but has no parseable absolute locator throws InfrastructureError. Verified against real Codex 0.148.0 no-model audit (`parentheses-native-review: foreignStillVisible: false`).
7. **TOML apostrophe safety**: `buildSkillScopeConfigValue` now uses TOML basic strings (double-quoted) with proper escaping (backslash → `\\`, double quote → `\"`, control chars → `\n`/`\r`/`\t`) instead of TOML literal strings (single-quoted), which cannot contain single quotes. A path like `/fixture/user's-skill/SKILL.md` produces valid TOML.
8. **M7 report 0b section**: blank code identifiers and stale claims corrected.

## Delivered behavior

`packsmith trigger <skill-dir> --runtime claude-code,codex --runs 3 [--format json]` reads the validated `evals/triggers.json` suite, validates the SKILL.md frontmatter, then executes every case/runtime/repeat in a separate M7 Git workspace and private runtime state. It defaults to both live adapters and one repeat; `--runs` accepts 1–20. The existing `trigger init` command and its JSON/usage behavior remain available. Cursor, Gemini CLI and OpenCode are explicitly `unsupported` static adapters.

The report retains every observation with its runtime, case, repeat, expected label, status, version, duration, evidence and retained run directory. Adapter/setup failures become `infra_error` observations and do not suppress later cases. Validation errors stop before creating run artifacts. The CLI emits one JSON object for JSON intent, including usage/validation/infrastructure error envelopes.

The scorer admits only `triggered` and `not_triggered` into TP/FP/TN/FN. It reports precision, recall, false-positive rate and infrastructure-error rate per runtime. `ambiguous`, `infra_error`, `timeout` and `unsupported` remain separate. A zero denominator is `null` in JSON and `n/a` in text; an infrastructure problem cannot be counted as a false negative or used to manufacture 100%. Cross-runtime divergence compares per case × repeat binary pairs; the four non-binary states are excluded from the denominator. Incomplete cases where no repeat is comparable are listed as incomparable. Exit 0 = all measured outcomes match, 1 = measured error/divergence (no unresolved states), 2 = incomplete (any unresolved state, with precedence over binary failures) / usage / infrastructure.

## Verification

- `node --test` (full suite): 448 total, 443 passed, zero failed, 5 Windows privilege skips (3 file-symlink, 2 junction).
- Scorer tests: 9/9 passed, including mixed FP+infra exit 2, per-repeat paired divergence, `__proto__` rejection.
- Isolation tests: 37 total, 36 passed, 1 junction privilege skip.
- Independent review (`packsmith-wave2-m8-independent-review.mjs`): all 8 counterexamples pass:
  - infra-priority: incomplete/exit 2 with FP=1 retained
  - paired-divergence equal-counts: divergence detected with per-repeat pairs
  - partial-paired-divergence: repeat 1 divergence kept, repeat 2 non-comparable
  - `__proto__` runtime id: rejected
  - parenthesized locator: 2/2 parsed
  - apostrophe TOML: valid double-quoted string
  - frontmatter mismatch: rejected with 0 adapter calls
  - duplicate `--runs`: exit 2 with usage envelope
- `npm run smoke:codex-skill-scope`: real Codex CLI 0.148.0 no-model audit passed (37 available → 1 scoped).
- `npm run smoke:isolation`: passed.
- All other smoke groups (`smoke:v01`, `smoke:trigger:init`, `smoke:runtimes`, `smoke:doctor`, `smoke:doctor:packaged`) passed.
- No model calls by M8 tests or smoke. Real post-scope Codex activation remains unverified: two finite earlier launches returned HTTP 401 without `~/.codex/auth.json`. The configured Claude backend had no observed natural positive. These are outstanding live evidence gates, not successful activation claims.

## Remaining gate

M8's offline implementation with round-2 fixes is ready for Codex independent re-acceptance. Wave 2 as a whole remains incomplete until authenticated scoped positive and negative runs and a natural Claude positive can be observed and honestly recorded.
