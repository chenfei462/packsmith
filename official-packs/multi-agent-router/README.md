# Multi-Agent Router

Chooses which local agent, skill, or workflow should handle a task based on context and risk.

## When To Use

Use this skill when a task could be handled by several agents or skills and the user needs a routing decision.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview multi-agent-router
node src/cli.mjs install multi-agent-router --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview multi-agent-router
packsmith install multi-agent-router --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the multi-agent-router pack for this task.
```

## Expected Output

- task classification
- recommended agent or skill
- fallback
- verification plan
- routing rationale

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
