---
name: dependency-upgrade-planning
description: Plans safe dependency upgrade batches, risk checks, and verification commands.
---

# Dependency Upgrader

Use this skill when the user wants to upgrade dependencies, assess version risk, or prepare a dependency update PR.

## Workflow

1. Inventory direct and transitive dependencies relevant to the requested change.
2. Group upgrades into small batches by runtime, framework, and risk.
3. Identify breaking-change notes, lockfile effects, and compatibility checks.
4. Return exact verification commands and rollback notes.

## Return

- upgrade batches
- risk notes
- test commands
- rollback plan

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
