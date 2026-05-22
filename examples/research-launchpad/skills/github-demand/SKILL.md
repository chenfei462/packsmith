---
name: github-demand
description: Research GitHub demand signals, active issues, and trend velocity before committing to a product direction.
---

# GitHub Demand

Use this skill when a project idea needs evidence from GitHub rather than intuition.

## When to use

- Early product discovery
- Market sizing or category proof
- Narrowing a vague idea into a first MVP thesis

## Inputs

- A draft product idea
- 2-4 GitHub topics, repos, or issues to inspect
- A date range when "recent" matters

## Output format

- one-sentence thesis
- 3-5 demand signals
- 2-3 user pains
- one MVP recommendation

## Naming convention

- Use one skill directory per research motion
- Keep the skill id short and kebab-case, like `github-demand`
- Keep the prompt file name aligned with the action, like `launch.md`

## Copyable structure

```text
examples/research-launchpad/
  packsmith.json
  skills/github-demand/SKILL.md
  prompts/launch.md
```

## Workflow

1. Start from trending repos and topic pages.
2. Look for repositories with strong star velocity or fast issue growth.
3. Read open issues to identify repeated workflow pain.
4. Separate category proof from unsolved workflow gaps.
5. End with one narrow product recommendation, not a vague market map.

## Rules

- Prefer primary GitHub sources.
- Include exact dates when calling something "latest" or "recent".
- Distinguish evidence from inference.
