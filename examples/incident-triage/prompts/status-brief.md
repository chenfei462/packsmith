# Incident Status Brief

Turn raw debugging notes into a concise status update for stakeholders.

## When to use

- You already have incident notes and need a stakeholder update
- The audience does not need debugging detail
- The goal is status, not root cause speculation

## Inputs

- Current status
- Customer impact
- Confirmed facts
- Active investigation path
- Next update time

## Output format

- current status
- customer impact
- confirmed facts
- active investigation path
- next update time

## Naming convention

- Use a short file name that matches the handoff artifact
- Keep the prompt name descriptive and executable, like `status-brief.md`

## Copyable structure

```text
examples/incident-triage/
  packsmith.json
  skills/service-triage/SKILL.md
  prompts/status-brief.md
```

Return:
the fields listed in the output format above.

Constraints:

- Keep it under 120 words.
- Do not promise a root cause unless one is confirmed.
- Distinguish mitigation from resolution.
