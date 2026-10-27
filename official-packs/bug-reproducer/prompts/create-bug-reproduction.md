# Bug Reproducer

Use the Bug Reproducer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when a bug report is unclear, intermittent, or missing a minimal test case.

Follow this sequence:

1. Restate the observed behavior and expected behavior in one sentence each.
2. Find the smallest input, file, or command that demonstrates the issue.
3. Turn the reproduction into an automated test when the repository has a test runner.
4. Keep implementation fixes out of scope until the failing reproduction is visible.

## Output Format

Return:

- reproduction steps
- minimal fixture
- failing test proposal
- remaining unknowns
