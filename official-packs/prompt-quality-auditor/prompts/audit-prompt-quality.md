# Prompt Quality Auditor

Use the Prompt Quality Auditor pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when editing agent prompts, skill files, system guidance, or workflow instructions.

Follow this sequence:

1. Check whether the trigger condition is specific enough.
2. Find contradictory instructions, vague output requirements, and hidden assumptions.
3. Reduce broad personality or process text that does not affect outcomes.
4. Return a cleaner prompt structure with before-and-after risk notes.

## Output Format

Return:

- prompt risks
- specific rewrites
- scope notes
- expected output format
