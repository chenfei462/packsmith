---
name: prompt-quality-audit
description: Reviews agent prompts and skills for triggers, scope, output format, and contradiction risk.
---

# Prompt Quality Auditor

Use this skill when editing agent prompts, skill files, system guidance, or workflow instructions.

## Workflow

1. Check whether the trigger condition is specific enough.
2. Find contradictory instructions, vague output requirements, and hidden assumptions.
3. Reduce broad personality or process text that does not affect outcomes.
4. Return a cleaner prompt structure with before-and-after risk notes.

## Return

- prompt risks
- specific rewrites
- scope notes
- expected output format

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
