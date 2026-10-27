---
name: dependency-risk-audit
description: Reviews dependency additions for maintenance, licensing, security, and bundle risk.
---

# Dependency Risk Auditor

Use this skill when adding or replacing a package, library, action, image, or external tool.

## Workflow

1. Explain why the dependency is needed and what local alternative exists.
2. Check license, maintenance activity, transitive size, and runtime impact.
3. Identify security or supply-chain concerns from install scripts and permissions.
4. Recommend keep, replace, isolate, or remove with evidence.

## Return

- risk summary
- license notes
- maintenance signal
- recommendation

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
