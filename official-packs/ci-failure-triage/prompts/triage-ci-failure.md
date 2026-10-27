# CI Failure Triage

Use the CI Failure Triage pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when the user shares CI output, a failing workflow, or asks why a pipeline is red.

Follow this sequence:

1. Separate infrastructure failures from test, lint, build, and packaging failures.
2. Extract the first meaningful error and every affected job name.
3. Compare CI-only environment assumptions with local scripts.
4. Suggest one minimal reproduction command before proposing code changes.

## Output Format

Return:

- failing job
- first useful error
- likely root cause
- local reproduction command
