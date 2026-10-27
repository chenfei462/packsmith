# Packsmith Deliverable Product Plan

## Goal

Packsmith should become a real deliverable product for mainstream AI agent users, not another MVP, demo, or internal CLI experiment.

The target is not simply to prove that Packsmith can compile skill packs. The target is to make Packsmith useful the first time a stranger installs it. A user should be able to install Packsmith from npm, search a registry with enough useful packs to feel alive, install a pack into their local agent workflow, and understand why Packsmith belongs in their daily AI coding setup.

This document defines the product requirements for that outcome.

## Non-Negotiable Launch Bar

Before any other priority matters, Packsmith must satisfy two hard requirements:

1. Packsmith must be published as an installable npm package.
2. The registry must launch with at least 30 usable packs.

Everything else is secondary until those two requirements are complete.

That means UI polish, advanced runtime adapters, hosted marketplace work, signing infrastructure, local studio, enterprise policy, and deep analytics should not distract from the initial deliverable. A beautiful product with no install path is not deliverable. A package manager with an empty registry is not useful.

Current source-tree status for the hackathon: package dry-runs and release checks pass, but real npm publication still requires maintainer credentials for `@packsmith/cli`.

The launch product must answer one user question immediately:

```text
What useful thing can I install right now?
```

If the answer is unclear, Packsmith is not ready.

## Product Positioning

Packsmith should be positioned as:

```text
The package manager for AI agent workflows.
```

Supporting messages:

```text
One skill pack. Every AI agent.
```

```text
Install shared workflows across Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Hermes, OpenClaw, and more.
```

The product should not lead with implementation language such as "target-specific bundles" or "zero-dependency compiler." Those are engineering strengths, but they are not the first thing users care about.

After npm publication, the first-screen promise should be:

```bash
npx @packsmith/cli search review
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer --target codex --yes
```

The user should immediately understand that Packsmith helps them discover and install useful agent capabilities.

## Product Definition

Packsmith is a cross-agent package manager for skills, prompts, workflows, and agent behavior packs.

It must support five product jobs:

- discover packs
- inspect packs
- install packs
- manage installed packs
- author and publish packs

The first public version does not need to solve every future marketplace problem. It does need to feel complete enough that users can rely on it without reading source code or manually editing generated folders.

## Required User Journey

The core user journey must work end to end:

1. User discovers Packsmith from GitHub, npm, or a shared command.
2. After npm publication, user runs `npx @packsmith/cli`; before publication, the source-tree path is `npm ci && npm run demo`.
3. User sees clear help, examples, and available commands.
4. User runs `npx @packsmith/cli search <topic>`.
5. User sees multiple real packs from the registry.
6. User runs `npx @packsmith/cli show <pack-id>`.
7. User understands what the pack does, which agents it supports, and how large or risky it is.
8. User runs `npx @packsmith/cli install <pack-id>`.
9. Packsmith installs the pack locally with clear output.
10. User can run `npx @packsmith/cli list` and see the installed pack.
11. User can run `npx @packsmith/cli remove <pack-id>` to uninstall it.

This journey is the product. Anything that does not support this journey should be deferred.

## Npm Release Requirement

Packsmith must be publishable and installable from npm.

### Required Package Changes

- Remove private package blocking.
- Ensure `name`, `version`, `description`, `license`, `bin`, `keywords`, and `engines` are correct.
- Add a useful `files` allowlist so npm does not publish junk.
- Add `prepublishOnly` or release verification script.
- Add `npm pack` verification to the release checklist.
- Add a changelog.
- Add GitHub release workflow or documented manual release path.
- Make `npx @packsmith/cli --help` work cleanly from the packed artifact.

### Required Install Commands

After npm publication, these commands must work:

```bash
npx @packsmith/cli --help
npx @packsmith/cli search review
npx @packsmith/cli show senior-code-reviewer
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer --yes
npx @packsmith/cli list
npx @packsmith/cli remove senior-code-reviewer
```

If global install is used, this should also work:

```bash
npm install -g @packsmith/cli
packsmith search review
```

### Release Quality Bar

The npm package should not feel like a source checkout wrapper. It should behave like a real CLI product:

- fast startup
- readable help
- friendly errors
- stable commands
- no required repo-relative paths
- no hidden setup step
- no dependency on examples being manually located by the user

## Registry Launch Requirement

Packsmith must ship with at least 30 usable packs in its registry.

The registry can be local-file based or GitHub-hosted for the first launch. It does not need a hosted web app on day one. But it must be real enough that `search`, `show`, and `install` work against it.

### Registry Requirements

Each registry entry must include:

- id
- name
- description
- version
- author
- category
- tags
- supported targets
- source path or source URL
- license
- risk level
- estimated context size
- short usage example

Recommended optional fields:

- homepage
- repository
- verified
- created date
- updated date
- checksum
- permissions
- compatibility notes

### Registry Commands

Required:

```bash
packsmith search <query>
packsmith show <pack-id>
packsmith install <pack-id>
packsmith list
packsmith remove <pack-id>
```

Nice to have after launch:

```bash
packsmith update
packsmith registry add <url>
packsmith registry list
packsmith doctor <pack-id>
packsmith audit
```

## The First 30 Packs

The first 30 packs should be practical, recognizable, and immediately useful to developers using AI agents. They should not be filler. Each pack should have a clear job, clear trigger conditions, and a concrete output format.

### Code Quality

1. `senior-code-reviewer`
   Finds bugs, regressions, missing tests, risky changes, and unclear behavior.

2. `security-reviewer`
   Checks secrets, unsafe commands, injection risks, dependency risk, and permission expansion.

3. `test-writer`
   Adds focused tests for recent code changes and known edge cases.

4. `refactor-planner`
   Turns messy code areas into safe, staged refactor plans.

5. `bug-hunter`
   Reproduces, isolates, and explains bugs before proposing fixes.

6. `performance-profiler`
   Identifies obvious performance bottlenecks and suggests measurable improvements.

### Repository Understanding

7. `repo-cartographer`
   Maps architecture, entry points, module boundaries, and high-risk areas.

8. `onboarding-guide`
   Explains a new repository for a first-time contributor.

9. `dependency-auditor`
   Reviews dependency usage, risk, update pressure, and unnecessary packages.

10. `api-surface-mapper`
    Documents public APIs, internal APIs, contracts, and compatibility risks.

11. `database-schema-reader`
    Explains schema structure, migrations, relationships, and risky data changes.

12. `legacy-code-translator`
    Explains old or unclear code in modern, actionable language.

### Product And Launch

13. `launch-researcher`
    Converts market signals into positioning, wedge, and launch recommendations.

14. `github-trending-analyst`
    Studies GitHub trends and turns them into product opportunities.

15. `competitor-breakdown`
    Compares a project against competitors and identifies differentiation.

16. `readme-converter`
    Turns a technical README into a user-facing landing README.

17. `roadmap-writer`
    Converts strategy notes into phased roadmap documents.

18. `issue-triage`
    Groups issues by severity, effort, product value, and release relevance.

### Documentation

19. `docs-maintainer`
    Keeps README, changelog, examples, and command docs aligned with implementation.

20. `changelog-writer`
    Turns commits or diffs into release notes.

21. `tutorial-writer`
    Creates beginner-friendly tutorials from existing examples.

22. `api-docs-writer`
    Produces API reference docs from source and tests.

23. `contributing-guide-writer`
    Creates contributor instructions for setup, tests, style, and PR flow.

24. `release-checklist`
    Produces release readiness checklists for npm, GitHub, and docs.

### Agent Workflow

25. `prompt-debugger`
    Diagnoses vague prompts, conflicting instructions, and missing output contracts.

26. `skill-author`
    Helps users turn repeated agent workflows into clear triggers and workflows.

27. `context-budgeter`
    Reduces long agent instructions while preserving behavior.

28. `multi-agent-router`
    Chooses which local agent or skill should handle a given task.

29. `workflow-packager`
    Converts repeated manual workflows into reusable Packsmith packs.

30. `agent-memory-curator`
    Summarizes durable project context for reuse across agent sessions.

## Pack Quality Bar

Each launch pack must include:

- `packsmith.json`
- at least one `SKILL.md`
- clear description
- clear trigger conditions
- step-by-step workflow
- expected output format
- at least one usage example
- supported targets
- category and tags
- context-size metadata
- validation passing through Packsmith

A pack should not be accepted into the registry if it is only a thin placeholder. A user installing it should get a real workflow they could use the same day.

## Install Behavior

The first install implementation can be conservative, but it must be usable.

At minimum:

- install from registry by pack id
- install to a default local Packsmith directory
- copy target-ready bundle files
- record install receipt
- support list and remove
- show the install location
- show next-step guidance

The product should avoid pretending to support a runtime if the install path is unknown. In that case, it should say clearly:

```text
Pack installed into the local Packsmith store.
Runtime auto-install for OpenClaw is not configured yet.
Run `packsmith show-paths` to see where the files are.
```

It is better to be honest and useful than to silently copy files to the wrong place.

## CLI Experience

The CLI must feel like a product.

### Help Output

The help screen should show:

- what Packsmith is
- the most common commands
- one install example
- one search example
- where packs are installed
- how to get more help

### Error Messages

Bad:

```text
Error: Missing manifest
```

Good:

```text
Could not find packsmith.json in ./my-pack.

This directory does not look like a Packsmith pack.
Try:
  packsmith init my-pack
  packsmith search review
```

### Output Style

Output should be concise, readable, and script-friendly where appropriate. JSON output can be added later with `--json`, but default output should be for humans.

## README Requirements

The README must be rewritten around the product, not the implementation.

The first page should include:

- product promise
- one-command usage
- registry search example
- install example
- list of launch pack categories
- supported targets
- explanation of what a pack is
- authoring guide link
- publishing guide link
- release status

Suggested opening after npm publication:

```md
# Packsmith

The package manager for AI agent workflows.

```bash
npx @packsmith/cli search review
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer --yes
```

Packsmith helps you discover, install, validate, and manage reusable skills across AI coding agents.
```

## Documentation Requirements

The product should include documentation for:

- installing Packsmith
- searching the registry
- installing a pack
- removing a pack
- authoring a pack
- submitting a pack to the registry
- registry schema
- target adapter design
- release process
- quality bar for official packs

Docs should be practical and command-driven. Avoid abstract strategy language in user-facing setup docs.

## What To Defer

These items are valuable, but should not block the first deliverable product if npm publishing and 30 registry packs are not finished:

- GUI studio
- hosted marketplace
- enterprise policy engine
- advanced signing infrastructure
- full OpenClaw/Hermes auto-install if paths are not stable
- analytics
- account system
- ratings and reviews
- paid pack marketplace
- complex plugin system

Do not let future platform dreams delay the first useful product.

## Definition Of Done

Packsmith is deliverable when all of the following are true:

- `npm pack` succeeds.
- `npx @packsmith/cli --help` works from the packed package.
- `npm publish --dry-run` succeeds, and real npm publication is clearly documented as requiring maintainer credentials until `npm publish --access public` succeeds.
- The registry contains at least 30 usable packs.
- `packsmith search` returns real packs.
- `packsmith show` displays pack details.
- `packsmith install` installs a registry pack.
- `packsmith list` shows installed packs.
- `packsmith remove` removes an installed pack.
- All launch packs validate.
- README reflects the real product.
- Release checklist exists.
- Tests pass.

This is the threshold where Packsmith stops being an MVP and starts being a usable product.

## Implementation Focus

The work should proceed in this order:

1. Make the npm package publishable.
2. Build the registry schema and commands.
3. Add 30 launch packs.
4. Make install/list/remove work against the registry.
5. Validate all launch packs.
6. Rewrite README around the product journey.
7. Add release checklist and publishing docs.
8. Run tests and package verification.

Do not start broad secondary initiatives until this sequence works.

## Final Product Thesis

Hermes and OpenClaw are exciting because they promise users a more capable AI working environment. Packsmith can become exciting by giving users a way to upgrade every agent they already use.

The product thesis is:

```text
Your agents should share the same best skills.
Packsmith is how you install them.
```

If Packsmith launches with npm distribution and 30 real packs, it can create an immediate reason to install, try, share, and contribute. Without those two pieces, the project remains a promising tool with no obvious first-session payoff.
