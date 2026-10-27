---
name: multi-agent-routing
description: Chooses which local agent, skill, or workflow should handle a task based on context and risk.
---

# Multi-Agent Router

Use this skill when a task could be handled by several agents or skills and the user needs a routing decision.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Chooses which local agent, skill, or workflow should handle a task based on context and risk.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Classify the task by domain, required tools, risk, context size, and output type.
2. Match the task to available agents, skills, or manual steps without over-delegating.
3. Identify prerequisites, blockers, and verification needed after delegation.
4. Recommend a primary route and one fallback route.
5. Keep ownership clear so results can be reviewed.

## Output Format

Return:

- task classification
- recommended agent or skill
- fallback
- verification plan
- routing rationale

## Usage Example

```text
packsmith install multi-agent-router
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
