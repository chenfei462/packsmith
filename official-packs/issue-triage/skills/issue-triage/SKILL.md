---
name: issue-triage
description: Groups issues by severity, effort, product value, and release relevance.
---

# Issue Triage

Use this skill when a backlog, GitHub issue list, or launch bug pile needs prioritization.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Groups issues by severity, effort, product value, and release relevance.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Read each issue for user impact, reproduction evidence, scope, dependencies, and release relevance.
2. Classify severity separately from effort and product value.
3. Group duplicate or related issues and identify blockers.
4. Recommend what belongs in the current release versus follow-up.
5. Produce crisp labels and next actions.

## Output Format

Return:

- triage groups
- severity/effort/value
- release blockers
- duplicates
- next actions

## Usage Example

```text
packsmith install issue-triage
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
