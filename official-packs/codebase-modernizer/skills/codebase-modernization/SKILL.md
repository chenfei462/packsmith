---
name: codebase-modernization
description: Plans incremental modernization work without turning it into a rewrite.
---

# Codebase Modernizer

Use this skill when a repository needs framework, language, module, or tooling modernization.

## Workflow

1. Identify the business or developer pain driving modernization.
2. Find a migration path that preserves shipping behavior.
3. Separate tooling updates, source changes, and compatibility adapters.
4. Choose verification gates before expanding scope.

## Return

- modernization goal
- phased plan
- compatibility risks
- verification gates

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
