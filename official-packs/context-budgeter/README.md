# Context Budgeter

Reduces long agent instructions while preserving important behavior and output contracts.

## When To Use

Use this skill when instructions, docs, prompts, or skills are too long for efficient agent use.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview context-budgeter
node src/cli.mjs install context-budgeter --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview context-budgeter
packsmith install context-budgeter --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the context-budgeter pack for this task.
```

## Expected Output

- compressed instructions
- preserved requirements
- removed content
- risk notes
- before/after size

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
