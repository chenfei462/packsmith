---
name: readme-conversion
description: Turns technical READMEs into user-facing landing READMEs grounded in real commands.
---

# README Converter

Use this skill when a README explains internals before the user understands why to install or try the project.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Turns technical READMEs into user-facing landing READMEs grounded in real commands.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Extract the user promise, primary audience, and first useful command from the current project.
2. Move implementation detail below quick-start and concrete workflows.
3. Remove claims for features that are not implemented or verified.
4. Add install, search/use, examples, supported targets, and status sections.
5. Keep links to deeper docs without making the first page abstract.

## Output Format

Return:

- new opening
- quick-start commands
- feature/status sections
- removed/softened claims
- follow-up docs

## Usage Example

```text
packsmith install readme-converter
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
