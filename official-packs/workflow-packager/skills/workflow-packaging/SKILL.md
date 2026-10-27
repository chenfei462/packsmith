---
name: workflow-packaging
description: Converts repeated manual workflows into reusable Packsmith packs.
---

# Workflow Packager

Use this skill when a repeated agent workflow should become a reusable pack with skills and prompts.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Converts repeated manual workflows into reusable Packsmith packs.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Extract the repeated workflow's purpose, trigger conditions, inputs, steps, and output.
2. Decide whether the pack needs one skill, multiple skills, prompts, or documentation.
3. Create a manifest shape with targets, permissions, tags, and context metadata.
4. Write pack files with clear examples and validation expectations.
5. Recommend registry metadata and publish dry-run commands.

## Output Format

Return:

- pack structure
- manifest fields
- skill outlines
- prompt outlines
- validation commands

## Usage Example

```text
packsmith install workflow-packager
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
