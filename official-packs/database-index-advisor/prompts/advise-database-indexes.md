# Database Index Advisor

Use the Database Index Advisor pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when a user asks about slow queries, schema changes, or database index design.

Follow this sequence:

1. Identify query filters, joins, ordering, cardinality, and write frequency.
2. Suggest indexes only when they match a demonstrated access pattern.
3. Call out write amplification, locking, and migration risks.
4. Require measurement before and after any proposed index change.

## Output Format

Return:

- query pattern
- index recommendation
- risk tradeoffs
- measurement plan
