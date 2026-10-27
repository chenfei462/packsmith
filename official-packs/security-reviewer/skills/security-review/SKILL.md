---
name: security-review
description: Checks secrets, unsafe commands, injection risks, dependency exposure, and permission expansion.
---

# Security Reviewer

Use this skill when a change touches auth, secrets, shell execution, parsing, permissions, dependencies, or deployment configuration.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Checks secrets, unsafe commands, injection risks, dependency exposure, and permission expansion.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Inventory new inputs, privileges, network calls, filesystem writes, and command execution paths.
2. Scan for hardcoded secrets, unsafe interpolation, weak validation, and unexpected trust boundary changes.
3. Review dependency and script changes for postinstall hooks, risky licenses, and expanded runtime surface.
4. Distinguish exploitable findings from hygiene concerns and explain the attack path.
5. End with concrete mitigations and verification commands.

## Output Format

Return:

- critical security findings
- attack scenario
- affected surface
- recommended mitigation
- verification steps

## Usage Example

```text
packsmith install security-reviewer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
