---
name: test-fixture-design
description: Designs small durable fixtures that make tests clearer without overfitting.
---

# Test Fixture Designer

Use this skill when tests need sample files, factory data, temp directories, or stable setup helpers.

## Workflow

1. Identify the behavior the fixture must make visible.
2. Keep fixture data small, named, and realistic enough to explain failures.
3. Avoid hidden coupling between tests through shared mutable fixtures.
4. Document how to update fixtures when behavior changes.

## Return

- fixture shape
- test cases covered
- maintenance notes
- anti-coupling checks

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
