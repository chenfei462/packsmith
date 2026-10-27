---
name: api-surface-map
description: Documents public APIs, internal APIs, contracts, and compatibility risks.
---

# API Surface Mapper

Use this skill when public functions, CLI commands, HTTP endpoints, events, or package exports need to be understood.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Documents public APIs, internal APIs, contracts, and compatibility risks.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. List exported modules, command names, endpoints, schemas, and documented public contracts.
2. Trace which APIs are used internally versus externally documented.
3. Identify input/output shapes, errors, versioning assumptions, and compatibility risks.
4. Mark unstable or private surfaces clearly.
5. Recommend docs or tests needed to protect the API.

## Output Format

Return:

- public APIs
- internal APIs
- contracts
- compatibility risks
- doc/test gaps

## Usage Example

```text
packsmith install api-surface-mapper
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
