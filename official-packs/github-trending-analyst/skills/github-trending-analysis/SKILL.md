---
name: github-trending-analysis
description: Studies GitHub trends and converts repository momentum into product opportunities.
---

# GitHub Trending Analyst

Use this skill when a product idea depends on current open-source momentum, active issues, or developer adoption signals.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Studies GitHub trends and converts repository momentum into product opportunities.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Gather repository stars, forks, issue velocity, release cadence, contributor activity, and discussion themes.
2. Compare momentum across adjacent projects instead of relying on one vanity metric.
3. Extract repeated pain points, integration gaps, and language developers use.
4. Name opportunities that are actionable for the current product scope.
5. State evidence freshness and uncertainty clearly.

## Output Format

Return:

- trend summary
- evidence table
- developer pain points
- opportunity ideas
- confidence level

## Usage Example

```text
packsmith install github-trending-analyst
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
