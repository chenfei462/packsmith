# Packsmith v1.1.0

Packsmith v1.1.0 is the Trae CN Hackathon release candidate for a package manager and trust gate for AI agent workflows.

## Highlights

- One workflow can produce six agent install plans: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and TRAE.
- TRAE and local TRAE Skill directory support are included through generated `SKILL.md` bridges for `.trae/skills`, `.traecli/skills`, and `~/.trae-cn/skills`.
- `packsmith passport <pack>` shows a judge-friendly trust screen with target readiness, declared risk, computed risk, risk reasons, permissions, quality score, checksum, publisher, and audit posture.
- `packsmith show <pack>` explains declared risk versus computed install risk.
- The hackathon demo shows the full story: registry search, six-target preview, quality score, isolated Codex install, installed-workflow review payoff, tamper audit, and Passport close.
- `npm run verify:hackathon:quick` remains the live-demo gate, while `npm run verify:hackathon:ci` plus `node scripts/i18n-check.mjs --ci` is the release gate.
- `audit --json` now emits a machine-readable envelope (`{ schemaVersion: 1, ok, stateDir, policy, results }`), with `--ci` exiting non-zero while stdout stays parseable JSON for CI pipelines.
- The bundled catalog ships 54 official packs, including the `risk-probe` high-risk sample that proves the install gate blocks high-risk packs by default and installs them only with explicit `--allow-risk high`.
- Supply-chain hardening ships in the box: typosquatting advisories on preview and install, `maxContextSize` policy enforcement, 50 MB unpacked-size caps with safe path and symlink extraction guards, and `npm audit --production` in CI.
- Three new docs anchor the ecosystem story: `docs/gh-skill-parity.md`, `docs/open-core-boundary.md`, and `docs/design-partner-program.md`.
- Judge and investor materials stay honest about external traction, signing, npm publication, and GitHub Release status.

## Demo

```bash
npm run demo
npm run verify:hackathon:quick
node src/cli.mjs passport senior-code-reviewer
```

The demo installs into an isolated Codex home, prints a compact review transcript payoff, tampers with the installed pack, and proves `audit --ci` catches the checksum mismatch.

## Release Path

The primary publish path is the `Release` GitHub Actions workflow on a reviewed `v1.1.0` tag. That workflow packs once into `dist/`, creates `release-checksums.txt`, writes `release-evidence-summary.md` with the CI run URL, publishes the same tarball to npm when `NPM_TOKEN` is valid, generates catalog shards, and attaches tarball/checksum/evidence/catalog artifacts to the GitHub Release.

Real npm publication and GitHub Release creation remain external-credential gated. Do not treat this release candidate as published until the tagged workflow succeeds and the npm/GitHub URLs exist.

## Verification Boundary

Current evidence is bounded pre-release evidence: local tests, package dry-run checks, i18n checks, catalog validation, and generated release artifacts. Final npm registry checksums, npm installability, and GitHub Release URLs must be filled from the successful tag workflow, not copied from old local snapshots.

## Post-Publish Checks

After publishing to npm, run the automated check:

```bash
npm run verify:postpublish
```

That script verifies from an isolated npm cache that `npx --yes @packsmith/cli@1.1.0` resolves and runs five checks: `--help`, `search review`, `show senior-code-reviewer`, a Codex `preview`, and `passport senior-code-reviewer` (`scripts/post-publish-verify.mjs:15-21`). The equivalent manual spot checks are:

```bash
npx --yes @packsmith/cli@1.1.0 --help
npx --yes @packsmith/cli@1.1.0 search review
npx --yes @packsmith/cli@1.1.0 passport senior-code-reviewer
```

## Links To Fill After Release

- npm package:
- GitHub Release:
- CI run:
- Final npm tarball checksum:
