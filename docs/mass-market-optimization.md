# Packsmith Mass-Market Optimization Plan

## 2026-05-24 Review Reprioritization

The companion mass-market review (kept outside this repository) does not replace this plan. It reprioritizes it.

This document describes the broad product surface Packsmith can grow into. The review identifies the highest-leverage order for making that surface real:

1. P0 content and registry depth: users need useful packs before they care about infrastructure.
2. P5 distribution: `npx @packsmith/cli` must be publishable, dry-run verified, and honest about credentials.
3. P2 demoable product shape: `packsmith` should open a terminal browser/installer that can be screenshotted or recorded.
4. P1 true runtime support: focus on Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories before claiming broad agent coverage.
5. P3 concrete positioning: lead with "The package manager for AI agent workflows", not abstract infrastructure.
6. P4 trust/security: keep local validation, receipts, checksums, and policy checks, but defer signing and verified publisher systems until people are installing real packs.

The current implementation follows that order: 53 official packs, launch-ready catalog metadata, `show`, `preview`, `publish --dry-run`, six installable targets including local TRAE Skill directories, a lightweight interactive entry, npm dry-run preparation, and docs that lower advanced trust below adoption basics.

## Executive Summary

Packsmith started as a clean developer CLI MVP, but the mass-market opportunity is broader than compiling packs. Its value proposition needs to be clear to people who simply know they keep rewriting the same prompts, skills, and rules across agents. Packsmith should move from "a compiler for skill packs" to "the package manager, installer, and compatibility checker for portable AI workflows."

The product opportunity is strong because AI coding assistants and local agent runtimes are multiplying quickly. Users increasingly switch between Claude Code, Codex, OpenCode, Cursor, Gemini CLI, and similar tools. Each runtime has its own configuration format, skill conventions, install location, and prompt behavior. Packsmith can own the missing layer between reusable agent workflows and the fragmented agent runtime ecosystem.

The main gap is not technical feasibility. The current CLI already proves the basic loop: initialize a pack, validate it, inspect it, build target bundles, and install a bundle. The gap is productization. A mainstream user should not need to understand build artifacts, destination directories, or target-specific folder layouts. They should be able to install a useful pack with one command, see that it works in their agent, update it later, and trust where it came from.

## Current State

Packsmith currently presents itself as:

> One workflow. Six agent install plans. Trust before install.

The repository ships a zero-dependency Node CLI with package-manager commands:

- `init`
- `validate`
- `inspect`
- `build`
- `install`
- `search`
- `info`
- `publish --dry-run`
- `list`, `remove`, `update`, `sync`
- `doctor`, `audit`, and `policy validate`

The currently installable targets are:

- `claude-code`
- `codex`
- `github-copilot`
- `opencode`
- `cursor`
- `trae`

The `trae` target supports local TRAE Skill directories at project `.trae/skills/<pack-name>`, CLI project `.traecli/skills/<pack-name>`, and personal `~/.trae-cn/skills/<pack-name>`. Packsmith does not claim TRAE marketplace distribution, hosted plugin distribution, or official partnership.

This is a solid MVP for developers who already know what an agent skill pack is. It is also a good foundation for a larger product because it has a narrow concept, a clean repository, tests, examples, and a concrete workflow.

However, the current usage model still expects the user to know too much:

- what a pack is
- how a manifest works
- which target runtime they need
- where a built bundle lives
- where an agent expects installed skills
- how to connect the generated files to the agent they actually use

For a broader audience, Packsmith must hide most of that complexity.

## Core Positioning Shift

The current positioning is:

> A zero-dependency CLI that turns one source pack into portable, target-specific agent skill bundles.

That is accurate, but it is still infrastructure language. The current mass-market message is:

> The package manager for AI agent workflows.

Supporting lines can be:

- Stop rewriting the same Claude rules for Cursor.
- Write your reviewer once. Use it in every supported agent.
- Search, inspect, and install AI workflows across Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories.

The deeper strategic shift is:

```text
From: agent skill pack compiler
To: package manager for portable AI workflows
```

This means Packsmith should not only build bundles. It should help users discover, install, update, verify, inspect, trust, and remove agent skill packs across many runtimes.

## Product Problem To Solve

The user-facing problem should be framed like this:

```text
I use several AI coding agents.
I want them to share the same high-quality skills, prompts, and workflows.
I do not want to manually copy files, learn every runtime's directory layout,
or rewrite the same workflow for every tool.
```

Packsmith's answer should be:

```text
Install one pack once. Packsmith adapts it to supported agents you use.
```

This is easier to understand than "target-specific bundles." It also gives the project a stronger emotional hook: users get continuity across their tools.

## Priority 1: One-Command Installation

The first product upgrade should be a dramatically simpler install path.

Current style:

```bash
node src/cli.mjs build examples/research-launchpad
node src/cli.mjs install examples/research-launchpad/dist/research-launchpad --target codex --dest .local-packs
```

After npm publication, target style:

```bash
npx @packsmith/cli install senior-code-reviewer
```

Or:

```bash
packsmith add senior-code-reviewer
packsmith sync
```

The user should not need to pass a built pack directory, target name, or destination directory for the common case.

### Required Improvements

- Publish Packsmith as a real npm package.
- Remove `"private": true` from `package.json` when ready to release.
- Make `npx @packsmith/cli` work after npm publication.
- Add automatic runtime detection.
- Detect local agent install paths.
- Provide interactive target selection when multiple agents are found.
- Add `--dry-run` to show exactly what would be installed.
- Add `packsmith list` to show installed packs.
- Add `packsmith remove <pack>` to uninstall cleanly.
- Add `packsmith update` to refresh installed packs.
- Add human-readable success output after install.

### Example Output

```text
Installed senior-code-reviewer

Targets:
- Claude Code: installed
- Codex: installed
- OpenCode: not found

Next:
- Run your agent in this repo.
- Ask it to review your current changes.
```

## Priority 2: More Runtime Targets

The early two-target baseline was not enough for a product claiming broad portability. Packsmith now supports six recognizable targets and should keep expanding only after each runtime's conventions are verified.

### Recommended Target Order

1. Claude Code
2. Codex
3. OpenCode
4. Cursor
5. GitHub Copilot
6. TRAE local Skill directories
7. Gemini CLI after path confirmation
8. OpenClaw after path confirmation
9. Hermes Agent after path confirmation
10. AionUi or other multi-agent shells if their extension model allows it

The target adapter should not be a simple copy operation. Each runtime needs real support for its conventions.

### Adapter Responsibilities

Each target adapter should define:

- runtime name
- supported platforms
- known install locations
- config files
- skill directory format
- prompt or rule file format
- generated bridge files
- validation rules
- uninstall manifest
- compatibility warnings

This turns Packsmith into an adapter platform rather than a folder copier.

## Priority 3: Pack Registry

Packsmith needs content, not only tooling. Most users will not install a pack compiler because they want to author packs. They will install it because they want useful packs.

The first registry can be simple. It does not need to be a hosted marketplace on day one. A signed JSON catalog in a GitHub repository is enough for the MVP.

### Registry Commands

```bash
packsmith search review
packsmith show senior-code-reviewer
packsmith install senior-code-reviewer
packsmith update
packsmith list
packsmith remove senior-code-reviewer
```

### Example Registry Entry

```json
{
  "id": "senior-code-reviewer",
  "name": "Senior Code Reviewer",
  "description": "Finds bugs, regressions, missing tests, risky changes, and unclear behavior before a change ships.",
  "version": "0.1.0",
  "author": "packsmith",
  "category": "code-quality",
  "tags": ["packsmith", "review", "quality", "testing", "risk"],
  "targets": ["claude-code", "codex", "opencode", "cursor"],
  "source": "../official-packs/senior-code-reviewer",
  "license": "MIT",
  "riskLevel": "low",
  "estimatedContextSize": 4200,
  "usageExample": "packsmith install senior-code-reviewer",
  "verified": true,
  "repository": "https://github.com/chenfei462/packsmith/tree/main/official-packs/senior-code-reviewer"
}
```

### Registry Value

A registry gives Packsmith a reason to be used every week:

- discover new packs
- install packs
- update packs
- audit packs
- publish packs
- share packs with teams

Without a registry, Packsmith is mostly a build tool. With a registry, it becomes an ecosystem entry point.

## Priority 4: Official Packs

Packsmith needs official packs that are immediately useful. These packs demonstrate the value of cross-agent portability.

The launch registry now contains 53 official packs:

- Code quality: `senior-code-reviewer`, `security-reviewer`, `test-writer`, `refactor-planner`, `bug-hunter`, `performance-profiler`
- Repository understanding: `repo-cartographer`, `onboarding-guide`, `dependency-auditor`, `api-surface-mapper`, `database-schema-reader`, `legacy-code-translator`
- Product and launch: `launch-researcher`, `github-trending-analyst`, `competitor-breakdown`, `readme-converter`, `roadmap-writer`, `issue-triage`
- Documentation: `docs-maintainer`, `changelog-writer`, `tutorial-writer`, `api-docs-writer`, `contributing-guide-writer`, `release-checklist`
- Agent workflow: `prompt-debugger`, `skill-author`, `context-budgeter`, `multi-agent-router`, `workflow-packager`, `agent-memory-curator`
- Second-wave review and planning packs: `accessibility-auditor`, `api-contract-reviewer`, `architecture-decision-recorder`, `bug-reproducer`, `changelog-curator`, `ci-failure-triage`, `codebase-modernizer`, `data-pipeline-checker`, `database-index-advisor`, `dependency-risk-auditor`, `dependency-upgrader`, `frontend-state-debugger`, `incident-postmortem`, `migration-planner`, `onboarding-guide-writer`, `pr-description-writer`, `product-requirements-shaper`, `prompt-quality-auditor`, `refactor-guide`, `release-note-writer`, `security-pass`, `terraform-reviewer`, `test-fixture-designer`

These packs should stay high quality, well documented, and included in demos. They are the product's first "apps."

## Priority 5: Upgrade `inspect` Into `doctor`

The existing `inspect` command already reports context-related metadata. This should become a major differentiator.

Recommended command:

```bash
packsmith doctor my-pack
```

### `doctor` Should Report

- context budget
- estimated token pressure
- duplicate instructions
- missing trigger conditions
- vague descriptions
- broken file references
- unsupported target behavior
- portability score
- install safety warnings
- manifest completeness
- pack size
- recommended fixes

### Example Output

```text
Packsmith Doctor: senior-code-reviewer

Context Budget
- Total: 18,420 chars
- Claude Code: OK
- Codex: OK
- OpenClaw: warning, long entry instructions

Quality
- 2 repeated instruction blocks
- 1 missing trigger condition
- 1 prompt has no expected output format

Portability
- Works on Claude Code and Codex
- Needs adapter metadata for Cursor

Recommendation
- Split review and security checks into separate skills.
```

This makes Packsmith more than a packager. It becomes a quality tool for agent workflows.

## Priority 6: Trust And Safety

Agent skills can influence shell commands, filesystem operations, network behavior, and code changes. Users need a reason to trust installed packs.

Packsmith should make trust visible.

### Trust Features

- `packsmith.lock`
- checksums for installed packs
- signed bundles
- verified publishers
- source provenance
- install receipts
- uninstall manifests
- permission declarations
- security warnings
- local audit command

### Example Permission Metadata

```json
{
  "permissions": {
    "shell": "optional",
    "filesystem": "required",
    "network": "optional",
    "browser": "none"
  }
}
```

### Audit Command

```bash
packsmith audit
```

The audit should explain:

- what is installed
- where it came from
- whether checksums match
- whether updates are available
- whether any installed pack requests risky permissions

This is important if Packsmith wants to become infrastructure rather than a toy.

## Priority 7: Better README And First Impression

The README should sell the user outcome before explaining internals.

### Suggested README Opening

After npm publication:

```md
# Packsmith

The package manager for AI agent workflows.

```bash
npx @packsmith/cli
npx @packsmith/cli search review
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer --yes
```

Packsmith lets you search, preview, inspect, and install reusable AI agent workflows across Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories without rewriting the same workflow for each runtime.
```

Then show a short demo:

```text
Search pack -> install pack -> open agent -> use skill
```

The README should include:

- one-command install
- animated demo or screenshot
- supported agents
- example packs
- why this exists
- authoring guide
- publishing guide
- trust model
- roadmap

The current "zero-dependency CLI" message should remain, but it should move lower. It is an engineering benefit, not the main user hook.

## Priority 8: TUI And Local Studio

A CLI is useful for developers, but screenshots and demos drive adoption. Packsmith should eventually have a more visual interface.

### TUI

Command:

```bash
packsmith
```

The TUI should support:

- browse packs
- search packs
- view pack details
- select target agents
- install packs
- show dry-run install commands
- exit cleanly on Windows PowerShell

### Local Studio

Command:

```bash
packsmith studio
```

This can open a local web UI with:

- installed agents
- available packs
- install status
- pack details
- compatibility warnings
- trust metadata
- update button
- uninstall button

This is not required for the first release, but it would make Packsmith much easier to show, explain, and share.

## Priority 9: Release And Distribution

Packsmith should become easy to install from common channels.

### Recommended Distribution Channels

- npm
- GitHub Releases
- Homebrew
- Scoop
- winget
- Docker image if useful for CI

### Repository Improvements

- release workflow
- changelog
- badges
- issue templates
- pull request template
- discussions
- adapter contribution guide
- registry submission guide
- official examples
- demo GIF

The project should make it obvious how someone can:

- install Packsmith
- install a pack
- publish a pack
- add a runtime adapter
- report compatibility issues

## Priority 10: Team And Enterprise Path

After the consumer/developer loop works, Packsmith can support teams.

### Team Features

- private registries
- internal verified publishers
- policy files
- allowed and blocked packs
- pinned versions
- reproducible installs
- CI validation
- organization pack catalogs
- signed internal bundles

### Example Team Workflow

```bash
packsmith install --registry https://company.example.com/agent-packs
packsmith sync --policy .packsmith-policy.json
packsmith audit --ci
```

This gives Packsmith a path beyond open-source popularity into real organizational use.

## Suggested Roadmap

### Phase 1: Public Package And Better Install

- Make npm package layout dry-run publishable.
- Add GitHub release workflow.
- Make `npx @packsmith/cli` resolve to the CLI once published.
- Improve CLI help.
- Add automatic runtime detection.
- Add `list`, `remove`, `update`, and `sync`.
- Add better install output.

### Phase 2: Registry MVP

- Add official registry catalog.
- Add `search`, `show`, and local registry `install`.
- Create at least 30 official launch packs.
- Add category, license, risk, context size, usage example, tags, repository/source, update time, stars, and install count fields.
- Add `publish --dry-run` for local submission validation.
- Add registry documentation.

### Phase 3: Runtime Expansion

- Add OpenCode support.
- Add Cursor support.
- Add Gemini CLI support after path confirmation.
- Add OpenClaw support after path confirmation.
- Add Hermes Agent support after path confirmation.
- Add target-specific validation.

### Phase 4: Doctor And Trust Layer

- Add `packsmith doctor`.
- Add context budget warnings.
- Add portability score.
- Add `packsmith.lock`.
- Add install receipts.
- Add `packsmith audit`.
- Defer signed bundles until content, npm distribution, TUI, and four real targets have adoption.

### Phase 5: Visual Product Layer

- Add TUI.
- Add reproducible screenshot/demo commands.
- Add `packsmith studio` later if users need it.
- Add screenshots and demo videos from real commands.
- Improve onboarding docs.
- Launch official pack gallery.

## Success Metrics

Packsmith should track success through concrete adoption signals:

- time from install to first successful pack install
- number of supported runtimes
- number of registry packs
- number of verified packs
- weekly downloads
- GitHub stars
- community-submitted adapters
- community-submitted packs
- successful `doctor` runs
- pack install/update/remove command usage

The most important early metric is:

```text
Can a new user install a useful pack into their agent in under 60 seconds?
```

If the answer is yes, Packsmith has a real chance to spread.

## Final Strategic Recommendation

Packsmith should avoid becoming only a niche compiler. The stronger product is:

```text
AI agent workflows' npm, installer, and compatibility checker.
```

The fastest path to a breakout product is:

1. make installation one command
2. ship useful official packs
3. add discovery through a registry
4. support the tools users already use
5. create a demo-friendly visual layer
6. make local trust and portability visible

If Packsmith can make this feel true:

```text
Install one pack once, use it in every supported agent.
```

then it has a much stronger chance of becoming a widely used project rather than just a tidy developer utility.
