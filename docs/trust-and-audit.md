# Trust And Audit

Packsmith's trust layer is local and inspectable in this release. It does not claim signed publishing yet. See [Signing design](./signing-design.md) for the planned cryptographic trust model for official packs.

The current priority is deliberate: first make useful packs discoverable, installable, demoable, and npm-publishable. Advanced signing and publisher-key infrastructure should protect a real ecosystem, not delay the basic "find pack -> install pack -> use pack" loop.

## Installed State

Packsmith stores state in `~/.packsmith` by default. Set `PACKSMITH_HOME` to use another directory.

State files:

```text
~/.packsmith/
  packsmith.lock
  receipts/
    senior-code-reviewer.codex.json
```

`packsmith.lock` records installed pack name, version, target, install directory, source, registry path, verification flag, checksum, and installation time.

Each receipt records the same provenance plus manifest permissions and the installed file list.

Registry state also includes:

```text
~/.packsmith/
  registry-cache/
    official.catalog.json
  source-cache/
    packsmith-official-packs-packs-senior-code-reviewer-v0.1.0-...
```

`registry-cache` stores refreshed remote catalogs with source URL and checksum metadata. `source-cache` stores checksum-verified GitHub archive sources before Packsmith builds target bundles.

## Enterprise Default

When a policy file omits permission allowlists, Packsmith's default allows only `filesystem` as a required permission. Required `shell`, `network`, and `browser` permissions are blocked before install and during policy audit unless the policy explicitly opts them in with `allowedRequiredPermissions`.

## Install Preview

Before writing files, Packsmith can produce an install plan:

```bash
packsmith preview senior-code-reviewer --target codex
packsmith install senior-code-reviewer --target codex --dry-run --json
```

The plan includes target runtime, scope, install directory, exact writes, permissions, risk level, context size, source, source checksum when present, target checksum, publisher, verified flag, and whether the pack contains scripts, binaries, executable files, or large files. High-risk packs are blocked unless the user explicitly passes `--allow-risk high`.

When a pack comes from a refreshed remote registry, non-interactive installs require one of:

- `--yes` after previewing the plan
- `--policy <file>` that permits the pack

Interactive terminals are prompted before the write step.

## Permissions

Packs can declare permission intent in `packsmith.json`:

```json
{
  "permissions": {
    "shell": "optional",
    "filesystem": "required",
    "network": "none",
    "browser": "none"
  }
}
```

Packsmith reports these declarations during audit. With `--policy`, required permissions are enforceable allowlist gates before install and during audit; this is not a runtime sandbox.

## Checksums

After install, Packsmith hashes the installed directory and stores the checksum in the lockfile and receipt. `packsmith audit` recomputes that checksum and reports mismatches.

Example:

```bash
packsmith sync
packsmith sync --policy examples/policy.json
packsmith audit
packsmith audit --ci
packsmith policy validate examples/policy.json
packsmith audit --policy examples/policy.json --ci
```

Output includes:

- pack and version
- target
- source
- verified metadata flag
- current checksum
- update status from local registry metadata when a receipt records a local catalog
- checksum mismatch or missing directory warnings
- declared permissions

With `--ci`, Packsmith exits non-zero when any installed pack has audit warnings, such as a checksum mismatch, missing install directory, or missing lockfile entry.

## Update Status

For packs installed from a local registry catalog, `packsmith audit` reads the recorded catalog and compares the installed version to the current catalog entry.

Possible update values:

- `current`: the catalog version matches the installed version.
- `available <version>`: the catalog lists a newer version.
- `not checked`: the install did not record a local registry catalog.
- `not found`: the recorded registry no longer includes the pack.
- `unavailable`: the recorded registry could not be read.

Remote catalog caches can be refreshed with `packsmith registry refresh`. Audit reports unavailable registry state if the recorded registry cache or local catalog cannot be read. Remote update checks are limited to cached/local catalog metadata; publisher-key freshness is future work.

## Sync

`packsmith sync` reads `packsmith.lock` and restores tracked installs from local source records. It is intended for team setup and CI bootstrap where a workspace already has a lockfile but install directories may be missing.

Current sync scope:

- local source paths recorded in `packsmith.lock`
- checksum-verified GitHub archive source caches recorded as `sourceCachePath`
- target and install destination recorded at install time
- existing local registry installs whose recorded source path still exists
- `source unavailable` status for remote URLs or missing local source paths

`packsmith sync --policy <file>` runs policy-aware audit after the sync and exits non-zero when any synchronized install has warnings or policy violations.

## Policy Files

Policy files are local JSON files used by `packsmith audit --policy <file>`. Run `packsmith policy validate <file>` before putting a policy into CI.

```json
{
  "requiredVerified": true,
  "allowedPublishers": ["packsmith"],
  "blockedPacks": [],
  "allowedRequiredPermissions": ["filesystem"],
  "maxRisk": "medium",
  "allowedTargets": ["codex", "github-copilot"],
  "maxContextSize": 24000
}
```

Supported fields:

- `requireVerified` or `requiredVerified`: when true, every installed pack must come from a registry entry marked `verified`.
- `allowedRegistries`: optional allowlist of catalog paths. Relative paths are resolved from the policy file location.
- `allowedPublishers`: optional allowlist matched against registry entry `author` metadata recorded at install time.
- `blockedPacks`: pack IDs that must not be installed.
- `allowedPacks`: optional allowlist. When present, installed packs not in the list fail policy.
- `allowedRequiredPermissions` or `allowedPermissions`: permissions allowed to be declared as `required`. When both are omitted, the default allows only `filesystem`; required `shell`, `network`, and `browser` permissions are blocked by policy.
- `maxRisk`: maximum allowed risk level, one of `low`, `medium`, `high`, or `blocked`.
- `allowedTargets`: target IDs that installed packs may use.
- `maxContextSize`: maximum estimated context size in characters. Install is blocked when a pack's estimated context size (registry `estimatedContextSize`, or the manifest `context.estimatedChars` estimate shown in preview) exceeds it, and audit reports a policy issue when the installed pack's recorded `estimatedContextChars` exceeds it. Guards against context-poisoning packs that would overflow the agent's context window.

Policy violations appear in audit output and make `audit --policy <file> --ci` exit non-zero.

`packsmith install <pack> --policy <file>` evaluates the install plan before writing files. Policy failures block the install and leave target directories unchanged.

`policy validate` checks:

- policy file existence and JSON parsing
- supported field names
- boolean `requireVerified` or `requiredVerified`
- string arrays for pack, registry, publisher, and permission allowlists
- known permission names: `shell`, `filesystem`, `network`, and `browser`
- local or HTTP `allowedRegistries` values
- known `allowedTargets`
- valid `maxRisk`
- positive finite number `maxContextSize`

Older receipts created before publisher metadata was recorded are treated as publisher `(unknown)`.

## Verified Metadata

The registry `verified` field means the catalog marks a pack as verified. It is useful provenance metadata, not a cryptographic signature.

Deferred trust work:

- signed bundles, as described in [Signing design](./signing-design.md)
- publisher keys
- update availability checks against uncached remote registries
- remote publisher key verification

These become higher priority after the registry has sustained content growth, npm distribution is live, the TUI/demo loop is visible, and Claude Code, Codex, OpenCode, and Cursor installs have had real user feedback.
