# Maintainer Onboarding Brief

Turn scattered repository context into a first-week brief for a new maintainer.

## When to use

- A new maintainer needs a concise starting point
- You need to turn repo notes into an action list
- The brief must fit into a first week, not a full audit

## Inputs

- Repo documentation
- Release flow
- Incident response path
- Missing documentation list

## Output format

- what this system owns
- how releases happen
- where incidents should be investigated first
- what documentation is missing
- a first-week checklist

## Naming convention

- Use a prompt file name that matches the deliverable
- Keep it short and explicit, like `onboarding-brief.md`

## Copyable structure

```text
examples/maintainer-handoff/
  packsmith.json
  skills/system-handoff/SKILL.md
  prompts/onboarding-brief.md
```

Return:
the fields listed in the output format above.

Constraints:

- Prefer concrete file paths and commands over general advice.
- Distinguish confirmed repo behavior from assumptions.
- Keep the final checklist short enough to execute in one week.
