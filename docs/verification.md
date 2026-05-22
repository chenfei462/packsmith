# Verification Snapshot

This file is machine-generated from the current repository state and npm registry status.

- package: `@chenfei462/packsmith@0.1.0`
- recommended eval command: `npm run eval`
- node requirement: `>=20`
- zero runtime dependencies: yes
- example packs verified by gate: 3
- example pack ids: incident-triage, maintainer-handoff, research-launchpad
- npm package published: false
- preferred install: source eval (npm run eval)
- Claude Code scoped install: `packsmith install examples/research-launchpad --target claude-code --scope user`
- Codex bridge install: `packsmith install examples/research-launchpad --target codex --dest <dir>`
- toolchain: Node >=20, npm deterministic-pack-inspection
- npm pack dry-run footprint: 6 files, 71.9 KB
- npm pack artifact: `packsmith-0.1.0.tgz`
- npm pack shasum: `1bb91418ecba8725856cfd382a25ac24d3b7bd95`
- npm pack integrity: `sha512-RmaCNLIjEClRDEEtIViXiK1u2TDbVeauaqnh0NjRYG54qJD5X4TxkUiA2o8pmZ3jLAuGRu3FqQYtq0J8/VKpKg==`
- clean-machine demo: `npm run smoke:example` (temporary workspace, HOME, npm prefix, and install destinations)
- install success rate: 4/4 install paths verified by smoke:example

## Published files

- `LICENSE`
- `package.json`
- `README.md`
- `src/cli.mjs`
- `src/lib/fs-utils.mjs`
- `src/lib/pack.mjs`

## Proof Points

- source CLI path via npm run eval
- Codex AGENTS.md bridge artifact via smoke:example
- packaged CLI entrypoint via tarball install
- release-check gate for README, publish metadata, and workflows
- post-publish verification refresh PR
