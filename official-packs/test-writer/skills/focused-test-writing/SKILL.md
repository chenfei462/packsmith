---
name: focused-test-writing
description: Adds focused tests for recent code changes, edge cases, and regressions without bloating the suite.
---

# Test Writer

Use this skill when behavior changed, a bug was fixed, coverage is missing, or a reviewer asks for stronger tests.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Adds focused tests for recent code changes, edge cases, and regressions without bloating the suite.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify the behavior contract from code, docs, issues, or failing output.
2. Choose the narrowest test level that proves the behavior without brittle implementation coupling.
3. Write the failing test or describe why an existing test already fails for the right reason.
4. Implement or request the smallest production change needed to make the test pass.
5. Report commands run and any untested residual risk.

## Output Format

Return:

- test intent
- new or changed test cases
- fixtures used
- commands run
- remaining gaps

## Usage Example

```text
packsmith install test-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
