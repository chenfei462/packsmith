# Refactor Planner

Turns messy code areas into safe staged refactor plans with boundaries, tests, and rollback points.

## When To Use

Use this skill when code is difficult to change and the user wants a safe cleanup plan before editing.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview refactor-planner
node src/cli.mjs install refactor-planner --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview refactor-planner
packsmith install refactor-planner --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the refactor-planner pack for this task.
```

## Expected Output

- current pain points
- protected behavior
- staged plan
- risk checkpoints
- first step

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
