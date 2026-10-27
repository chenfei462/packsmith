# Competitor Breakdown

Compares a project against competitors and identifies practical differentiation.

## When To Use

Use this skill when users need to understand alternatives, differentiation, pricing, capabilities, or launch positioning.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview competitor-breakdown
node src/cli.mjs install competitor-breakdown --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview competitor-breakdown
packsmith install competitor-breakdown --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the competitor-breakdown pack for this task.
```

## Expected Output

- competitor set
- comparison matrix
- differentiators
- risks
- recommended positioning

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
