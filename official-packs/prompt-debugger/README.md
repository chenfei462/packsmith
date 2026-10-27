# Prompt Debugger

Diagnoses vague prompts, conflicting instructions, missing context, and weak output contracts.

## When To Use

Use this skill when an agent prompt produces inconsistent, verbose, unsafe, or unhelpful results.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview prompt-debugger
node src/cli.mjs install prompt-debugger --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview prompt-debugger
packsmith install prompt-debugger --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the prompt-debugger pack for this task.
```

## Expected Output

- diagnosis
- conflicts
- rewritten prompt
- output contract
- test case

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
