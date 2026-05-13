# GitHub Demand Research

Date: May 13, 2026

## Thesis

The strongest new-project opportunity is not another generic agent wrapper. It is tooling for the fast-growing `agent-skills` ecosystem: validation, packaging, distribution, and cross-runtime compatibility.

## Raw signals

### 1. The category is already large

- GitHub's `agent-skills` topic listed 4,526 public repositories on May 13, 2026.
- `anthropics/skills` showed 133k stars on May 13, 2026 and remained the top repository in that topic.

Implication:

- The market has enough attention to support a new infrastructure layer.
- A project can win without inventing a new category if it removes obvious friction.

### 2. Discoverability is still broken

In `anthropics/skills` issue `#675`, opened on March 18, 2026, a user described useful document skills as effectively invisible and reported spending multiple sessions reinventing PDF workflows before discovering the official skill.

Implication:

- Discovery is weak.
- Packaging and metadata quality matter.
- A pack tool should help authors produce installable, searchable, self-describing artifacts.

### 3. Context waste is still unsolved

In issue `#919`, opened on April 12, 2026, a user reported duplicate skill loading that wasted context tokens and created routing confusion.

Implication:

- Pack tooling should expose context weight and duplication risk early.
- `inspect` is not a vanity feature; it is part of product correctness.

### 4. Installation paths are inconsistent

In issue `#1101`, opened on May 7, 2026, a user reported an install-path mismatch: `npx skills add` may install to `~/.agents/skills/`, while Claude Code only scans `~/.claude/skills`.

Implication:

- Cross-runtime packaging is still immature.
- A build tool that emits target-specific layouts is immediately useful.

### 5. The market is asking for skill-management products

In issue `#278`, opened on January 25, 2026, a community proposal described a full skills management suite with visual marketplace, one-click install/uninstall, GitHub and local imports, and security scanning.

Implication:

- The desire is broader than "write more skills".
- There is appetite for infrastructure around skills.

## Product gap

What is missing today is not more content. It is a clean path from:

1. authoring a reusable skill pack
2. validating it against common rules
3. estimating context cost
4. compiling it into runtime-specific bundles
5. eventually installing or publishing it

## Recommended repo

Build `packsmith`:

- a zero-dependency CLI
- a portable manifest format
- target adapters for Claude Code and Codex first
- context-weight inspection before install

## Why this has 2k-star potential

- It attacks a real infrastructure gap inside a category that already has breakout demand.
- It is easier to explain than a full agent platform.
- It is useful to both individual power users and teams shipping internal skills.
- It can expand naturally into registry, signing, install, and policy.

## Source links

- GitHub Trending: https://github.com/trending
- `agent-skills` topic: https://github.com/topics/agent-skills
- `anthropics/skills`: https://github.com/anthropics/skills
- Issue `#675`: https://github.com/anthropics/skills/issues/675
- Issue `#919`: https://github.com/anthropics/skills/issues/919
- Issue `#1101`: https://github.com/anthropics/skills/issues/1101
- Issue `#278`: https://github.com/anthropics/skills/issues/278
