---
name: accessibility-audit
description: Reviews UI changes for keyboard flow, labels, contrast, focus, and assistive technology basics.
---

# Accessibility Auditor

Use this skill when the user changes UI components, forms, dialogs, navigation, or interactive controls.

## Workflow

1. Trace the keyboard path through the changed surface.
2. Check semantic labels, roles, disabled states, and error messages.
3. Flag contrast, focus visibility, target size, and reduced-motion risks.
4. Map findings to concrete code or design changes.

## Return

- accessibility findings
- severity
- affected users
- recommended fixes

## Runtime Notes

- Claude Code: installed as a skill directory and triggered by this SKILL.md.
- Codex: installed with an AGENTS.md bridge that lists this skill.
- OpenCode: installed with PACKSMITH.md bridge notes beside copied assets.
- Cursor: installed with a generated .mdc rule that points to copied assets.
