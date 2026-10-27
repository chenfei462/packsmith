# Onboarding Guide

Explains a new repository for a first-time contributor with real commands and contribution landmarks.

## When To Use

Use this skill when a new contributor needs to understand setup, project shape, and where to make common changes.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview onboarding-guide
node src/cli.mjs install onboarding-guide --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview onboarding-guide
packsmith install onboarding-guide --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the onboarding-guide pack for this task.
```

## Expected Output

- quick setup
- mental model
- common workflows
- important files
- first contribution tips

## Permissions

- shell: optional
- filesystem: required
- network: optional
- browser: none

## Target Notes

- Claude Code: installs as a skill directory.
- Codex: installs with an AGENTS.md bridge.
- GitHub Copilot: installs under .github/skills for project scope.
- Cursor and OpenCode: install with Packsmith bridge files.
- TRAE: installs as a local TRAE Skill directory under .trae/skills, .traecli/skills, or ~/.trae-cn/skills.
