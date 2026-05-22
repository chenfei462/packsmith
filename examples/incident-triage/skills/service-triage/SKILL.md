---
name: service-triage
description: Triage a production issue by separating evidence, blast radius, hypotheses, and next actions.
---

# Service Triage

Use this skill when a service is failing and the team needs structure before random fixes start piling up.

## When to use

- A production incident is active
- The team needs a fast triage plan before debugging expands
- Someone must turn logs and symptoms into a crisp next step

## Inputs

- User-visible symptom
- Timestamp range
- Blast radius and affected systems
- Recent deploy or config changes

## Output format

- incident summary
- blast radius
- confirmed evidence
- top 3 hypotheses
- next action

## Naming convention

- Use a single skill per operational workflow
- Prefer a noun phrase id like `service-triage`
- Keep the related prompt name aligned with the handoff artifact, like `status-brief.md`

## Copyable structure

```text
examples/incident-triage/
  packsmith.json
  skills/service-triage/SKILL.md
  prompts/status-brief.md
```

## Workflow

1. Restate the user-visible symptom and the exact timestamp range.
2. Record the blast radius: which routes, jobs, customers, or environments are affected.
3. Separate confirmed evidence from hypotheses.
4. Identify the most likely failing boundary: client, API, worker, database, queue, or third-party dependency.
5. End with one owner-ready next step, not a vague debugging brainstorm.

## Rules

- Use exact timestamps when describing events.
- Prefer logs, metrics, traces, and recent deploy history over speculation.
- If evidence is weak, say that directly.
