---
name: refactor-guidance
description: Plans small behavior-preserving refactors around boundaries, tests, and review risk.
---

# Refactor Guide

Use this skill when code needs cleanup but behavior should stay stable.

## Workflow

1. Name the behavior that must remain unchanged.
2. Find the smallest boundary that can be improved safely.
3. Add or identify tests that protect the behavior before changing structure.
4. Sequence edits so review remains understandable.

## Return

- protected behavior
- refactor steps
- test coverage
- review notes

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
