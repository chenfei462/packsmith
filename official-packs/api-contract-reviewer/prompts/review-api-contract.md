# API Contract Reviewer

Use the API Contract Reviewer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when reviewing REST, GraphQL, RPC, CLI, or module API changes.

Follow this sequence:

1. Identify public inputs, outputs, status codes, and documented guarantees.
2. Check backward compatibility for removed fields, renamed values, and stricter validation.
3. Review error shape consistency and migration messaging.
4. Recommend tests that prove old and new callers behave correctly.

## Output Format

Return:

- compatibility findings
- validation gaps
- error contract notes
- test recommendations
