# Test Fixture Designer

Use the Test Fixture Designer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when tests need sample files, factory data, temp directories, or stable setup helpers.

Follow this sequence:

1. Identify the behavior the fixture must make visible.
2. Keep fixture data small, named, and realistic enough to explain failures.
3. Avoid hidden coupling between tests through shared mutable fixtures.
4. Document how to update fixtures when behavior changes.

## Output Format

Return:

- fixture shape
- test cases covered
- maintenance notes
- anti-coupling checks
