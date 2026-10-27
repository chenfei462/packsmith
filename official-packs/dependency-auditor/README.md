# Dependency Auditor

Reviews dependency usage, risk, update pressure, and unnecessary packages.

## When To Use

Use this skill when dependencies change, dependency risk is unclear, or a project feels heavier than needed.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview dependency-auditor
node src/cli.mjs install dependency-auditor --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview dependency-auditor
packsmith install dependency-auditor --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the dependency-auditor pack for this task.
```

## Expected Output

- dependency inventory
- risk findings
- upgrade pressure
- removal candidates
- verification plan

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
