---
name: api-contract-review
description: Reviews API changes for compatibility, validation, errors, and migration risk.
---

# API Contract Reviewer

Use this skill when reviewing REST, GraphQL, RPC, CLI, or module API changes.

## Workflow

1. Identify public inputs, outputs, status codes, and documented guarantees.
2. Check backward compatibility for removed fields, renamed values, and stricter validation.
3. Review error shape consistency and migration messaging.
4. Recommend tests that prove old and new callers behave correctly.

## Return

- compatibility findings
- validation gaps
- error contract notes
- test recommendations

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
