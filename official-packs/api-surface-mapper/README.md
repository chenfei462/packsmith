# API Surface Mapper

Documents public APIs, internal APIs, contracts, and compatibility risks.

## When To Use

Use this skill when public functions, CLI commands, HTTP endpoints, events, or package exports need to be understood.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview api-surface-mapper
node src/cli.mjs install api-surface-mapper --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview api-surface-mapper
packsmith install api-surface-mapper --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the api-surface-mapper pack for this task.
```

## Expected Output

- public APIs
- internal APIs
- contracts
- compatibility risks
- doc/test gaps

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
