---
name: senior-code-review
description: Finds bugs, regressions, missing tests, risky changes, and unclear behavior before a change ships.
---

# Senior Code Reviewer

Use this skill when the user asks for a code review, release-readiness check, regression scan, or risk assessment.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Finds bugs, regressions, missing tests, risky changes, and unclear behavior before a change ships.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify the user-facing behavior and compatibility contract touched by the change.
2. Read the changed code, adjacent tests, relevant docs, and command output before forming findings.
3. Look first for correctness bugs, data loss, security risk, broken compatibility, and missing tests.
4. Separate confirmed findings from open questions and avoid style-only commentary.
5. Rank findings by severity and cite exact files, commands, or evidence.

## Output Format

Return:

- severity-ordered findings
- file and line references
- missing test coverage
- residual risk
- brief change summary

## Usage Example

```text
packsmith install senior-code-reviewer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
