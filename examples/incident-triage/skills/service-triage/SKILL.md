---
name: service-triage
description: Triage a production issue by separating evidence, blast radius, hypotheses, and next actions.
---

# Service Triage

Use this skill when a service is failing and the team needs structure before random fixes start piling up.

## Workflow

1. Restate the user-visible symptom and the exact timestamp range.
2. Record the blast radius: which routes, jobs, customers, or environments are affected.
3. Separate confirmed evidence from hypotheses.
4. Identify the most likely failing boundary: client, API, worker, database, queue, or third-party dependency.
5. End with one owner-ready next step, not a vague debugging brainstorm.

## Output

- incident summary
- blast radius
- confirmed evidence
- top 3 hypotheses
- next action

## Rules

- Use exact timestamps when describing events.
- Prefer logs, metrics, traces, and recent deploy history over speculation.
- If evidence is weak, say that directly.
