---
name: architecture-decision-recording
description: Drafts ADRs that capture context, decision, alternatives, and consequences.
---

# Architecture Decision Recorder

Use this skill when a technical decision needs to be recorded for future maintainers.

## Workflow

1. Write the decision in one direct sentence.
2. Capture context and constraints that made the decision necessary.
3. Compare rejected alternatives fairly.
4. List consequences, follow-ups, and review date if useful.

## Return

- decision
- context
- alternatives
- consequences

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
