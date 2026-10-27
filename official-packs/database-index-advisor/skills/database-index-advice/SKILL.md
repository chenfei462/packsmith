---
name: database-index-advice
description: Reviews query patterns and suggests cautious index changes with measurement plans.
---

# Database Index Advisor

Use this skill when a user asks about slow queries, schema changes, or database index design.

## Workflow

1. Identify query filters, joins, ordering, cardinality, and write frequency.
2. Suggest indexes only when they match a demonstrated access pattern.
3. Call out write amplification, locking, and migration risks.
4. Require measurement before and after any proposed index change.

## Return

- query pattern
- index recommendation
- risk tradeoffs
- measurement plan

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
