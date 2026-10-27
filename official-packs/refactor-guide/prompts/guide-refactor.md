# Refactor Guide

Use the Refactor Guide pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when code needs cleanup but behavior should stay stable.

Follow this sequence:

1. Name the behavior that must remain unchanged.
2. Find the smallest boundary that can be improved safely.
3. Add or identify tests that protect the behavior before changing structure.
4. Sequence edits so review remains understandable.

## Output Format

Return:

- protected behavior
- refactor steps
- test coverage
- review notes
