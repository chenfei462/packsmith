# Accessibility Auditor

Use the Accessibility Auditor pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when the user changes UI components, forms, dialogs, navigation, or interactive controls.

Follow this sequence:

1. Trace the keyboard path through the changed surface.
2. Check semantic labels, roles, disabled states, and error messages.
3. Flag contrast, focus visibility, target size, and reduced-motion risks.
4. Map findings to concrete code or design changes.

## Output Format

Return:

- accessibility findings
- severity
- affected users
- recommended fixes
