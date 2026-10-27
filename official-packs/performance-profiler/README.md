# Performance Profiler

Identifies obvious performance bottlenecks and suggests measurable improvements.

## When To Use

Use this skill when a workflow is slow, memory-heavy, chatty, or suspected of doing unnecessary repeated work.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview performance-profiler
node src/cli.mjs install performance-profiler --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview performance-profiler
packsmith install performance-profiler --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the performance-profiler pack for this task.
```

## Expected Output

- performance hypothesis
- evidence
- low-risk improvements
- measurement plan
- risks

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
