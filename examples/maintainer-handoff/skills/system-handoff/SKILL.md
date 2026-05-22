---
name: system-handoff
description: Build a maintainer handoff that captures system boundaries, known risks, and the next safe actions.
---

# System Handoff

Use this skill when ownership is moving from one engineer or team to another and the repo context is still fragmented.

## When to use

- A repo is being handed to a new maintainer
- Documentation is scattered or incomplete
- The goal is to make ownership safe, not exhaustive

## Inputs

- Repo docs
- Scripts and workflows
- Release and incident flow
- Known operational risks

## Output format

- system boundary
- critical workflows
- confirmed facts
- open risks
- first-week actions

## Naming convention

- Keep the skill id about the workflow, not the team name
- Use a prompt file that describes the concrete output, like `onboarding-brief.md`

## Copyable structure

```text
examples/maintainer-handoff/
  packsmith.json
  skills/system-handoff/SKILL.md
  prompts/onboarding-brief.md
```

## Workflow

1. Identify the system boundary: what this repo owns, what it depends on, and what it explicitly does not own.
2. Capture the critical paths a new maintainer must understand first: deploy, incident response, and release flow.
3. Separate confirmed operational facts from tribal knowledge or assumptions.
4. List the highest-risk unknowns that could block a clean handoff.
5. End with one first-week action list a new maintainer can execute safely.

## Rules

- Prefer repo docs, scripts, and workflow files over memory.
- Call out missing runbooks directly instead of papering over them.
- Keep recommendations concrete enough for a new maintainer to act on immediately.
