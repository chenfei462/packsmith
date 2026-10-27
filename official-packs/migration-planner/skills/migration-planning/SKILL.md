---
name: migration-planning
description: Breaks risky code, data, or API migrations into reversible stages with checks.
---

# Migration Planner

Use this skill when the user needs to migrate frameworks, schemas, APIs, packages, or runtime conventions.

## Workflow

1. State the current and target states precisely.
2. Split the migration into reversible stages with checkpoints.
3. Find compatibility bridges and dual-read or dual-write periods where relevant.
4. Define verification, monitoring, and rollback for each stage.

## Return

- migration stages
- compatibility plan
- verification checks
- rollback notes

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
