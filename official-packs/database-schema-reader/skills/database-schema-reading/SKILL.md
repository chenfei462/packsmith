---
name: database-schema-reading
description: Explains schema structure, migrations, relationships, indexes, and risky data changes.
---

# Database Schema Reader

Use this skill when database migrations, schema files, ORM models, or data relationships need review.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Explains schema structure, migrations, relationships, indexes, and risky data changes.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Locate schema definitions, migrations, seed data, and data-access code.
2. Summarize core entities, relationships, indexes, constraints, and lifecycle assumptions.
3. Trace risky writes, deletes, backfills, and nullable/default transitions.
4. Call out migration ordering, rollback, and data compatibility concerns.
5. End with safe verification and rollout checks.

## Output Format

Return:

- entity map
- relationships
- migration risks
- index/constraint notes
- verification checks

## Usage Example

```text
packsmith install database-schema-reader
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
