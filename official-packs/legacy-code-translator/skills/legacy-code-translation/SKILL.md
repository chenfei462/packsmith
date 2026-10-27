---
name: legacy-code-translation
description: Explains old or unclear code in modern actionable language without changing behavior.
---

# Legacy Code Translator

Use this skill when code is old, idiomatic to an unfamiliar stack, underdocumented, or hard to safely modify.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Explains old or unclear code in modern actionable language without changing behavior.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Read the code with its callers, tests, and surrounding domain terms.
2. Translate control flow, data mutations, and hidden assumptions into plain language.
3. Identify behavior that looks strange but may be intentional.
4. Point out coupling and risks without proposing a rewrite by default.
5. Suggest the safest next documentation, test, or refactor step.

## Output Format

Return:

- plain-language explanation
- important assumptions
- risky couplings
- safe next step
- questions

## Usage Example

```text
packsmith install legacy-code-translator
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
