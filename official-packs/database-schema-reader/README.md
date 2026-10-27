# Database Schema Reader

Explains schema structure, migrations, relationships, indexes, and risky data changes.

## When To Use

Use this skill when database migrations, schema files, ORM models, or data relationships need review.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview database-schema-reader
node src/cli.mjs install database-schema-reader --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview database-schema-reader
packsmith install database-schema-reader --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the database-schema-reader pack for this task.
```

## Expected Output

- entity map
- relationships
- migration risks
- index/constraint notes
- verification checks

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
