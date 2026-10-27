# PR Description Writer

Use the PR Description Writer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when the user is about to open or update a pull request.

Follow this sequence:

1. Summarize user-visible behavior and important implementation choices.
2. List tests or smoke checks that actually ran.
3. Call out risks, migrations, and follow-up work honestly.
4. Keep reviewer instructions short and actionable.

## Output Format

Return:

- summary
- test plan
- risk notes
- review focus
