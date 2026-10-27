---
name: tutorial-writing
description: Creates beginner-friendly tutorials from existing examples and verified commands.
---

# Tutorial Writer

Use this skill when a project has examples but new users still need a guided path from zero to success.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Creates beginner-friendly tutorials from existing examples and verified commands.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Choose one concrete outcome the reader can complete in under one sitting.
2. Verify setup and commands from the repository before writing the tutorial.
3. Introduce concepts only when the next step needs them.
4. Include expected outputs and troubleshooting for common failure points.
5. End with next steps that build on the completed result.

## Output Format

Return:

- tutorial goal
- prerequisites
- step-by-step commands
- expected output
- troubleshooting

## Usage Example

```text
packsmith install tutorial-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
