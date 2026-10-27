# Packsmith v0.2 Wave 2 — M8 trigger reliability report

Date: 2026-10-05 (round-3 final: 2026-10-05). Branch: `feat/v0.2-reliability-gate`. Scope: plan §§18–19. Roles: ZCode (GLM-5.3-Flash / DeepSeek) implements; Codex independently reviews and accepts. Engineering checkpoint `2bad5e2` passed Codex final review with no remaining source-code blockers.

## Delivered behavior

`packsmith trigger <skill-dir> --runtime claude-code,codex --runs 3 [--format json]` reads the validated `evals/triggers.json` suite, validates the SKILL.md frontmatter, then executes every case/runtime/repeat in a separate M7 Git workspace and private runtime state. It defaults to both live adapters and one repeat; `--runs` accepts 1–20. Duplicate `--runs`/`--runtime` flags produce upfront usage errors (exit 2) instead of silent last-wins. The existing `trigger init` command and its JSON/usage behavior remain available. Cursor, Gemini CLI and OpenCode are explicitly `unsupported` static adapters.

The report retains every observation with its runtime, case, repeat, expected label, status, version, duration, evidence and retained run directory. Adapter/setup failures become `infra_error` observations and do not suppress later cases. Validation errors stop before creating run artifacts. The CLI emits one JSON object for JSON intent, including usage/validation/infrastructure error envelopes.

The scorer admits only `triggered` and `not_triggered` into TP/FP/TN/FN. It reports precision, recall, false-positive rate and infrastructure-error rate per runtime. `ambiguous`, `infra_error`, `timeout` and `unsupported` remain separate. A zero denominator is `null` in JSON and `n/a` in text; an infrastructure problem cannot be counted as a false negative or used to manufacture 100%. Cross-runtime divergence compares per case × repeat binary pairs; the four non-binary states are excluded from the denominator. Incomplete cases where no repeat is comparable are listed as incomparable. Exit 0 = all measured outcomes match, 1 = measured error/divergence (no unresolved states), 2 = incomplete (any unresolved state, with precedence over binary failures) / usage / infrastructure.

## Round-3 fixes

1. Scorer: `infra_error` takes precedence over binary FP/FN (plan §8). A mixed FP+infra grid returns incomplete/exit 2, never fail/exit 1. FP and FN counts remain in the confusion matrix.
2. Scorer: divergence is paired per case × repeat binary outcome, not aggregate counts. `activationCounts` and `runs` are retained in each divergence entry for the original data contract. A third runtime's unresolved state does not discard a binary divergence between the first two.
3. Scorer: runtime IDs colliding with Object.prototype properties (`__proto__`, `constructor`, etc.) are rejected.
4. Runner: SKILL.md frontmatter validated via the core parser before any artifacts or adapter calls. Name must match suite.skill and directory; description is required; YAML errors are sanitized.
5. CLI: divergence render shows per-repeat comparable/excluded/mismatch status.
6. CLI: duplicate `--runs`/`--runtime` produce upfront usage errors.
7. codex-skill-scope: strict tag-pairing state machine rejects nesting, stray close tags and unclosed tags. TOML escaping uses `\x08` (not the `\b` word-boundary regex) and `\uXXXX` for control chars.
8. codex-skill-scope: locator parser uses strict JSON parsing, trusts only developer-role input_text, and fail-closes on non-bullet/non-bare entries with `(file:` markers.

## Codex engineering acceptance

Codex independently reviewed and accepted the implementation at commit `2bad5e2` with no remaining source-code blockers. Independent verification: 466 tests / 464 pass / 0 fail / 2 Windows file-symlink privilege skips; real Codex 0.148.0 no-model audit 37 available → 1 scoped; real parentheses bypass `foreignStillVisible: false`; TOML round-trip 8/8; metadata 8/8; limited helper 3/3; all structure/nested/render regressions passed.

## Real Codex capture (authenticated, model-invoked)

Two finite real Codex 0.148.0 runs were executed by the user with `~/.codex/auth.json` present. Both completed successfully:

- **Positive** (`explicit-capture`, run `20261005-0f9765`): **triggered** — the model read the isolated `.agents/skills/wave2-capture-review/SKILL.md` via a completed exit-0 `Get-Content -Raw -LiteralPath`. `globalSkillRead: false`.
- **Negative** (`arithmetic-control`, run `20261005-beaa1a`): **not_triggered** — the model answered the arithmetic prompt without reading any skill. `globalSkillRead: false`.

Parent auth/config hashes are unchanged across both runs (3 files, before == after). These results establish that the M7/M8 isolation and scoping work correctly under real authenticated Codex CLI invocation.

**Source hash disclosure**: `codex-skill-scope.mjs` changed during the capture window (the JSON.parse error message was sanitized from `error.message` to a generic string). Codex rebuilt the old hash and confirmed the only change was this error message text; the changed code path (the malformed-JSON branch) was not executed in either capture run. The source was not byte-stable across the entire capture window, and this is recorded honestly.

## Claude Code observations (natural runs, configured backend)

Two finite real Claude Code 2.1.289 runs (positive and negative prompts) both completed with `result: success` but produced **no `tool_use` blocks** — the model answered directly in text without invoking the Skill tool. The positive case is therefore an observed **false negative** (FN), and the negative case is a true negative (TN). These are honest observations of the currently configured backend's natural behavior.

The Claude Skill tool protocol (`input: { skill, args }`, tool_use/tool_result correlation by id) was separately verified with a real Claude CLI against a deterministic **localhost mock backend** — this is a mechanical protocol test, not a natural LLM activation. The isolation layer correctly suppressed user-global skills (init skills list contained the target plus CLI built-ins, not user dws/godot).

## Verification

- `node --test` (full suite): **466 total, 459 passed, zero failed, 7 privilege-skips** (3 file-symlink, 2 junction, 1 real-PS, 1 symlink-source). Skips are not counted as passes.
- Independent review (`packsmith-wave2-m8-independent-review.mjs`): all 8 counterexamples pass:
  - infra-priority: incomplete/exit 2 with FP=1 retained
  - paired-divergence equal-counts: divergence detected with per-repeat pairs
  - partial-paired-divergence: repeat 1 divergence kept, repeat 2 non-comparable
  - `__proto__` runtime id: rejected
  - parenthesized locator: 2/2 parsed
  - apostrophe TOML: valid double-quoted string
  - frontmatter mismatch: rejected with 0 adapter calls
  - duplicate `--runs`: exit 2 with usage envelope
- Real Codex no-model audit: 37 available → 1 scoped (target kept, global excluded).
- Real parentheses bypass: `foreignStillVisible: false`.
- All 8 smokes: `smoke:v01`, `smoke:trigger:init`, `smoke:doctor`, `smoke:doctor:packaged`, `smoke:runtimes`, `smoke:isolation`, `smoke:codex-skill-scope`, `smoke:trigger:run` — all PASS.
- No model calls by M8 offline tests or smoke.

## Remaining limitations

- **Natural Claude positive activation is unobserved**: the two configured-backend runs produced no tool_use. This is an observed FN, recorded honestly. The Skill tool protocol was verified via mock-backend control. Changing the provider/endpoint/auth to force a positive was explicitly not done.
- **Codex scoped source hash instability**: the JSON.parse error message sanitization changed `codex-skill-scope.mjs` during the capture window; Codex confirmed the changed branch was not executed, but the source was not byte-stable across the full window.
- Offline tests use mock CLI binaries and hand-constructed/sanitized fixtures; no live model is called from `npm test`.

## Commits (M8)

- `0b34e3f` feat: evaluate trigger reliability across isolated runtimes
- `cdbe958` test: isolate git template cleanup assertion
- `7867b3e` fix: close M8 independent-review counterexamples and actual-discovery bypass
- `2bad5e2` fix: strict tag-pairing state machine, per-repeat paired divergence, frontmatter validation, and TOML/locator hardening
- This report update (separate docs commit)
