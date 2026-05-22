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
- toolchain: Node v24.16.0, npm unavailable
- npm pack dry-run footprint: 6 files, 17.3 KB
- npm pack artifact: `chenfei462-packsmith-0.1.0.tgz`
- npm pack shasum: `a129f10d9ecb970a3439861b21dc3fdec25b6121`
- npm pack integrity: `sha512-ZEt1/TTrF5W16BI1Ea9dt2vUGbQBioBIPitfub6aIFCAqj1PgDc3WIBcrrB3ZsLqdoFqF5QJXvbFfTJW7/sdgQ==`
- clean-machine demo: `npm run smoke:example` (temporary workspace, HOME, npm prefix, and install destinations)
- install success rate: 4/4 install paths verified by smoke:example

## Published files

- `LICENSE`
- `README.md`
- `package.json`
- `src/cli.mjs`
- `src/lib/fs-utils.mjs`
- `src/lib/pack.mjs`

## Proof Points

- source CLI path via npm run eval
- Codex AGENTS.md bridge artifact via smoke:example
- packaged CLI entrypoint via tarball install
- release-check gate for README, publish metadata, and workflows
- post-publish verification refresh PR
