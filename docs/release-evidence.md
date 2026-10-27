# Release Evidence

This document lists the evidence package needed to prove a real Packsmith release. It is intentionally split into pre-release and post-release checks.

Current environment note: do not treat this workspace as already published. The local package can be packed, but npm auth and public registry visibility are still blocked in this environment. A maintainer must provide npm and GitHub release credentials before the publish steps can become real release evidence.

Source state for this evidence snapshot:

- origin: https://github.com/chenfei462/packsmith.git
- HEAD: 5f62472d821b7a64b29af17dc472f3545875e348
- package: @packsmith/cli@1.1.0

Bounded local pre-release snapshot captured from this workspace during this refresh:

- `npm.cmd pack --dry-run --json`: pass.
- filename: packsmith-cli-1.1.0.tgz
- entryCount: 294
- boundary: snapshot metadata, not live package checksum claims.

Local tarball hash handling captured for this snapshot:

- command shape: `npm.cmd pack --json --pack-destination <absolute-temp-dir>`
- temp destination: absolute temp destination redacted as `<absolute-temp-dir>`.
- generated file shape: `<absolute-temp-dir>\packsmith-cli-1.1.0.tgz`
- SHA-256 was obtained with `Get-FileHash -Algorithm SHA256` for the temp tarball.
- cleanup: the temp tarball and temp directory were removed after hashing.

External publishing blockers observed from this environment:

- npm whoami: fails with `ENEEDAUTH`.
- npm view @packsmith/cli version: fails with npm `E404`.
- GitHub CLI: unavailable (`gh` is not installed on PATH).

Not-published boundary: this is local pre-release evidence only. `@packsmith/cli@1.1.0` is not published or publicly resolvable from npm in this environment, and no GitHub Release was created here. Dry-run and local tarball output prove package shape, not distribution.

Checksum note: `docs/release-evidence.md` is included in the package file set. Any later edit to packaged files, including this evidence document, changes future tarball byte counts and checksums. Re-run `npm.cmd pack --dry-run --json`, `npm.cmd pack --json --pack-destination <absolute-temp-dir>`, and `Get-FileHash -Algorithm SHA256` immediately before a real publish.

## Pre-Release Evidence

Run these commands from the repository root and save the terminal output in the release notes or release issue.

```bash
npm ci
npm run verify:hackathon:quick
npm run verify:hackathon:ci
node src/cli.mjs --help
node src/cli.mjs search review
node src/cli.mjs show senior-code-reviewer
node src/cli.mjs preview senior-code-reviewer --all-targets
node src/cli.mjs passport senior-code-reviewer
node src/cli.mjs score senior-code-reviewer
node src/cli.mjs registry validate --quality-gate 85
node src/cli.mjs publish official-packs/senior-code-reviewer --dry-run
node src/cli.mjs install senior-code-reviewer --target codex --dry-run
node src/cli.mjs install senior-code-reviewer --target github-copilot --scope project --dry-run
npm pack --dry-run
npm publish --dry-run
```

Proof to capture:

- command, timestamp, working directory, git commit SHA, and exit code
- `npm pack --dry-run` file list proving `src`, `registry`, official packs, docs, license, and package metadata are included
- `npm publish --dry-run` success output proving npm accepts the package shape without actually publishing
- Passport or preview output showing target adapters, checksum status, risk level, and dry-run writes
- CI run URL showing the same commit passed automated tests

## Maintainer Auth Check

Before real npm publication, a maintainer must prove the publishing identity:

```bash
npm whoami
npm access ls-packages
```

Expected proof:

- `npm whoami` prints the maintainer account that owns or can publish `@packsmith/cli`
- `npm access ls-packages` or npm organization settings show publish permission for `@packsmith/cli`

Do not run `npm publish` from an unauthenticated environment, and do not claim a release is published from dry-run output alone.

## Real Publish Checklist

Only after all pre-release evidence and auth checks pass:

```bash
npm publish --access public
```

Proof to capture:

- exact publish command
- npm success output
- published package name and version, for example `@packsmith/cli@1.1.0`
- npm package page URL once the version is visible
- immutable tarball URL or npm metadata showing the version exists

## Checksum Evidence

After `npm pack` or after downloading the npm tarball, capture checksums for the released artifact.

Captured local pre-release tarball evidence boundary:

```text
file: packsmith-cli-1.1.0.tgz
source: local npm.cmd pack from this workspace into an absolute temp directory, not the final npm registry tarball
status: SHA-256 was obtained for the local temp tarball snapshot, but exact bytes and digests must be recaptured immediately before publish because packaged docs are self-referential.
```

PowerShell:

```powershell
Get-FileHash .\packsmith-cli-1.1.0.tgz -Algorithm SHA256
```

POSIX shell:

```bash
shasum -a 256 packsmith-cli-1.1.0.tgz
```

Proof to capture:

- tarball filename
- SHA-256 checksum
- command output
- whether the checksum came from local `npm pack` or the downloaded npm artifact

## Signing evidence

Packsmith does not have signed official-pack bundles yet. When the [Signing design](./signing-design.md) is implemented, each signed release should capture:

- signed bundle filename and SHA-256 digest
- Sigstore/Cosign signature material or transparency-log reference
- SLSA-style provenance file or attestation URL
- verified publisher key or identity
- clean-environment verification command output
- registry entry showing the same pack id, version, digest, publisher, and provenance reference

## GitHub Release Checklist

Because `gh` is not available in this environment, create the GitHub Release through an authenticated maintainer machine or the GitHub web UI.

Release evidence should include:

- tag name matching the npm version, for example `v1.1.0`
- release URL
- release notes summarizing CLI behavior, official packs, and verification commands
- attached checksum file or checksum text in the release body
- link to the passing CI run for the release commit
- link to the npm package version

Optional authenticated command on a maintainer machine:

```bash
gh release create v1.1.0 --title "Packsmith v1.1.0" --notes-file RELEASE_NOTES.md
```

## CI Badge Evidence

The README or release page should include a CI badge only after the workflow exists and passes on the release branch.

Proof to capture:

- workflow URL for the release commit
- badge URL
- screenshot or copied status showing passing state
- commit SHA matching the published package

Do not claim the badge is green unless the linked workflow run is actually passing for the release commit.

## Post-Release npx Verification

After npm publication has propagated, verify installation from the public registry with a clean cache or a fresh environment.

```bash
npm run verify:postpublish
```

The scripted post-publish gate pins the public package to the release version from `package.json`, runs with an isolated npm cache, executes the same external checks below, and stops on the first failure:

```bash
npx --yes @packsmith/cli@1.1.0 --help
npx --yes @packsmith/cli@1.1.0 search review
npx --yes @packsmith/cli@1.1.0 show senior-code-reviewer
npx --yes @packsmith/cli@1.1.0 preview senior-code-reviewer --target codex
npx --yes @packsmith/cli@1.1.0 passport senior-code-reviewer
```

Proof to capture:

- command output showing `npx` resolves the published `@packsmith/cli@1.1.0` from npm
- `packsmith` help text with expected commands
- search/show output proving bundled registry data is present
- preview/passport output proving the installed package can inspect `senior-code-reviewer`

## Evidence Status Table

| Evidence item | Current status | Proof needed |
| --- | --- | --- |
| Local tests | Passed locally during this evidence refresh; full CI evidence still needed | Passing CI URL for the release commit |
| Pack dry-run | Snapshot recorded 294 entries for `packsmith-cli-1.1.0.tgz` | Final `npm pack --dry-run` output for the release commit |
| Publish dry-run | Not refreshed in this environment for this evidence update | Final `npm publish --dry-run` output from the maintainer machine |
| npm auth | Missing in this environment | Maintainer `npm whoami` and package access proof |
| Real npm publish | Not performed | `npm publish --access public` success output |
| GitHub Release | Not performed here; `gh` is not installed on PATH | Release URL, tag, notes, checksum, CI link |
| Checksum | SHA-256 was obtained for a local temp tarball snapshot; exact release checksum must be recaptured | SHA-256 for final npm registry tarball |
| CI badge | Pending release commit | Passing workflow URL and badge URL |
| `npx` verification | Requires npm publication | `npm run verify:postpublish` and public `npx --yes @packsmith/cli@1.1.0 ...` command output |

## Claiming Rules

- Dry-run output proves package readiness, not publication.
- `npm whoami` proves identity, not that a package was published.
- A GitHub tag proves source state, not npm availability.
- `npx --yes @packsmith/cli@1.1.0 --help` after publication proves that exact released version resolves for users.
- The release is fully evidenced only when npm, GitHub Release, checksum, CI, and post-release `npx` verification all point to the same version and commit.
