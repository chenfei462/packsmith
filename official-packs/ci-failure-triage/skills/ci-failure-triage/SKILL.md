---
name: ci-failure-triage
description: Turns failing CI logs into root-cause hypotheses and next verification steps.
---

# CI Failure Triage

Use this skill when the user shares CI output, a failing workflow, or asks why a pipeline is red.

## Workflow

1. Separate infrastructure failures from test, lint, build, and packaging failures.
2. Extract the first meaningful error and every affected job name.
3. Compare CI-only environment assumptions with local scripts.
4. Suggest one minimal reproduction command before proposing code changes.

## Return

- failing job
- first useful error
- likely root cause
- local reproduction command

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
