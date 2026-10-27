# Migration Planner

Use the Migration Planner pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when the user needs to migrate frameworks, schemas, APIs, packages, or runtime conventions.

Follow this sequence:

1. State the current and target states precisely.
2. Split the migration into reversible stages with checkpoints.
3. Find compatibility bridges and dual-read or dual-write periods where relevant.
4. Define verification, monitoring, and rollback for each stage.

## Output Format

Return:

- migration stages
- compatibility plan
- verification checks
- rollback notes
