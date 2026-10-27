---
name: changelog-curation
description: Maintains changelogs by grouping changes into useful release categories.
---

# Changelog Curator

Use this skill when a changelog is missing, stale, noisy, or too implementation-heavy.

## Workflow

1. Read recent changes and existing changelog style.
2. Group entries by added, changed, fixed, deprecated, and removed where useful.
3. Mention commands, APIs, and migration actions users care about.
4. Avoid duplicating commit messages without user value.

## Return

- curated entries
- migration notes
- omissions
- source changes reviewed

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
