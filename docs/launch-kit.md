# Launch Kit

## GitHub Release Body

Packsmith `0.1.0` is the first public stable preview for `@chenfei462/packsmith`.

It packages reusable agent skills and prompts from one source pack into target-specific bundles for Claude Code and Codex. The release keeps the surface intentionally narrow: local source packs, strict validation, context inspection, build/install flows, and proof refresh automation.

Verification:

- `node --test tests/pack.test.mjs`
- `node scripts/eval.mjs`
- `node scripts/release-check.mjs`

Install after npm publication:

```bash
npm install -g @chenfei462/packsmith
packsmith --help
packsmith init demo-pack
```

## npm Page Positioning

Author once, validate once, and build reusable agent skill packs for Claude Code and Codex.

## Community Announcement

Version A:

Packsmith `0.1.0` is out as `@chenfei462/packsmith`: a zero-dependency CLI for packaging reusable coding-agent skills and prompts. It supports validation, context inspection, target bundle builds, Claude Code scoped installs, and Codex `--dest` installs.

Version B:

I released Packsmith `0.1.0`, a small CLI for turning one source skill pack into installable bundles for multiple agent runtimes. The initial scope is deliberately practical: Claude Code, Codex, local packs, strict validation, and reproducible release proof.

Version C:

If you are copying agent skill folders by hand, Packsmith is a packaging layer for that workflow. `0.1.0` ships with example packs, tarball verification, npm trusted publishing, and machine-generated release evidence.

## 60-90 Second Demo

```bash
npm install -g @chenfei462/packsmith
packsmith --help
packsmith init demo-pack
packsmith inspect demo-pack
packsmith validate demo-pack --strict
packsmith build demo-pack
packsmith install demo-pack --target codex --dest ./demo-codex-install
packsmith install demo-pack --target claude-code --scope project
packsmith list --target claude-code --scope project
packsmith doctor --target claude-code --scope project
packsmith uninstall demo-pack --target claude-code --scope project
```

## Issue Seed

1. Add runtime-specific lint rules for Claude Code and Codex bundles.
2. Design lockfile format for installed pack provenance.
3. Prototype remote pack source metadata without adding registry hosting.
4. Add signed bundle verification notes to the release proof flow.
5. Improve install diagnostics when a target directory is read-only.
