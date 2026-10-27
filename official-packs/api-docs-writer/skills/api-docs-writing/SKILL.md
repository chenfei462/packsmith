---
name: api-docs-writing
description: Produces API reference docs from source, tests, command behavior, and examples.
---

# API Docs Writer

Use this skill when public APIs, CLI commands, exported modules, or schemas need accurate reference documentation.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Produces API reference docs from source, tests, command behavior, and examples.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Extract public surfaces from source, tests, exports, schemas, or command help.
2. Document inputs, outputs, defaults, errors, and examples for each surface.
3. Check docs against actual behavior rather than inferred intent.
4. Separate stable public APIs from internal helpers.
5. Add version or compatibility notes where behavior may change.

## Output Format

Return:

- API inventory
- reference entries
- examples
- errors/defaults
- stability notes

## Usage Example

```text
packsmith install api-docs-writer
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
