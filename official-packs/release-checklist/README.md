# Release Checklist

Produces release readiness checklists for npm, GitHub, docs, tests, and smoke checks.

## When To Use

Use this skill before publishing a package, tagging a release, or announcing shipped behavior.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview release-checklist
node src/cli.mjs install release-checklist --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview release-checklist
packsmith install release-checklist --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the release-checklist pack for this task.
```

## Expected Output

- pre-release checks
- packaging checks
- publish commands
- post-release checks
- known blockers

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
