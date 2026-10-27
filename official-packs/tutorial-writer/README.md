# Tutorial Writer

Creates beginner-friendly tutorials from existing examples and verified commands.

## When To Use

Use this skill when a project has examples but new users still need a guided path from zero to success.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview tutorial-writer
node src/cli.mjs install tutorial-writer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview tutorial-writer
packsmith install tutorial-writer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the tutorial-writer pack for this task.
```

## Expected Output

- tutorial goal
- prerequisites
- step-by-step commands
- expected output
- troubleshooting

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
