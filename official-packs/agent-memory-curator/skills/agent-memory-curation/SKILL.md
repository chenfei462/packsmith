---
name: agent-memory-curation
description: Summarizes durable project context for reuse across agent sessions without preserving noisy history.
---

# Agent Memory Curator

Use this skill when a project needs durable context, handoff notes, or memory updates for future agent sessions.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Summarizes durable project context for reuse across agent sessions without preserving noisy history.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify facts that will remain useful across sessions: architecture, commands, decisions, constraints, and pitfalls.
2. Discard transient logs, completed minutiae, and speculation unless it affects future work.
3. Write memory as concise, verifiable statements with file or command anchors where possible.
4. Separate durable context from open questions and next actions.
5. Keep sensitive data and private credentials out of memory.

## Output Format

Return:

- durable facts
- decisions
- commands
- pitfalls
- open questions

## Usage Example

```text
packsmith install agent-memory-curator
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
