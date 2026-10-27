---
name: bug-reproduction
description: Converts vague bug reports into minimal reproduction cases and regression tests.
---

# Bug Reproducer

Use this skill when a bug report is unclear, intermittent, or missing a minimal test case.

## Workflow

1. Restate the observed behavior and expected behavior in one sentence each.
2. Find the smallest input, file, or command that demonstrates the issue.
3. Turn the reproduction into an automated test when the repository has a test runner.
4. Keep implementation fixes out of scope until the failing reproduction is visible.

## Return

- reproduction steps
- minimal fixture
- failing test proposal
- remaining unknowns

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
