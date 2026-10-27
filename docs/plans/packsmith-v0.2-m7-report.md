# Packsmith v0.2 Wave 2 — M7 isolation and actual discovery

Date: 2026-10-05. Branch: `feat/v0.2-reliability-gate`. Scope: plan §17. The original isolation checkpoint is `42abe04`; this report covers the subsequent Codex skill discovery correction. Implementation of that correction was produced in the original ZCode session with the user-selected DeepSeek provider; Codex performed independent checks.

## What M7 does

- `withIsolatedTriggerRun` creates one retained run directory and a real Git repository for each case/runtime/repeat. It reserves `runtime.json`, `result.json`, `stdout.log`, `stderr.log`, and `events.jsonl` beside `workspace/`; setup failures retain diagnostic artifacts with `infra_error` and failed metadata.
- Each execution receives private HOME, runtime state, XDG config/cache/data/state, APPDATA, LOCALAPPDATA and temporary directories. The actual child process receives these paths; inherited session, credential and Git environment keys are stripped. Private state is removed after execution. Ownership and realpath checks prevent cleanup from deleting a replacement directory.
- The read-only auth bridge copies only Codex `auth.json` into private state. For Claude Code, it copies only six allowed settings environment fields (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`) and the top-level `model` selector when present. Hooks, MCP configuration and unrelated fields are excluded. Values are absent from public reports and metadata.
- Only the target Skill is installed into the isolated workspace. Source symlinks/junctions, redirected ancestors and escaping destinations are refused. Runs-root creation uses exclusive allocation and bounded collision retries.
- Codex on this Windows host discovers user skills from the OS home even when HOME and CODEX_HOME are isolated. The correction in `src/trigger/codex-skill-scope.mjs` audits `codex debug prompt-input` without a model, builds official `skills.config` path selectors disabling every non-target Skill, then audits again. It refuses execution unless exactly the target remains. `--ignore-user-config` was removed because actual testing showed it also removes the target Skill. The `-c skills.config=…` override is placed before `exec`.
- Claude Code uses its private settings and project-only source selection. Cursor, Gemini CLI and OpenCode remain static adapters; they return `unsupported` rather than fabricated activation.

## Independent evidence

- Before the Codex correction, a real negative Codex 0.148.0 run read a user-global Skill outside the workspace. The captured trace is retained in sanitized form under `tests/fixtures/runtime-traces/captured/`; it is historical evidence of the defect, not evidence of corrected live isolation. The pre-scope positive activated the target. The two configured-backend Claude Code 2.1.289 calls produced no tool use and were parsed as `not_triggered`; neither demonstrates a natural positive. A separate real Claude CLI with a deterministic localhost mock backend established native Skill tool protocol handling, not model selection.
- `node scripts/smoke-codex-skill-scope.mjs` used the installed Codex CLI 0.148.0 without a model. The baseline listed 37 available Skills, and the scoped view retained exactly the target. This establishes discovery scoping on this host.
- The scoped isolation/runtime tests passed 57/58, with one Windows file-symlink privilege skip. `node scripts/smoke-isolation.mjs` passed. The full suite before M8 additions passed 433/435, with two Windows symlink privilege skips and no failures.
- Two finite post-correction Codex model launches both returned `infra_error` due HTTP 401 (missing Bearer authentication); the parent `~/.codex/auth.json` was absent. These observations are neither false negatives nor a passed live activation gate. Parent config/settings hashes stayed unchanged. No further paid calls were made without authentication.

## Boundary

M7's offline and no-model discovery checks pass. Corrected natural activation under scoped Codex flags and a natural Claude positive remain unverified. The M8 runner and scoring are documented separately; an incomplete live gate remains visible in the Wave 2 acceptance record.
