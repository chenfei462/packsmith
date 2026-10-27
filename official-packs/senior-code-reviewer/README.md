# Senior Code Reviewer

Finds bugs, regressions, missing tests, risky changes, and unclear behavior before a change ships.

## When To Use

Use this skill when the user asks for a code review, release-readiness check, regression scan, or risk assessment.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview senior-code-reviewer
node src/cli.mjs install senior-code-reviewer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview senior-code-reviewer
packsmith install senior-code-reviewer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the senior-code-reviewer pack for this task.
```

## Expected Output

- severity-ordered findings
- file and line references
- missing test coverage
- residual risk
- brief change summary

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
