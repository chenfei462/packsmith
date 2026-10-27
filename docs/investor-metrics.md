# Investor Metrics

Packsmith should be pitched to investors with a clean split between product proof that exists today and external traction that still needs to be captured.

## Current Product Proof

- 53 runtime-complete official packs in `registry/catalog.json`.
- 53 source directories under `official-packs/`.
- 30 launch-ready packs with README and example material.
- Six supported preview/install targets: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories.
- Packsmith Passport for before-install trust: target readiness, declared risk, computed risk, permissions, publisher metadata, quality score, checksum, and audit posture.
- Install preview before writes, including file paths, permissions, risk, checksum, publisher, context size, and asset signals.
- Local receipts and `packsmith.lock` after install.
- `audit --ci` detects checksum drift and local tampering.
- Policy checks can restrict registries, publishers, packs, risk level, permissions, and targets; omitted permission allowlists default to only `filesystem` as required, so `shell`, `network`, and `browser` require explicit opt-in.
- Verification gates exist for live demos and release readiness: `npm run verify:hackathon:quick`, `npm run verify:hackathon:ci`, and post-publish `npm run verify:postpublish`.

## External Traction To Capture

These metrics should be collected after the package is public and the repository is launched:

- npm downloads for `@packsmith/cli`.
- GitHub stars, forks, watchers, issues, pull requests, and contributors.
- Public installs or telemetry from an opt-in registry, if added later.
- Number of third-party submitted packs.
- Number of teams using private policy or audit workflows.
- Design partner quotes and before/after workflow examples.
- Demo conversion: people who watched the demo and then ran `npx @packsmith/cli`.

Do not claim npm downloads until `@packsmith/cli` is published and npm reports real download data.

Do not claim GitHub Release traction, public npm usage, external design-partner proof, TRAE marketplace distribution, hosted plugin distribution, or official TRAE partnership until those claims are backed by public sources or collected evidence.

Do not treat registry `stars` or `installs` fields as external market traction unless they are backed by public usage data. In the current repository, they are product metadata for demo and discovery.

Design-partner evidence is not yet captured. Use the [Design Partner Evidence Capture](./design-partner-evidence.md) kit to collect interviews, pilot artifacts, consent status, and before/after workflow examples before adding design-partner claims to investor materials.

## Design Partner Targets

The first design partner target is 5-10 engineering teams that already use more than one AI coding agent, for example Trae plus Codex, Claude Code, GitHub Copilot, Cursor, or OpenCode.

The best-fit team has:

- reusable review, testing, security, documentation, or release workflows
- concern about prompt or skill supply-chain risk
- need for policy, receipts, and audit in CI
- engineers who switch between multiple agent runtimes
- willingness to test private registries or approved workflow packs

## Collection Commands

Use these commands as evidence inputs after launch:

```bash
npm view @packsmith/cli version
npm view @packsmith/cli dist-tags
npm run verify:postpublish
node src/cli.mjs registry validate --quality-gate 85
node src/cli.mjs passport senior-code-reviewer
node src/cli.mjs preview senior-code-reviewer --all-targets
```

Capture the command, date, working directory or machine, exit code, and link to the public source when possible.

## Claiming Rules

- Product proof can cite local verification only when the command output is captured for the same commit.
- External traction requires public sources or design-partner artifacts.
- Dry-run publication proves package shape, not npm availability.
- `npx @packsmith/cli` proves public availability only after npm publication.
- A design partner conversation is qualitative evidence; it is not revenue until money is collected.
- A private registry or policy pilot is enterprise intent; it is not a marketplace until third-party packs and usage exist.

## Investor Story

Packsmith starts as an open-source CLI and registry for agent workflows, but the commercial path is team governance: private registries, approved workflow packs, policy enforcement, audit reports, and verified internal publishers.

The narrow wedge is not "another installer." The wedge is a Passport for agent workflows before teams install them.
