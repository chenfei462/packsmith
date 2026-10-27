# Docs Maintainer

Keeps README, changelog, examples, and command docs aligned with implementation.

## When To Use

Use this skill when code behavior, commands, config, examples, or release status changed and docs may be stale.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview docs-maintainer
node src/cli.mjs install docs-maintainer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview docs-maintainer
packsmith install docs-maintainer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the docs-maintainer pack for this task.
```

## Expected Output

- stale claims found
- docs updated
- commands verified
- deferred claims
- remaining doc gaps

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
