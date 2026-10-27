# Agent Memory Curator

Summarizes durable project context for reuse across agent sessions without preserving noisy history.

## When To Use

Use this skill when a project needs durable context, handoff notes, or memory updates for future agent sessions.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview agent-memory-curator
node src/cli.mjs install agent-memory-curator --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview agent-memory-curator
packsmith install agent-memory-curator --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the agent-memory-curator pack for this task.
```

## Expected Output

- durable facts
- decisions
- commands
- pitfalls
- open questions

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
