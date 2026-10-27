# Dependency Upgrader

Use the Dependency Upgrader pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when the user wants to upgrade dependencies, assess version risk, or prepare a dependency update PR.

Follow this sequence:

1. Inventory direct and transitive dependencies relevant to the requested change.
2. Group upgrades into small batches by runtime, framework, and risk.
3. Identify breaking-change notes, lockfile effects, and compatibility checks.
4. Return exact verification commands and rollback notes.

## Output Format

Return:

- upgrade batches
- risk notes
- test commands
- rollback plan
