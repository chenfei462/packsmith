---
name: bug-hunting
description: Reproduces, isolates, and explains bugs before proposing fixes.
---

# Bug Hunter

Use this skill when the user reports a bug, flaky behavior, failed command, or confusing runtime symptom.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Reproduces, isolates, and explains bugs before proposing fixes.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Capture the exact symptom, command, environment, and expected behavior.
2. Create or locate the smallest reproduction and confirm it fails for the reported reason.
3. Trace the behavior through inputs, state transitions, dependencies, and recent changes.
4. Form one or two falsifiable hypotheses and test them before editing.
5. Propose a fix only after the root cause is supported by evidence.

## Output Format

Return:

- reproduction steps
- observed versus expected behavior
- root-cause hypothesis
- evidence
- fix direction

## Usage Example

```text
packsmith install bug-hunter
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
