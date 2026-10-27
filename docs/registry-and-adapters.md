# Registry And Target Adapters

Packsmith's registry and adapter layer is intentionally practical in this release. Discovery, local installation, remote catalog refresh, and checksum-pinned GitHub archive installs work today. Cryptographic publisher signing and remote publish remain future work; see [Signing design](./signing-design.md) for the planned official-pack trust model.

## Registry Catalog

The default catalog is packaged at `registry/catalog.json`. Commands that read it:

```bash
packsmith search review
packsmith show senior-code-reviewer
packsmith preview senior-code-reviewer
packsmith install senior-code-reviewer --yes
packsmith registry validate --quality-gate 85
```

Use a custom local catalog with:

```bash
packsmith search review --registry ./catalog.json
packsmith install senior-code-reviewer --registry ./catalog.json --target codex
```

Catalog shape:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-05-24T00:00:00.000Z",
  "packs": [
    {
      "id": "senior-code-reviewer",
      "name": "Senior Code Reviewer",
      "description": "Finds bugs, regressions, missing tests, risky changes, and unclear behavior before a change ships.",
      "version": "0.1.0",
      "author": "packsmith",
      "category": "code-quality",
      "tags": ["packsmith", "review", "quality", "testing", "risk"],
      "targets": ["claude-code", "codex", "opencode", "cursor"],
      "source": "../official-packs/senior-code-reviewer",
      "license": "MIT",
      "riskLevel": "low",
      "estimatedContextSize": 4200,
      "usageExample": "packsmith install senior-code-reviewer",
      "verified": true,
      "repository": "https://github.com/chenfei462/packsmith/tree/main/official-packs/senior-code-reviewer",
      "updatedAt": "2026-05-24T00:00:00.000Z",
      "stars": 82,
      "installCount": 640
    }
  ]
}
```

`source` may be either a local path string or a remote metadata object. Relative local paths resolve from the catalog file.

GitHub archive source entries are installable when they include a checksum:

```json
{
  "source": {
    "type": "github-archive",
    "repo": "packsmith/official-packs",
    "path": "packs/senior-code-reviewer",
    "ref": "v0.1.0",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "checksum": "sha256-...",
    "schemaVersion": 1
  }
}
```

Packsmith downloads GitHub Contents API files into `~/.packsmith/source-cache`, verifies the source checksum, builds a target bundle, and then verifies the generated install-plan checksum before writing files. Other remote source types such as `http-archive` and `npm-tarball` are still metadata-only until their integrity rules are added.

Remote catalog refresh:

```bash
packsmith registry add official https://raw.githubusercontent.com/packsmith/registry/main/catalog.json
packsmith registry use official
packsmith registry refresh
```

`registry refresh` caches the active remote catalog in `~/.packsmith/registry-cache/<name>.catalog.json` with source URL, cached timestamp, and checksum metadata. Installing from a refreshed remote registry requires `--yes`, `--policy <file>`, or interactive confirmation.

Launch-required fields:

- `id`
- `name`
- `description`
- `version`
- `author`
- `category`
- `tags`
- `targets`
- `source`
- `license`
- `riskLevel`
- `estimatedContextSize`
- `usageExample`

The richer optional fields are supported for discovery and social proof:

- `repository`: source or project URL
- `updatedAt`: most recent registry/source update
- `stars`: social proof count from the pack source or curated registry signal
- `installCount`: registry install/download signal

Packsmith displays defaults for missing optional social-proof fields, but official launch entries should include them.

## Publish Dry Run

`packsmith publish <pack-dir> --dry-run` is the local half of the publish flow. It:

- validates the source pack
- runs doctor checks
- prints a registry entry preview
- explains the next `packsmith registry validate` step
- does not upload or claim a remote publish

This keeps submission work testable without pretending a hosted registry exists.

## Official Packs

Bundled official packs live in `official-packs/`. The published registry and `package.json#files` include 53 runtime-complete official packs across code quality, repository understanding, product launch, documentation, and agent workflow. Every bundled pack has a manifest, skill entry, prompt, permissions, tags, context size, source metadata, and risk metadata. The 30 launch-ready packs also include README files and `examples/usage.md`.

They are normal source packs. Validate them the same way as user packs:

```bash
packsmith validate official-packs/senior-code-reviewer
packsmith doctor official-packs/senior-code-reviewer
packsmith registry validate --quality-gate 85
```

`registry validate` checks catalog fields, duplicate IDs, target IDs, source paths, source pack validity, optional social-proof field types, GitHub source metadata, quality gates, and version/name alignment between catalog entries and source manifests. Non-GitHub HTTP sources are skipped until archive-specific integrity is implemented.

## Target Adapter Shape

Target metadata lives in `src/lib/targets.mjs`. Each adapter records:

- runtime id and display name
- supported platforms
- support status
- default install subdirectory
- config files
- skill directory format
- prompt format
- generated bridge files
- validation rules
- compatibility warnings

Per-target docs:

- [Claude Code](./adapters/claude-code.md)
- [Codex](./adapters/codex.md)
- [GitHub Copilot](./adapters/github-copilot.md)
- [Cursor](./adapters/cursor.md)
- [OpenCode](./adapters/opencode.md)
- [TRAE](./adapters/trae.md)

## Current Targets

Claude Code, Codex, GitHub Copilot, and TRAE are supported with runtime-specific bridge behavior:

- Claude Code: copied skills/prompts plus README and bundle metadata under `~/.claude/skills/<pack-name>`
- Codex: copied skills/prompts plus generated `AGENTS.md` under `~/.codex/skills/<pack-name>`
- GitHub Copilot: copied skills/prompts plus generated `SKILL.md` under `.github/skills/<pack-name>` for project scope or `~/.copilot/skills/<pack-name>` for personal scope
- TRAE: copied skills/prompts plus generated `SKILL.md` under `.trae/skills/<pack-name>`, `.traecli/skills/<pack-name>`, or `~/.trae-cn/skills/<pack-name>`

OpenCode and Cursor have baseline install support:

- OpenCode: copied Packsmith assets plus `PACKSMITH.md` under `~/.opencode/skills/<pack-name>`
- Cursor: copied Packsmith assets plus generated `<pack-name>.mdc` under `~/.cursor/rules/packsmith/<pack-name>`

Baseline support means Packsmith installs useful files and bridge guidance without claiming all upstream-native conventions are finalized. Gemini CLI, OpenClaw, and Hermes Agent stay planned until their extension or skill layouts are confirmed.

## Automatic Target Detection

When `--target` is omitted, Packsmith checks for known local install roots such as:

- `~/.claude/skills`
- `~/.codex/skills`
- `.github/skills`
- `~/.copilot/skills`
- `~/.opencode/skills`
- `~/.cursor/rules/packsmith`
- `.trae/skills`
- `.traecli/skills`
- `~/.trae-cn/skills`

If one target is present and the pack supports it, Packsmith installs there. If multiple targets are present in an interactive terminal, Packsmith asks which one to use. In non-interactive shells it installs to all detected supported targets. If none are present, Packsmith falls back to the first currently supported target in the manifest so first-run installation still works.

Use `--dry-run` to preview the exact target and path:

```bash
packsmith install senior-code-reviewer --dry-run
```

## Adding A Real Adapter

Before changing a planned adapter to `supported`, confirm the runtime's install path and file format from primary runtime documentation or source code. Then add:

- generated bundle behavior in `src/lib/pack.mjs`
- install path rules in `src/lib/targets.mjs`
- validation or doctor warnings
- CLI tests for install, remove, list, and audit behavior
- README and roadmap updates
