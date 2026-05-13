# Runtime Assumptions

Date: May 13, 2026

This document records the concrete runtime assumptions Packsmith is built around today, plus the evidence behind them.

The point is not to pretend these integrations are perfectly stable. The point is to make the current contract explicit, so future changes are easy to audit.

## Claude Code

### Skill file format

Packsmith validates `SKILL.md` frontmatter because Anthropic's public `anthropics/skills` repository defines a basic skill as a folder containing `SKILL.md` with YAML frontmatter, and says the required fields are:

- `name`
- `description`

That same README also says `name` should be lowercase and use hyphens for spaces.

Evidence:

- https://github.com/anthropics/skills
- https://docs.claude.com/en/docs/claude-code/skills

### Skill install locations

Packsmith supports two Claude Code install scopes:

- user scope: `~/.claude/skills/`
- project scope: `.claude/skills/`

This assumption is directly backed by Anthropic's official Claude Code Skills documentation, which describes:

- Personal Skills in `~/.claude/skills/`
- Project Skills in `.claude/skills/`
- Plugin Skills bundled with installed plugins

The same page also uses those exact paths again in its debug and troubleshooting examples.

Packsmith additionally pays attention to public Claude Code issues showing that:

- user skills in `~/.claude/skills/` are treated as a first-class runtime surface
- plugin-loaded skills and directly installed user skills can behave differently in practice, which is one reason Packsmith prefers explicit filesystem bundles over marketplace assumptions for now
- the plugin layout expected by Claude Code includes a `skills/` directory

Evidence:

- https://docs.claude.com/en/docs/claude-code/skills
- https://github.com/anthropics/claude-code/issues/11620
- https://github.com/anthropics/claude-code/issues/18949
- https://github.com/anthropics/skills/issues/67

### Why Packsmith mirrors metadata under `.claude/packsmith/`

`.claude/skills/` is the runtime-facing location for skill directories, but it is not a great place to keep Packsmith's own bundle metadata mixed into skill folders.

So Packsmith mirrors install metadata under:

- user scope: `~/.claude/packsmith/<pack-name>/`
- project scope: `.claude/packsmith/<pack-name>/`

This is a Packsmith design decision, not a documented Claude Code standard.

It enables:

- `list`
- `doctor`
- `uninstall`

without mutating the runtime-facing skill folder layout.

### Why scoped installs reject skill-name collisions

Claude Code discovers skills by directory name under `.claude/skills/`.

That means two packs trying to install the same skill directory name into the same scope would create an ownership conflict. Packsmith treats that as an error instead of allowing a silent overwrite.

This is a Packsmith safety decision, not a first-party Claude Code rule.

It is meant to protect three things:

- one pack should not silently replace another pack's skill contents
- `uninstall` should only remove skills owned by the pack being removed
- `list` and `doctor` should reflect deterministic ownership

## Codex

### Why Packsmith emits `AGENTS.md`

Packsmith's Codex bundle includes an `AGENTS.md` bridge because OpenAI's Codex guidance explicitly treats `AGENTS.md` as a place for persistent project instructions and repo context.

Evidence:

- https://openai.com/index/introducing-codex/
- https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf

### Why Codex installs still use explicit `--dest`

Unlike Claude Code, Packsmith does not currently claim a single stable global install directory for Codex.

That is intentional.

The direct evidence we have today is about `AGENTS.md` as persistent repo context, not about a Packsmith-style global skill installation surface. OpenAI's public materials talk about repository instructions and Codex home-level agent files, but do not define a Packsmith-style shared skills directory contract. So Codex support remains repo-oriented:

- build a Codex bundle
- copy it somewhere explicit with `--dest`
- use `AGENTS.md` as the bridge artifact

This is an inference from the available documentation, not a guaranteed Codex runtime contract.

Additional evidence:

- https://openai.com/index/unrolling-the-codex-agent-loop/

## What would change these assumptions

Packsmith should revisit this document if any of the following happen:

- Anthropic publishes a stable first-party skills install/reference page with different paths or metadata expectations
- OpenAI publishes a stronger Codex package-install story than repo-level `AGENTS.md`
- Claude Code starts requiring additional frontmatter fields for local skills
- Claude Code or Codex add first-party install/list/uninstall primitives that make Packsmith's mirrored metadata unnecessary
