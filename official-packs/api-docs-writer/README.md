# API Docs Writer

Produces API reference docs from source, tests, command behavior, and examples.

## When To Use

Use this skill when public APIs, CLI commands, exported modules, or schemas need accurate reference documentation.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview api-docs-writer
node src/cli.mjs install api-docs-writer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview api-docs-writer
packsmith install api-docs-writer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the api-docs-writer pack for this task.
```

## Expected Output

- API inventory
- reference entries
- examples
- errors/defaults
- stability notes

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
