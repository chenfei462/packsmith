# Changelog Curator

Use the Changelog Curator pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when a changelog is missing, stale, noisy, or too implementation-heavy.

Follow this sequence:

1. Read recent changes and existing changelog style.
2. Group entries by added, changed, fixed, deprecated, and removed where useful.
3. Mention commands, APIs, and migration actions users care about.
4. Avoid duplicating commit messages without user value.

## Output Format

Return:

- curated entries
- migration notes
- omissions
- source changes reviewed
