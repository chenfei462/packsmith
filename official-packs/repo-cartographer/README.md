# Repo Cartographer

Maps architecture, entry points, module boundaries, data flow, and high-risk areas in unfamiliar repositories.

## When To Use

Use this skill when entering an unfamiliar repository or before making changes across unknown boundaries.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview repo-cartographer
node src/cli.mjs install repo-cartographer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview repo-cartographer
packsmith install repo-cartographer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the repo-cartographer pack for this task.
```

## Expected Output

- entry points
- module map
- data flow
- test/build commands
- risk areas

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
