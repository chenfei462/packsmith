---
name: performance-profiling
description: Identifies obvious performance bottlenecks and suggests measurable improvements.
---

# Performance Profiler

Use this skill when a workflow is slow, memory-heavy, chatty, or suspected of doing unnecessary repeated work.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Identifies obvious performance bottlenecks and suggests measurable improvements.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Define the performance question in measurable terms before optimizing.
2. Find hot loops, repeated I/O, large allocations, network round trips, and avoidable serialization.
3. Prefer measurements, logs, traces, or benchmark commands over intuition.
4. Separate low-risk wins from changes that alter behavior or require load testing.
5. Recommend the smallest measurable change and the before/after metric.

## Output Format

Return:

- performance hypothesis
- evidence
- low-risk improvements
- measurement plan
- risks

## Usage Example

```text
packsmith install performance-profiler
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
