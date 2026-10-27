# Launch Researcher

Converts market signals into positioning, wedge, audience, and launch recommendations.

## When To Use

Use this skill when preparing a product launch, validating a wedge, or turning raw demand signals into a plan.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview launch-researcher
node src/cli.mjs install launch-researcher --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview launch-researcher
packsmith install launch-researcher --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the launch-researcher pack for this task.
```

## Expected Output

- audience
- demand evidence
- positioning
- launch wedge
- next experiments

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
