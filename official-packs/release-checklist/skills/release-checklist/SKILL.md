---
name: release-checklist
description: Produces release readiness checklists for npm, GitHub, docs, tests, and smoke checks.
---

# Release Checklist

Use this skill before publishing a package, tagging a release, or announcing shipped behavior.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Produces release readiness checklists for npm, GitHub, docs, tests, and smoke checks.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify package metadata, version, build artifacts, tests, docs, and credentials needed for release.
2. Separate commands maintainers can run locally from actions requiring registry credentials.
3. Include package dry-runs, smoke tests, changelog checks, and post-publish verification.
4. Call out blockers plainly without claiming publish success.
5. Produce a checklist with exact commands.

## Output Format

Return:

- pre-release checks
- packaging checks
- publish commands
- post-release checks
- known blockers

## Usage Example

```text
packsmith install release-checklist
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
