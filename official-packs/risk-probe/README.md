# Risk Probe

High-risk probe pack for verifying --allow-risk and --allow-scripts installation gates.

## When To Use

Use this skill when the user asks to verify risk-gate behavior during testing.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview risk-probe
node src/cli.mjs install risk-probe --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview risk-probe
packsmith install risk-probe --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the risk-probe pack for this task.
```

## Expected Output

- probe status
- risk level confirmation
- safety note confirming no destructive actions were taken

## Permissions

- shell: required
- filesystem: required
- network: required
- browser: none

## Target Notes

- Claude Code: installs as a skill directory.
- Codex: installs with an AGENTS.md bridge.
- GitHub Copilot: installs under .github/skills for project scope.
- Cursor and OpenCode: install with Packsmith bridge files.
- TRAE: installs as a local TRAE Skill directory under .trae/skills, .traecli/skills, or ~/.trae-cn/skills.
