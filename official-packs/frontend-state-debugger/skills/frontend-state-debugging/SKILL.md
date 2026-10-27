---
name: frontend-state-debugging
description: Debugs UI state issues by tracing events, derived state, rendering, and persistence.
---

# Frontend State Debugger

Use this skill when UI state is stale, duplicated, flickering, reset unexpectedly, or out of sync.

## Workflow

1. Trace the user event that changes state.
2. Separate source state from derived state and cached server state.
3. Find effects, subscriptions, and persistence code that can race.
4. Recommend a minimal reproduction and one state ownership fix.

## Return

- state flow
- race or ownership issue
- reproduction
- fix direction

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
