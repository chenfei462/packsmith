# Captured runtime traces — provenance

These fixtures are **REAL CLI captures**, not source-built. They were produced
by the live runtimes on this machine and then **sanitized** (machine-specific
absolute paths, session/thread/run ids and the private user-home path are
replaced with stable placeholders). They are kept separate from the
hand-constructed fixtures in the parent directory.

| Fixture | Runtime | Runtime version | Captured | Scenario | Observed parser status |
| --- | --- | --- | --- | --- | --- |
| `codex-triggered-captured.jsonl` | codex | codex-cli 0.148.0 | 2026-10-04 | explicit-capture (target skill read) | triggered |
| `codex-not-triggered-captured.jsonl` | codex | codex-cli 0.148.0 | 2026-10-04 | arithmetic-control (no target read) | not_triggered |
| `claude-not-triggered-captured.jsonl` | claude-code | 2.1.289 (Claude Code) | 2026-10-04 | explicit-capture (no tool_use; identical ASCII output) | not_triggered |
| `claude-not-triggered-control-captured.jsonl` | claude-code | 2.1.289 (Claude Code) | 2026-10-04 | arithmetic-control (no tool_use) | not_triggered |

## Important honest notes

- **The Codex positive is a real activation**: the run's JSONL contains a
  completed, exit-0 `Get-Content -Raw -LiteralPath` of the isolated
  `.agents/skills/wave2-capture-review/SKILL.md`. The Codex negative is ALSO
  a real run, but at that time it loaded the user's global skill
  (`superpowers/using-superpowers`) instead — that leak is exactly what the
  `skills.config` scoping in `src/trigger/codex-skill-scope.mjs` now closes;
  the negative fixture is retained as evidence of the pre-fix behaviour.
- **The Claude captures are NOT a positive activation.** Both real runs
  produced the same ASCII text with no `tool_use` at all; `not_triggered` is
  the correct, observed verdict. They only show how the *currently
  configured provider* responded — they do **not** demonstrate the Claude
  positive activation branch. The Claude Skill-tool protocol (input schema
  `{ skill, args }`, tool_use/tool_result correlation) was verified
  separately with a real Claude CLI against a deterministic **localhost mock
  backend** (explicitly NOT a natural LLM run) — see the protocol record.
- **Sanitization**: `C:\Users\<user>\AppData\Local\Temp\packsmith-wave2-live-*`
  → `C:/packsmith-capture-root`, the user home path → `C:/USERHOME`,
  run/session/thread/uuid ids → stable tokens. No credentials appear in any
  trace (verified by the isolation artifact secret scan).
- The parent `README.md` covers the hand-constructed fixtures; do not
  conflate the two provenance classes.
