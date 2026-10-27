# GitHub Actions verification

Status: `BLOCKED_EXTERNAL_DEPENDENCY` for remote execution.

- Workflow reviewed: `.github/workflows/ci.yml` (static push/PR workflow) and `.github/workflows/regression-gate.yml` (manual-only behavioral example).
- Remote: `https://github.com/chenfei462/packsmith.git`.
- Run ID/URL: none; no GitHub CLI is installed (`gh: unavailable`) and this environment has no connected GitHub Actions control or authorization.
- Therefore no runner OS, hosted Node result, install result, or GitHub workflow exit status is claimed.

Local equivalents passed: `npm test`, `npm run smoke:v01`, `npm run smoke:doctor:packaged`, and `node src/cli.mjs doctor examples/research-launchpad`. The manual regression workflow remains intentionally opt-in and refuses to run without a committed suite/baseline and explicit credentials.
