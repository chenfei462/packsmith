---
name: context-budgeting
description: Reduces long agent instructions while preserving important behavior and output contracts.
---

# Context Budgeter

Use this skill when instructions, docs, prompts, or skills are too long for efficient agent use.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Reduces long agent instructions while preserving important behavior and output contracts.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify the required behaviors, trigger conditions, and output contracts that must survive compression.
2. Remove repetition, implementation anecdotes, stale examples, and low-value narrative.
3. Preserve safety constraints, exact commands, schemas, and decision rules.
4. Replace long prose with compact checklists only where clarity improves.
5. Report what was removed and any behavior that may need separate reference docs.

## Output Format

Return:

- compressed instructions
- preserved requirements
- removed content
- risk notes
- before/after size

## Usage Example

```text
packsmith install context-budgeter
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
