# README Converter

Turns technical READMEs into user-facing landing READMEs grounded in real commands.

## When To Use

Use this skill when a README explains internals before the user understands why to install or try the project.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview readme-converter
node src/cli.mjs install readme-converter --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview readme-converter
packsmith install readme-converter --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the readme-converter pack for this task.
```

## Expected Output

- new opening
- quick-start commands
- feature/status sections
- removed/softened claims
- follow-up docs

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
