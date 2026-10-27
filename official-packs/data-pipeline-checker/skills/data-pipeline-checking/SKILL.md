---
name: data-pipeline-checking
description: Reviews data pipeline changes for schema drift, idempotency, backfills, and observability.
---

# Data Pipeline Checker

Use this skill when batch jobs, ETL scripts, streams, or analytics transformations change.

## Workflow

1. Trace inputs, outputs, schema assumptions, and ownership of derived data.
2. Check idempotency, late-arriving data, retries, and backfill behavior.
3. Flag silent data loss, duplication, and observability gaps.
4. Recommend validation queries or fixture checks.

## Return

- data flow
- schema risks
- operational risks
- validation checks

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
