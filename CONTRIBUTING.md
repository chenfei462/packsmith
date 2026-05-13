# Contributing

## Principles

- Keep Packsmith portable and dependency-light.
- Prefer primary GitHub evidence when adding target-specific rules.
- Do not add agent-specific behavior unless it improves a real packaging or installation workflow.
- Update `docs/runtime-assumptions.md` when a change depends on a new runtime contract.

## Local workflow

```bash
npm test
npm run smoke:example
npm run examples:check
npm run release:check
node src/cli.mjs inspect examples/research-launchpad
node src/cli.mjs validate examples/research-launchpad --strict
node src/cli.mjs install examples/research-launchpad --target claude-code --scope project
node src/cli.mjs doctor --target claude-code --scope project
```

## Validation expectations

- `SKILL.md` must exist for every skill.
- `SKILL.md` must begin with YAML frontmatter.
- Frontmatter must include non-empty `name` and `description`.
- Skill `name` should use lowercase letters, numbers, and hyphens.
- Use `validate --strict` before proposing distribution-facing changes.

## Install semantics

- For `claude-code`, prefer `install --scope user` or `install --scope project` when testing real installs.
- `install` may receive either a source pack directory or a prebuilt bundle directory.
- `doctor` should help catch both broken tracked installs and unmanaged skill directories.
- For `codex`, keep using explicit `--dest` because the bundle is still repo-oriented around `AGENTS.md`.

## Release checks

- `npm run release:check` must pass before release-oriented PRs land.
- The publish workflow is expected to use npm trusted publishing and provenance.
- Keep published package contents intentionally small; re-run `npm pack --dry-run` after changing release files.

## What good contributions look like

- new target adapters with clear installation semantics
- stronger validation rules grounded in real runtime behavior
- better context inspection and duplication detection
- better release/readiness tooling that keeps local and CI checks aligned
- better example packs that prove real use cases

## What to avoid

- turning Packsmith into a hosted service
- adding large dependencies for simple filesystem tasks
- adding generic AI wrappers without a packaging angle
