---
name: refactor-planning
description: Turns messy code areas into safe staged refactor plans with boundaries, tests, and rollback points.
---

# Refactor Planner

Use this skill when code is difficult to change and the user wants a safe cleanup plan before editing.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Turns messy code areas into safe staged refactor plans with boundaries, tests, and rollback points.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Map current responsibilities, callers, data flow, and tests around the messy area.
2. Name the behavior that must not change and identify gaps in test coverage.
3. Split the refactor into reversible steps that each leave the project runnable.
4. Call out risky steps, migration boundaries, and review checkpoints.
5. Recommend the first smallest step and its verification command.

## Output Format

Return:

- current pain points
- protected behavior
- staged plan
- risk checkpoints
- first step

## Usage Example

```text
packsmith install refactor-planner
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
