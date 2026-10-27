# Bug Hunter

Reproduces, isolates, and explains bugs before proposing fixes.

## When To Use

Use this skill when the user reports a bug, flaky behavior, failed command, or confusing runtime symptom.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview bug-hunter
node src/cli.mjs install bug-hunter --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview bug-hunter
packsmith install bug-hunter --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the bug-hunter pack for this task.
```

## Expected Output

- reproduction steps
- observed versus expected behavior
- root-cause hypothesis
- evidence
- fix direction

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
