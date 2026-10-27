# CLI smoke evidence

Date: 2026-10-26 (America/Los_Angeles)

All smoke commands were run from the Packsmith worktree with no model calls or external credentials.

| Coverage | Command | Result |
|---|---|---|
| Legacy init → validate → inspect → build → install | `npm run smoke:v01` | 5/5 steps passed |
| Doctor valid/invalid/JSON/target | `node scripts/smoke-doctor.mjs` | PASS |
| Packaged doctor and KB packaging | `npm run smoke:doctor:packaged` | PASS; 25 KB files shipped |
| Trigger suite creation, refusal, invalid target, JSON usage | `npm run smoke:trigger:init` | PASS |
| Trigger mock/fixture, ambiguous and static unsupported paths | `npm run smoke:trigger:run` | PASS |
| Runtime unavailable, timeout, partial evidence | `npm run smoke:runtimes` | PASS |
| Workspace isolation and secret handling | `npm run smoke:isolation` | PASS |
| Matrix and unknown capability/invalid-results paths | `npm run smoke:matrix` | PASS |
| Baseline create, unchanged, regressed, drift, infra-error | `npm run smoke:baseline` | 8/8 controls passed |
| CI pass, regression, imported evidence, preflight and usage errors | `npm run smoke:ci` | 11/11 controls passed |

The deterministic suite and all smokes report zero model calls. Timeout, ambiguous, `infra_error`, and `unsupported` remain distinct from `not_triggered`.
