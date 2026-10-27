---
name: dependency-audit
description: Reviews dependency usage, risk, update pressure, and unnecessary packages.
---

# Dependency Auditor

Use this skill when dependencies change, dependency risk is unclear, or a project feels heavier than needed.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Reviews dependency usage, risk, update pressure, and unnecessary packages.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Inspect manifests, lockfiles, imports, scripts, and bundled runtime assumptions.
2. Classify dependencies by direct use, transitive risk, update pressure, and replacement difficulty.
3. Flag unnecessary packages, abandoned packages, postinstall behavior, and license uncertainty.
4. Avoid recommending upgrades without compatibility and test considerations.
5. Produce a prioritized dependency action list.

## Output Format

Return:

- dependency inventory
- risk findings
- upgrade pressure
- removal candidates
- verification plan

## Usage Example

```text
packsmith install dependency-auditor
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
