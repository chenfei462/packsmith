# Release Playbook

Packsmith 0.1.x releases are public stable previews. Do not promote the project to `1.0.0` until remote registry, broader install adapters, and compatibility policy are intentionally scoped.

## Version Rules

- Use `0.1.x` for the first public stable line.
- Keep package version, changelog entry, GitHub Release tag, README proof block, and verification snapshot aligned.
- Use tags named `v0.1.0`, `v0.1.1`, and so on.

## Release Order

1. Merge the final release-prep code and documentation.
2. Run `node --test tests/pack.test.mjs`.
3. Run `node scripts/eval.mjs`.
4. Run `node scripts/release-check.mjs`.
5. Create GitHub Release `v0.1.0`.
6. Let `publish.yml` publish `@chenfei462/packsmith` to npm through npm trusted publishing.
7. Wait for the post-publish verification refresh workflow to open a PR.
8. Review and merge the PR if it only changes `README.md`, `docs/verification.json`, `docs/verification.md`, and generated verification SVG assets.

`node scripts/eval.mjs` must include the clean-machine demo from `npm run smoke:example`. The release is not ready unless the generated verification snapshot reports the install success rate as `4/4`: source CLI, Codex `--dest`, Claude Code scoped lifecycle, and packaged tarball CLI.

## Publish Entry

GitHub Release is the only official publish entry. Do not depend on local `npm publish`; local npm wrapper state is not part of the release contract.

`publish.yml` must keep:

- `id-token: write`
- `actions/setup-node` with `registry-url: https://registry.npmjs.org`
- `npm run eval`
- uploaded `verification-snapshot`
- `npm publish --provenance --access public`

## Post-Publish Verification Refresh

After npm publication, run `npm run verification:sync`. The workflow must open a PR rather than push directly to `main`.

The expected PR diff is limited to generated proof assets:

- `README.md`
- `docs/verification.json`
- `docs/verification.md`
- `docs/assets/packsmith-verification-card.svg`
- `docs/assets/packsmith-demo-terminal.svg`

The proof block must bind README, release notes, and CI to the same facts: clean-machine demo command, install success rate, npm pack shasum, and current npm publication state.

## Installed Lifecycle Contract

For Claude Code scoped installs, install and upgrade write a version lock, install source, timestamp, and managed file hashes under `.claude/packsmith/<pack-name>/`. `packsmith doctor` uses that lock to report missing files, drift, and unmanaged skill directories. `packsmith upgrade` refreshes the same metadata and records the previous locked version; `packsmith uninstall` removes the managed files listed by the same bundle metadata. Rollback is therefore a patch-release or reinstall operation followed by doctor, while npm-level bad releases still use the deprecate flow below.

## Rollback And Deprecate

If npm publication succeeds with a broken package:

1. Do not delete the GitHub Release unless the artifact itself is misleading.
2. Publish a patch release when the fix is straightforward.
3. Use `npm deprecate @chenfei462/packsmith@<bad-version> "Use <fixed-version>"` when users should avoid the bad version.
4. Add a changelog note describing the bad version and the replacement.
5. Re-run `node scripts/release-check.mjs` after the replacement proof refresh PR lands.
