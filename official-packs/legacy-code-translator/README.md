# Legacy Code Translator

Explains old or unclear code in modern actionable language without changing behavior.

## When To Use

Use this skill when code is old, idiomatic to an unfamiliar stack, underdocumented, or hard to safely modify.

## Install

From this repository before npm publication:

```bash
node src/cli.mjs preview legacy-code-translator
node src/cli.mjs install legacy-code-translator --target codex --dry-run
```

After npm publication or global install:

```bash
packsmith preview legacy-code-translator
packsmith install legacy-code-translator --target codex --yes
```

## Trigger

Ask your agent:

```text
Use the legacy-code-translator pack for this task.
```

## Expected Output

- plain-language explanation
- important assumptions
- risky couplings
- safe next step
- questions

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
