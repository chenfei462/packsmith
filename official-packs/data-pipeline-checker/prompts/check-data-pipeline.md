# Data Pipeline Checker

Use the Data Pipeline Checker pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when batch jobs, ETL scripts, streams, or analytics transformations change.

Follow this sequence:

1. Trace inputs, outputs, schema assumptions, and ownership of derived data.
2. Check idempotency, late-arriving data, retries, and backfill behavior.
3. Flag silent data loss, duplication, and observability gaps.
4. Recommend validation queries or fixture checks.

## Output Format

Return:

- data flow
- schema risks
- operational risks
- validation checks
