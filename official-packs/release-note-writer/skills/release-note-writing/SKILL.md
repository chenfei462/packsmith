---
name: release-note-writing
description: Turns merged changes into readable release notes for users and maintainers.
---

# Release Note Writer

Use this skill when preparing a release, changelog entry, or user-facing update summary.

## Workflow

1. Group changes by user-facing value rather than commit order.
2. Identify migrations, breaking changes, and deprecations.
3. Translate internal implementation details into outcomes.
4. List verification and publish notes separately from user notes.

## Return

- highlights
- breaking changes
- fixes
- upgrade notes

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
