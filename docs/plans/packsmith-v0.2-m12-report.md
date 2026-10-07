# Packsmith v0.2 — M12 optional Manifest v2 report

Date: 2026-10-08. Branch: `feat/v0.2-reliability-gate`. Scope: §27 Manifest v2 per `docs/plans/packsmith-v0.2-m12-execution-plan.md` (reviewer-owned; not committed by the implementer). Roles: ZCode implements; Codex independently reviews. Starting point: `f25c385` (Wave 3 accepted through M11 + the runner-boundary caseIds fix).

## Delivered behavior

An optional `packsmith.json` `"schemaVersion": 2` derives each Skill's identity from its own `SKILL.md`:

- **One normalization boundary** (`normalizeSourceManifest` in `src/lib/pack.mjs`, exported for focused tests) is called by BOTH the fail-fast loaders (`loadManifest` → build/inspect/validate) and collected validation (`collectValidationIssues` → `packsmith validate`). v1 — missing `schemaVersion` or explicit `1` — passes through untouched, so all current unversioned/v1 pack behavior is byte-identical (covered by frozen compatibility tests).
- **v2 skills are safe relative directory-path strings.** The boundary validates each path with the existing path validator (traversal, absolute, backslash, NTFS ADS, Windows reserved names, trailing dots/spaces, non-normalized forms), rejects duplicate paths and duplicate SKILL.md-derived ids, and requires `SKILL.md` frontmatter `name`/`description` to be non-empty strings. The normalized `id` is the frontmatter `name`; SKILL.md is authoritative for v2 Skill identity and description.
- **Containment before reads.** The pack root, each skill directory and its `SKILL.md` are `lstat`ed and `realpath`ed; every real location must stay inside the pack's REAL boundary (`containsPath` against the realpath of the pack root, case-insensitive on Windows). A symlink or junction escape is refused before anything outside the pack is read; nothing outside is adopted or echoed.
- **Normalized output shape.** The boundary returns the existing internal `{id, path, description}` skill-object shape, so the pack builder, inspector, validator and every bundle/installer keep one downstream contract. The built `manifest.json` keeps the current bundle structure (plus the declared `schemaVersion: 2` and optional `reliability`), so installs work through unchanged installer code. The source `packsmith.json` is never rewritten. `init` remains v1. `doctor` never reads `packsmith.json` (it discovers skills from directories), so v2 changes nothing for it — stated as a fact, not a change.
- **Reliability metadata is validated, preserved, and NOT enforced.** Optional `reliability`: `runs` integer 1..20, `minRecall`/`minPrecision` numbers 0..1; unknown keys, arrays and nulls are rejected. The validated object is preserved into the built manifest but deliberately does NOT change `packsmith ci` verdicts, scoring or any runner, and never triggers model runs. Enforcement is a later, explicit change (documented in `docs/manifest-v2.md`).
- **Fail before writes.** Unsupported versions (anything other than missing/1/2), malformed v2 metadata and unsafe paths fail as controlled `packsmith.json: …` messages — never a TypeError, never a raw YAML excerpt (the existing parser's status name is reported; raw parse errors stay local) — before any build output or installation write. `packsmith validate` collects multiple v2 issues in one report.

## TDD evidence (this host, real exit codes)

- **Red first**: `node --test tests/pack-manifest-v2.test.mjs` before implementation = **13 tests / 2 pass / 10 fail / 1 skip**. The 2 passes are the v1 compatibility freezes (the compat contract already held); every v2 test failed meaningfully (v2 unrecognized, boundary function absent, `validatePack` reporting the misleading v1 `skill.id` error instead of v2 semantics).
- **Green after implementation**: same file = **13 tests / 12 pass / 0 fail / 1 skip**. The one skip is the SKILL.md file-symlink escape test: creating a file symlink on Windows requires privileges, so the test takes the explicit skip guard (the directory-junction escape test DOES run on this host and passes). POSIX symlink runs when privileges allow.
- Coverage: v1 freeze (unversioned ≡ explicit `schemaVersion: 1`, verbatim built manifest, verbatim pass-through of unknown v1 fields); v2 derivation end-to-end (validate → inspect → build → `installBundle` consumer install, source bytes unchanged, `manifest.json` normalized + `schemaVersion: 2`); prompts default `[]`; unsupported versions (3, 0, `"2"`, null) refusing with no output directory created; mixed object/string entries; empty/missing skills; duplicate paths; duplicate derived ids; missing `SKILL.md`; invalid YAML without content echo; missing/empty/non-string name or description; the ten-case unsafe-path matrix; directory-junction realpath escape (outside content never adopted); SKILL.md file-symlink escape (privilege-guarded); the full reliability valid/invalid matrix; multi-issue collected reporting.

## Full gates and consumer controls

- Full `npm test`: **549 tests / 542 passed / 0 failed / 7 skipped, exit 0** (~95 s). Reconciliation: 536 (post-M11-fix) + 13 new M12 tests = 549; skips 6 → 7 (the new Windows file-symlink privilege skip).
- Real-CLI consumer controls on a v2 fixture (isolated `PACKSMITH_HOME`): `packsmith validate` exit 0; `packsmith inspect` exit 0 with the SKILL.md-derived `id`; `packsmith build` exit 0 with `manifest.json` carrying `"schemaVersion": 2`, the derived skill id and the preserved `reliability` object; `packsmith install` exit 0 with the normalized manifest installed. Negative control: a v2 pack declaring `../escape` is refused by `packsmith build` with the safe-relative-path message and **no output directory written**.
- v1 fixtures and official packs are unaffected (no existing `packsmith.json` in the repo declares `schemaVersion` — verified before implementation).

## Files

- `src/lib/pack.mjs` — `normalizeSourceManifest` (the shared v1/v2 boundary: schema detection, v2 path safety, realpath containment, SKILL.md authority, duplicate detection, reliability metadata validation), `realpathInsidePack`, `manifestSchemaVersion`; `loadManifest` fail-fast wiring; `collectValidationIssues` version-aware wiring (v1 loops unchanged)
- `tests/pack-manifest-v2.test.mjs` — the focused TDD suite above (registered in `package.json`)
- `package.json` — test registration only
- `docs/manifest-v2.md` — v1/v2 source examples, normalized bundle shape, SKILL.md authority, reliability no-enforcement status
- `docs/plans/packsmith-v0.2-m12-report.md` — this report

## Boundary

- No forced migration: `init` stays v1, no existing pack was modified, no package-version change, no push/publish, and no real model calls anywhere in M12.
- The reviewer-owned execution plan (`docs/plans/packsmith-v0.2-m12-execution-plan.md`) was read but not committed; no acceptance file is included in the implementer commit.
- Reliability thresholds are validated metadata only; nothing in `packsmith ci` reads them. POSIX-specific behavior was not claimed beyond what the tests cover (the file-symlink escape test runs only where symlink creation is permitted).
- User work preservation: pre-existing staged content (SHA256 of the staged patch verified before commit) and the 55 pre-existing unstaged file blocks were not touched or committed.
