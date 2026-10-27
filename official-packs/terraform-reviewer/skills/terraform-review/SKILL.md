---
name: terraform-review
description: Reviews Terraform changes for drift risk, permissions, state, and rollout safety.
---

# Terraform Reviewer

Use this skill when Terraform or infrastructure-as-code changes need review.

## Workflow

1. Identify resources added, changed, destroyed, or imported.
2. Check state assumptions, provider versions, and secret handling.
3. Flag broad IAM permissions, public exposure, and destructive lifecycle settings.
4. Recommend plan, apply, and rollback safeguards.

## Return

- resource changes
- risk findings
- plan checks
- rollout safeguards

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
