# GitHub Trending Analyst

Studies GitHub trends and converts repository momentum into product opportunities.

## When To Use

Use this skill when a product idea depends on current open-source momentum, active issues, or developer adoption signals.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview github-trending-analyst
node src/cli.mjs install github-trending-analyst --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview github-trending-analyst
packsmith install github-trending-analyst --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the github-trending-analyst pack for this task.
```

## Expected Output

- trend summary
- evidence table
- developer pain points
- opportunity ideas
- confidence level

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
