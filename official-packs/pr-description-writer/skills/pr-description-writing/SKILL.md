---
name: pr-description-writing
description: Writes concise pull request descriptions with test evidence and reviewer context.
---

# PR Description Writer

Use this skill when the user is about to open or update a pull request.

## Workflow

1. Summarize user-visible behavior and important implementation choices.
2. List tests or smoke checks that actually ran.
3. Call out risks, migrations, and follow-up work honestly.
4. Keep reviewer instructions short and actionable.

## Return

- summary
- test plan
- risk notes
- review focus

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
