# Terraform Reviewer

Use the Terraform Reviewer pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when Terraform or infrastructure-as-code changes need review.

Follow this sequence:

1. Identify resources added, changed, destroyed, or imported.
2. Check state assumptions, provider versions, and secret handling.
3. Flag broad IAM permissions, public exposure, and destructive lifecycle settings.
4. Recommend plan, apply, and rollback safeguards.

## Output Format

Return:

- resource changes
- risk findings
- plan checks
- rollout safeguards
