# Packsmith Manifest v2 (opt-in source format)

Status: implemented in M12 (2026-10-08). Manifest v2 is **opt-in**: no
existing pack is migrated, `packsmith init` still writes v1, and every
unversioned or `schemaVersion: 1` manifest keeps today's exact semantics.

## Source formats

### v1 (unchanged default)

```json
{
  "name": "my-pack",
  "description": "Reusable skills for my pack.",
  "version": "0.1.0",
  "targets": ["claude-code", "codex"],
  "skills": [
    { "id": "review-pr", "path": "skills/review-pr", "description": "Review pull requests when asked." }
  ],
  "prompts": [
    { "id": "starter", "path": "prompts/starter.md", "description": "Starter prompt." }
  ]
}
```

Omitting `schemaVersion` and writing `"schemaVersion": 1` behave identically.
The manifest's `id`/`description` declarations are authoritative.

### v2 (`"schemaVersion": 2`)

```json
{
  "schemaVersion": 2,
  "name": "my-pack",
  "description": "Reusable skills for my pack.",
  "version": "0.2.0",
  "targets": ["claude-code", "codex"],
  "skills": ["skills/review-pr", "skills/write-changelog"],
  "prompts": [
    { "id": "starter", "path": "prompts/starter.md", "description": "Starter prompt." }
  ],
  "reliability": { "runs": 2, "minRecall": 0.5, "minPrecision": 0.5 }
}
```

- `skills` is a non-empty array of **safe relative directory-path strings**
  (forward slashes, no `..`/`.`, no absolute paths, no backslashes, no NTFS
  ADS colons, no Windows reserved device names, no trailing dots/spaces).
  `prompts` keeps the existing prompt-entry object shape and defaults to `[]`.
- **SKILL.md is authoritative.** For every declared path, the pack's real
  filesystem boundary is verified first (realpath of the pack root, the skill
  directory and its `SKILL.md`; a symlink or junction is allowed only when it
  resolves inside the pack), and only then is the frontmatter parsed with the
  existing skill parser. A usable `name` and `description` are required; the
  normalized Skill `id` is the frontmatter `name`. Duplicate paths, duplicate
  derived ids, missing/unusable frontmatter and any containment escape are
  rejected **before any build or install write** — the source file is never
  rewritten.
- Any other `schemaVersion` value fails deterministically before output.

## Normalized built-bundle shape

Build/validate/inspect consume the same normalized manifest. The generated
`dist/<pack>/manifest.json` keeps the current bundle structure so every
installer stays compatible:

```json
{
  "schemaVersion": 2,
  "name": "my-pack",
  "description": "…",
  "version": "0.2.0",
  "targets": ["claude-code"],
  "skills": [
    { "id": "review-pr", "path": "skills/review-pr", "description": "Review pull requests when asked." }
  ],
  "prompts": [ … ],
  "reliability": { "runs": 2, "minRecall": 0.5, "minPrecision": 0.5 }
}
```

Skills are object entries again (`{id, path, description}`), derived from
SKILL.md; all other project metadata passes through untouched.

## Reliability thresholds: validated metadata only

`reliability` is optional. `runs` must be an integer 1..20, `minRecall` and
`minPrecision` numbers between 0 and 1; unknown keys, arrays and nulls are
rejected. The validated object is preserved as pack metadata — **it does not
change `packsmith ci` verdicts, scoring, or any runner in M11/M12, and it
never triggers model runs.** Enforcing these thresholds is a later, explicit
change; nothing in the current gate reads them.

## Failure behavior

All v2 problems are reported as controlled `packsmith.json: …` messages
(never raw YAML excerpts, never a TypeError) by both the fail-fast loaders
(build/inspect) and `packsmith validate`'s collected report, and both paths
share one normalization boundary (`normalizeSourceManifest`).
