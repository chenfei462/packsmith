# Test Writer

Adds focused tests for recent code changes, edge cases, and regressions without bloating the suite.

## When To Use

Use this skill when behavior changed, a bug was fixed, coverage is missing, or a reviewer asks for stronger tests.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview test-writer
node src/cli.mjs install test-writer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview test-writer
packsmith install test-writer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the test-writer pack for this task.
```

## Expected Output

- test intent
- new or changed test cases
- fixtures used
- commands run
- remaining gaps

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
