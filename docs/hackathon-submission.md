# Packsmith Trae CN Hackathon Submission

> One workflow. Six agent install plans. Trust before install.

## One-Line Pitch

Packsmith is the package manager and trust gate for AI agent workflows. A team writes one reusable workflow pack, then Packsmith turns it into install plans for Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and TRAE, with risk, permissions, publisher metadata, quality score, checksums, and audit posture visible before anything writes to disk.

## Problem

AI coding tools are fragmenting. Developers now use Trae, Codex, Claude Code, GitHub Copilot, Cursor, OpenCode, and other agents, but the workflows they want to reuse are the same: code review, test generation, security review, release notes, documentation maintenance, and onboarding.

Today those workflows are usually trapped in one tool's folder format, prompt style, or trigger convention. That creates three practical problems:

- Reuse is expensive: the same workflow must be rewritten for each agent runtime.
- Installation is opaque: users often cannot inspect exact writes, permissions, source, risk, or checksum before installing.
- Teams cannot govern workflows: without receipts, lockfiles, policy, and audit, workflow drift and tampering are hard to detect.

## Solution

Packsmith treats an agent workflow like installable software. A pack contains a manifest, skills, prompts, target metadata, permissions, risk level, context size, publisher metadata, and source information. The CLI then provides the full lifecycle:

```bash
node src/cli.mjs search review
node src/cli.mjs preview senior-code-reviewer --all-targets
node src/cli.mjs passport senior-code-reviewer
node src/cli.mjs install senior-code-reviewer --target codex --dry-run
node src/cli.mjs audit --ci
```

The recommended judge demo is:

```bash
npm run demo
npm run verify:hackathon:quick
```

## Technical Innovation

- Cross-agent adapter layer: one source pack can generate Claude Code skill folders, Codex `AGENTS.md` bridges, GitHub Copilot `SKILL.md` bridges, Cursor `.mdc` rules, OpenCode `PACKSMITH.md` bridges, and TRAE `SKILL.md` directories.
- Trust before install: `preview` and `install --dry-run` show exact writes, permissions, risk, publisher, checksum, context pressure, scripts, binaries, and executable signals before installation.
- Packsmith Passport: a one-screen summary of target readiness, declared risk, computed risk, permissions, quality score, checksum, and audit status.
- Quality Score and Doctor: Packsmith scores trigger quality, instruction safety, output contract, context efficiency, portability, asset hygiene, testability, and maintenance.
- Local governance: installs write receipts and `packsmith.lock`; `audit --ci` detects checksum mismatch, missing directories, registry drift, and policy violations. Policy defaults allow only `filesystem` as a required permission unless `shell`, `network`, or `browser` are explicit opt-ins.
- Signing roadmap: Signed bundles and verified publisher keys are planned in [Signing design](./signing-design.md); they are not claimed as implemented in this release.

## Trae And Codex Value

Packsmith is not trying to replace Trae or Codex. It gives AI IDEs and coding agents a workflow distribution layer.

For Trae, Packsmith is the Trae workflow packaging layer: a team can create workflows in Trae, then make them portable, inspectable, and governable across the agent runtimes their engineers use. Packsmith now supports local TRAE Skill directories at `.trae/skills`, `.traecli/skills`, and `~/.trae-cn/skills`. See [Packsmith for Trae](./trae-integration.md) for the honest integration boundary and next Trae-focused packs.

Packsmith does not claim a TRAE marketplace listing, hosted plugin distribution, or official partnership. The current Trae value is local Skill directory packaging, preview, quality scoring, audit, and policy governance for reusable workflows that start in or around Trae.

For Codex, Packsmith already installs into the Codex skill path and generates a local `AGENTS.md` bridge. The user-facing payoff is short:

```text
Use senior-code-reviewer to review my current changes.
```

That line is the product outcome: the workflow is installed into the agent developers already use.

## Differentiation

| Alternative | Limitation | Packsmith difference |
| --- | --- | --- |
| Single-agent skill folders | Locked to one runtime | One source pack creates six target install plans |
| Prompt collections | Copyable but not governable | Manifest, permissions, risk, checksum, receipt, audit |
| Agent frameworks | Ask users to migrate tools | Installs into existing agents |
| Marketplaces | Often stop at discovery | CLI includes search, preview, install, doctor, policy, audit |
| Security scanners | Mostly after-the-fact checks | Preview before install and audit after install |

## Demo Path

1. Search the registry for a real workflow: `search review`.
2. Show supported runtimes: `targets`.
3. Show one workflow becoming six install plans: `preview --all-targets`.
4. Show quality evidence: `score` and `doctor`.
5. Install into an isolated Codex home.
6. Show the user-value prompt: `Use senior-code-reviewer to review my current changes.`
7. Show the prepared transcript from the installed workflow.
8. Tamper with the installed pack.
9. Run `audit --ci` and show checksum mismatch.
10. End on the Passport.

## Why It Can Place Above Second Prize

Packsmith is more than a demo script. It already has a working CLI, registry, 53 runtime-complete official packs, 30 launch-ready packs with README/examples, six-target preview, isolated Codex install, quality scoring, policy, audit, tamper detection, and a judge-friendly demo runner.

Investor metrics are tracked separately in [Investor metrics](./investor-metrics.md) so product proof, external traction, design-partner targets, and claiming rules stay honest. The [design partner evidence capture kit](./design-partner-evidence.md) is ready for interviews and pilots, but Packsmith does not claim real design partners yet. The current strongest evidence is working product surface; npm downloads, GitHub launch metrics, third-party packs, and team pilots should be captured after public release.

The strongest closing screen is:

```text
PACKSMITH PASSPORT: senior-code-reviewer

Targets:
Claude Code       preview-ready
Codex             installed
GitHub Copilot    preview-ready
Cursor            preview-ready
OpenCode          preview-ready
TRAE              preview-ready

Trust:
Registry metadata verified yes
Computed Risk     medium
Permissions       shell optional, filesystem required, network optional, browser none
Quality Score     95/100
Audit             tamper caught
```

## Future Scope

- Hosted registry and web marketplace.
- Signed bundles and verified publisher keys.
- Trae-native pack authoring UI.
- Team registry, approval workflow, and organization policy.
- More adapters and richer TRAE authoring helpers.
- Adoption analytics for workflow quality and context pressure.

## Closing Line

Packsmith makes agent workflows installable software: one workflow, six agent install plans, trust before install.
