---
name: security-pass
description: Review repository changes for secrets, unsafe scripts, dangerous commands, and risky automation.
---

# Security Pass

Use this skill when the user asks whether a change is safe to run, publish, install, or automate.

## Workflow

1. Inspect changed scripts, package manifests, workflows, install hooks, and generated files.
2. Look for secrets, credential paths, token leaks, unsafe shell commands, destructive file operations, and network side effects.
3. Check dependency or registry changes for new supply-chain exposure.
4. Separate confirmed issues from hardening suggestions.
5. Recommend the smallest safe fix.

## Output

Return:

- confirmed security findings
- risky permissions or commands
- files requiring review
- safe-to-run recommendation
- follow-up checks

## Rules

- Treat install scripts, shell commands, and generated workflow files as high-risk surfaces.
- Do not claim a dependency is safe without evidence.
- Include exact file references when possible.
