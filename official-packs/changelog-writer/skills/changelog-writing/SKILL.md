---
name: changelog-writing
description: Turns commits, diffs, or release notes into clear user-facing changelog entries.
---

# Changelog Writer

Use this skill when preparing a release, summarizing merged work, or converting technical diffs into user-facing notes.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Turns commits, diffs, or release notes into clear user-facing changelog entries.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Gather changed behavior, new commands, fixes, docs updates, and breaking changes from evidence.
2. Group entries by user impact instead of commit chronology.
3. Call out migration notes, compatibility changes, and release blockers.
4. Avoid marketing claims that are not backed by shipped behavior.
5. Write concise bullets suitable for CHANGELOG.md.

## Output Format

Return:

- added
- changed
- fixed
- breaking or migration notes
- verification notes

## Usage Example

```text
packsmith install changelog-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
