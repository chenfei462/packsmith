# Release Note Writer

Use the Release Note Writer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when preparing a release, changelog entry, or user-facing update summary.

Follow this sequence:

1. Group changes by user-facing value rather than commit order.
2. Identify migrations, breaking changes, and deprecations.
3. Translate internal implementation details into outcomes.
4. List verification and publish notes separately from user notes.

## Output Format

Return:

- highlights
- breaking changes
- fixes
- upgrade notes
