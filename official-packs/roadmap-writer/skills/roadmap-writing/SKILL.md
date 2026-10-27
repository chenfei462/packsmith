---
name: roadmap-writing
description: Converts strategy notes into phased roadmap documents with shipped, next, and deferred work.
---

# Roadmap Writer

Use this skill when strategy notes, backlog ideas, or launch requirements need a clear phased roadmap.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Converts strategy notes into phased roadmap documents with shipped, next, and deferred work.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify the product goal, non-negotiable launch bar, and work that should not distract from it.
2. Group work into phases that each produce a useful state.
3. Separate shipped, next, and deferred items honestly.
4. Tie roadmap items to user journeys rather than internal architecture alone.
5. End with acceptance criteria for the next release.

## Output Format

Return:

- phase list
- shipped items
- next priorities
- deferred work
- release criteria

## Usage Example

```text
packsmith install roadmap-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
