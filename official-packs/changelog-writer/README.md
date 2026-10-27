# Changelog Writer

Turns commits, diffs, or release notes into clear user-facing changelog entries.

## When To Use

Use this skill when preparing a release, summarizing merged work, or converting technical diffs into user-facing notes.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview changelog-writer
node src/cli.mjs install changelog-writer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview changelog-writer
packsmith install changelog-writer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the changelog-writer pack for this task.
```

## Expected Output

- added
- changed
- fixed
- breaking or migration notes
- verification notes

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
