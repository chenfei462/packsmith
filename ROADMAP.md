# Roadmap

## Current baseline

- stable `init`, `validate`, `inspect`, `build`, `install`, `list`, `doctor`, and `uninstall` flows
- `SKILL.md` frontmatter validation and naming rules
- Claude Code user/project install adapters
- context footprint reporting, duplicate-content diagnostics, and `--strict` validation
- release-readiness gate for publish metadata, bilingual README structure, and trusted publishing workflow
- temp-space smoke flow that exercises scaffold, validate, build, install, list, doctor, and uninstall
- install integrity checks for missing tracked skills/prompts and unmanaged Claude Code skill directories

## Phase 2

- add lockfiles for reproducible pack builds
- add local registry metadata and pack catalogs
- add target-specific lint rules beyond frontmatter
- add remote pack fetch and integrity checks for downloaded packs
- add richer visual demo assets for repo conversion

## Phase 3

- add signed bundles
- add policy rules for internal team packs
- add pack discovery metadata for future registries
