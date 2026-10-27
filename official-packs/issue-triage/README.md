# Issue Triage

Groups issues by severity, effort, product value, and release relevance.

## When To Use

Use this skill when a backlog, GitHub issue list, or launch bug pile needs prioritization.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview issue-triage
node src/cli.mjs install issue-triage --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview issue-triage
packsmith install issue-triage --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the issue-triage pack for this task.
```

## Expected Output

- triage groups
- severity/effort/value
- release blockers
- duplicates
- next actions

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
