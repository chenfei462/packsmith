---
name: repo-map
description: Maps architecture, entry points, module boundaries, data flow, and high-risk areas in unfamiliar repositories.
---

# Repo Cartographer

Use this skill when entering an unfamiliar repository or before making changes across unknown boundaries.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Maps architecture, entry points, module boundaries, data flow, and high-risk areas in unfamiliar repositories.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Read top-level docs, package manifests, build files, and main entry points.
2. Identify runtime boundaries, command surfaces, source directories, tests, and generated assets.
3. Trace one representative user journey from command or request to output.
4. Name high-risk areas where changes could have broad impact.
5. Finish with a compact map a contributor can use immediately.

## Output Format

Return:

- entry points
- module map
- data flow
- test/build commands
- risk areas

## Usage Example

```text
packsmith install repo-cartographer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
