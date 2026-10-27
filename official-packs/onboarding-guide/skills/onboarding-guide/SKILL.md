---
name: onboarding-guide
description: Explains a new repository for a first-time contributor with real commands and contribution landmarks.
---

# Onboarding Guide

Use this skill when a new contributor needs to understand setup, project shape, and where to make common changes.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Explains a new repository for a first-time contributor with real commands and contribution landmarks.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Gather setup commands, test commands, and development entry points from repository files.
2. Explain the repository in practical layers rather than exhaustive directory listings.
3. Highlight common first tasks and the files likely involved.
4. Call out project-specific conventions and things not to touch casually.
5. Keep the guide command-driven and verify claims against files.

## Output Format

Return:

- quick setup
- mental model
- common workflows
- important files
- first contribution tips

## Usage Example

```text
packsmith install onboarding-guide
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
