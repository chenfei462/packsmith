---
name: contributing-guide-writing
description: Creates contributor instructions for setup, tests, style, pull requests, and review expectations.
---

# Contributing Guide Writer

Use this skill when a repository needs a CONTRIBUTING guide or its existing contributor docs are stale.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Creates contributor instructions for setup, tests, style, pull requests, and review expectations.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Read manifests, CI, test files, linters, docs, and existing project conventions.
2. Document setup and verification commands a contributor can actually run.
3. Explain branch, PR, review, style, and release expectations without overcomplicating them.
4. Add guidance for docs, tests, and compatibility changes.
5. Mark anything that cannot be verified instead of inventing policy.

## Output Format

Return:

- setup commands
- development workflow
- testing expectations
- PR checklist
- style and docs notes

## Usage Example

```text
packsmith install contributing-guide-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
