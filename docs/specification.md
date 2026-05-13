# Packsmith Specification

Date: May 13, 2026

## Goal

Create a brand-new open-source repository with a clear shot at developer adoption by solving a visible problem in the fast-growing agent-skills ecosystem.

## Product statement

Packsmith is a pack compiler for agent skills.

It lets a developer define a single source pack of skills and prompts, validate the pack, inspect its context footprint, and build target-specific bundles for different agent runtimes.

## Target user

- developers building reusable skills for Claude Code, Codex, and adjacent agent runtimes
- teams maintaining internal skill packs
- open-source maintainers who want portable distribution instead of runtime-specific folders

## Non-goals for MVP

- remote publishing
- registry hosting
- GUI marketplace
- cloud backend

## MVP commands

### `init <pack-dir>`

Creates:

- `packsmith.json`
- `skills/starter-skill/SKILL.md`
- `prompts/starter-prompt.md`

The generated pack must validate without manual edits.

### `validate <pack-dir>`

Checks:

- manifest exists
- required top-level fields exist
- targets are supported
- skill ids are unique
- prompt ids are unique
- referenced files exist
- every skill directory includes `SKILL.md`

### `inspect <pack-dir>`

Outputs:

- pack name and version
- number of targets
- number of skills
- number of prompts
- estimated context characters from skills and prompts
- per-skill file count and byte count

### `build <pack-dir> [--out dist]`

Outputs:

- `dist/<pack-name>/manifest.json`
- `dist/<pack-name>/catalog.json`
- `dist/<pack-name>/claude-code/`
- `dist/<pack-name>/codex/`

Each target bundle should include:

- copied skill directories
- copied prompts
- a target README
- minimal target metadata

### `install <pack-or-built-dir> --target <name> --dest <dir>`

Outputs:

- accepts either a source pack directory or a prebuilt bundle directory
- copies one built target bundle into a destination directory
- preserves target docs and metadata
- includes top-level `manifest.json` and `catalog.json` in the installed bundle

### `install <pack-or-built-dir> --target claude-code --scope <project|user>`

Outputs:

- installs directly into known Claude Code user or project skill directories
- mirrors Packsmith metadata under `.claude/packsmith/<pack-name>/`
- allows `list`, `doctor`, and `uninstall` to operate from saved metadata

## Supported targets in MVP

### Claude Code

Output should preserve skill directories, support installation guidance for `.claude/skills`, and support direct scoped install flows for:

- `~/.claude/skills/`
- `.claude/skills/`

### Codex

Output should preserve skill directories and generate an `AGENTS.md` bridge file so the pack is still understandable in Codex-oriented workflows.

## Example content

The repo must include realistic example packs:

- `research-launchpad`
- one GitHub-demand research skill
- one launch prompt
- `incident-triage`
- one operational incident-triage skill
- one stakeholder-brief prompt
- `maintainer-handoff`
- one maintainer-handoff skill
- one onboarding-brief prompt

## Acceptance criteria

- repository is a separate git repo
- project has a clear README and product pitch
- a new pack can be scaffolded with one command
- at least one example pack validates successfully
- building the example pack creates target bundles
- installing a built example pack copies a usable bundle to a destination
- installing the example pack directly from source works for supported scoped targets
- tests cover validation and build behavior
- tests cover init and install behavior
- research and rationale are documented in-repo

## Success narrative

The project should feel like a real launch candidate, not an empty scaffold:

- a repo page explains the product in one screen
- a developer can run the example immediately
- the codebase is small enough to read in minutes
- the docs connect the product to current GitHub demand
