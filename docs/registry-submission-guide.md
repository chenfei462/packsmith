# Registry Submission Guide

The bundled registry is a local JSON catalog at `registry/catalog.json`. Remote catalog refresh and checksum-pinned GitHub archive source installs are supported; signing and publisher keys are still future work. See [Signing design](./signing-design.md) for the planned path to signed official packs.

## Submission Requirements

A registry pack must:

- include a buildable `packsmith.json`
- pass `packsmith validate <pack-dir>`
- pass `packsmith doctor <pack-dir>` and the registry quality gate
- use a stable pack `name` and registry `id`
- include `category`, `license`, `riskLevel`, `estimatedContextSize`, and `usageExample`
- declare `permissions`
- include at least one supported target or clearly documented planned target
- point `source` to a local path in this repository for bundled registry entries
- include useful `tags`, `updatedAt`, `stars`, `installCount`, and `repository` metadata when it is part of the bundled official catalog

The launch registry treats the product metadata fields as required. Optional social-proof fields such as `stars` and `installCount` should still be present for bundled official packs because search and trust are better when users can see activity signals.

## Dry-Run Publish Flow

Run:

```bash
packsmith publish my-pack --dry-run
```

The command validates the pack, runs doctor checks, and prints a registry entry preview. It does not upload to npm, GitHub, or a hosted registry.

Then add the entry to a local catalog and validate:

```bash
packsmith registry validate --registry registry/catalog.json --quality-gate 85
```

## Catalog Entry

```json
{
  "id": "senior-code-reviewer",
  "name": "Senior Code Reviewer",
  "description": "Finds bugs, regressions, missing tests, and risky changes across agent runtimes.",
  "version": "0.1.0",
  "author": "packsmith",
  "category": "code-quality",
  "tags": ["packsmith", "review", "quality", "testing", "risk"],
  "targets": ["claude-code", "codex", "github-copilot", "opencode", "cursor"],
  "source": "../official-packs/senior-code-reviewer",
  "license": "MIT",
  "riskLevel": "low",
  "estimatedContextSize": 4200,
  "usageExample": "packsmith install senior-code-reviewer",
  "verified": true,
  "publisher": { "id": "packsmith", "verified": true },
  "repository": "https://github.com/chenfei462/packsmith/tree/main/official-packs/senior-code-reviewer",
  "updatedAt": "2026-05-24T00:00:00.000Z",
  "stars": 82,
  "installCount": 640
}
```

Run:

```bash
node src/cli.mjs validate official-packs/senior-code-reviewer
node src/cli.mjs doctor official-packs/senior-code-reviewer
node src/cli.mjs publish official-packs/senior-code-reviewer --dry-run
node src/cli.mjs registry validate --quality-gate 85
```

## Verification Metadata

The `verified` field is catalog metadata, not a cryptographic signature. It should only be true for packs maintained or reviewed by the Packsmith project.

Remote catalog entries and archive sources must include checksum or commit metadata before they can become verified official entries. GitHub archive sources should include `repo`, `path`, `ref` or `commit`, and `checksum`. Remote installs require an install plan preview or `--policy`, and must fail on checksum mismatch.

Future signed official packs should add signature evidence only after Packsmith can verify signed bundles, SLSA-style provenance, and verified publisher keys as described in [Signing design](./signing-design.md).
