# Contributing Guide Writer

Creates contributor instructions for setup, tests, style, pull requests, and review expectations.

## When To Use

Use this skill when a repository needs a CONTRIBUTING guide or its existing contributor docs are stale.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview contributing-guide-writer
node src/cli.mjs install contributing-guide-writer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview contributing-guide-writer
packsmith install contributing-guide-writer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the contributing-guide-writer pack for this task.
```

## Expected Output

- setup commands
- development workflow
- testing expectations
- PR checklist
- style and docs notes

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
