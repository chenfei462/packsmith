---
name: system-handoff
description: Build a maintainer handoff that captures system boundaries, known risks, and the next safe actions.
---

# System Handoff

Use this skill when ownership is moving from one engineer or team to another and the repo context is still fragmented.

## Workflow

1. Identify the system boundary: what this repo owns, what it depends on, and what it explicitly does not own.
2. Capture the critical paths a new maintainer must understand first: deploy, incident response, and release flow.
3. Separate confirmed operational facts from tribal knowledge or assumptions.
4. List the highest-risk unknowns that could block a clean handoff.
5. End with one first-week action list a new maintainer can execute safely.

## Output

- system boundary
- critical workflows
- confirmed facts
- open risks
- first-week actions

## Rules

- Prefer repo docs, scripts, and workflow files over memory.
- Call out missing runbooks directly instead of papering over them.
- Keep recommendations concrete enough for a new maintainer to act on immediately.
