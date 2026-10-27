# Security Reviewer

Checks secrets, unsafe commands, injection risks, dependency exposure, and permission expansion.

## When To Use

Use this skill when a change touches auth, secrets, shell execution, parsing, permissions, dependencies, or deployment configuration.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview security-reviewer
node src/cli.mjs install security-reviewer --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview security-reviewer
packsmith install security-reviewer --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the security-reviewer pack for this task.
```

## Expected Output

- critical security findings
- attack scenario
- affected surface
- recommended mitigation
- verification steps

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
