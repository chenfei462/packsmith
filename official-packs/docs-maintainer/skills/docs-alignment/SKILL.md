---
name: docs-alignment
description: Keeps README, changelog, examples, and command docs aligned with implementation.
---

# Docs Maintainer

Use this skill when code behavior, commands, config, examples, or release status changed and docs may be stale.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Keeps README, changelog, examples, and command docs aligned with implementation.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Read the implementation or tests before editing docs.
2. Find command examples, README claims, changelog entries, and linked docs that mention the changed behavior.
3. Update docs to describe what works now and mark deferred features honestly.
4. Prefer runnable commands and concrete examples over roadmap language.
5. Report docs changed and any docs intentionally left alone.

## Output Format

Return:

- stale claims found
- docs updated
- commands verified
- deferred claims
- remaining doc gaps

## Usage Example

```text
packsmith install docs-maintainer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
