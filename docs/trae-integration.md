# Packsmith For Trae

Packsmith is the Trae workflow packaging layer: teams can create workflows in Trae, then package, preview, score, audit, and distribute them as governed agent workflow packs.

The point is not to replace Trae. The point is to make workflows created around Trae portable, inspectable, and governable across the agent tools an engineering team already uses.

## What Works Today

- Packsmith can package one workflow into install plans for Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and TRAE.
- Packsmith now provides local TRAE Skill directory support: project scope writes `.trae/skills/<pack-name>`, CLI project scope writes `.traecli/skills/<pack-name>`, and personal scope writes `~/.trae-cn/skills/<pack-name>`.
- The TRAE adapter writes a root `SKILL.md` bridge plus copied Packsmith skills, prompts, README, manifest, catalog, and bundle metadata.
- The Packsmith Passport shows target readiness, declared risk, computed install risk, permissions, publisher metadata, quality score, checksum, and audit posture before installation.
- `preview` shows exact writes before files are written.
- `audit --ci` catches checksum drift or local tampering after installation.
- `policy` can restrict registries, publishers, packs, risk level, permissions, and targets.

These capabilities match the enterprise concerns around reusable AI workflows: teams need shared rules, approved knowledge, repeatable agents, audit evidence, and safety controls.

## Trae Demo Story

Use this line in the Trae CN Hackathon demo:

```text
Trae can be where teams create workflows; Packsmith makes those workflows portable, inspectable, and governable across every agent their engineers use.
```

The current judge-facing flow is:

```text
search review -> preview --all-targets -> Codex preview -> isolated install -> prepared transcript -> tamper audit -> Passport
```

The Trae-specific interpretation:

- A team shapes a code-review, security, testing, or release workflow in Trae.
- Packsmith packages that workflow with manifest metadata, permissions, source, risk, context size, and examples.
- Before installation, the team previews exact writes and risk through the Passport.
- After installation, `audit --ci` checks whether local workflow files drifted or were tampered with.
- Organization policy can require verified metadata, block risky permissions, and restrict allowed workflow sources.

## Not Claimed Yet

Packsmith supports local TRAE Skill directories; it does not claim a TRAE marketplace listing, hosted plugin distribution, or official partnership.

The current integration is file-system based and inspectable. Teams can preview exact writes, install local Skill directories, enforce policy, and audit drift, but Packsmith does not publish to a TRAE marketplace or hosted plugin registry.

## Next Trae-Focused Packs

- Mini-program review pack: checks frontend, API, and release risk for WeChat mini-program work.
- Payment callback security pack: reviews idempotency, signature checks, replay protection, and logging around payment integrations.
- Chinese PRD and README pack: turns product requirements and release notes into clear Chinese engineering docs.
- Enterprise knowledge governance pack: reviews whether agent instructions cite approved knowledge, policy, and security boundaries.
- Trae workflow packager: helps teams turn reusable Trae workflows into Packsmith packs with examples and quality-score evidence.
