# Frontend State Debugger

Use the Frontend State Debugger pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when UI state is stale, duplicated, flickering, reset unexpectedly, or out of sync.

Follow this sequence:

1. Trace the user event that changes state.
2. Separate source state from derived state and cached server state.
3. Find effects, subscriptions, and persistence code that can race.
4. Recommend a minimal reproduction and one state ownership fix.

## Output Format

Return:

- state flow
- race or ownership issue
- reproduction
- fix direction
