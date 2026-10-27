# Skill Author

Helps users turn repeated agent workflows into clear triggers, examples, and output formats.

## When To Use

Use this skill when creating a new Packsmith or agent skill from a repeated workflow.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview skill-author
node src/cli.mjs install skill-author --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview skill-author
packsmith install skill-author --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the skill-author pack for this task.
```

## Expected Output

- skill name
- trigger conditions
- SKILL.md content
- usage example
- quality checklist

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
