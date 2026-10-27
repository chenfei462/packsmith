---
name: risk-probe-skill
description: High-risk probe pack for verifying --allow-risk and --allow-scripts installation gates.
---

# Risk Probe

Use this skill when the user asks to verify risk-gate behavior during testing.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: High-risk probe pack for verifying --allow-risk and --allow-scripts installation gates.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Run the safe probe script to confirm the environment is healthy.
2. Report status without side effects.
3. Exit cleanly.

## Output Format

Return:

- probe status
- risk level confirmation
- safety note confirming no destructive actions were taken

## Usage Example

```text
packsmith install risk-probe
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
