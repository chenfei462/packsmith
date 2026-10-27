# Remote release evidence

Date: 2026-10-27 (America/Los_Angeles)

- Local branch: `feat/v0.2-reliability-gate`
- Local SHA: `4d95fb812cc7be131bfe64eaa32a85d76425db87`
- Remote branch: `origin/feat/v0.2-reliability-gate`
- Remote SHA: `4d95fb812cc7be131bfe64eaa32a85d76425db87`
- Push command: `git -c http.version=HTTP/1.1 push -u origin feat/v0.2-reliability-gate`
- Push result: **success**, new branch created and upstream configured
- Push completed between 2026-10-27T09:40:06-07:00 and 2026-10-27T09:41:56-07:00; verification timestamp: `2026-10-27T09:41:56.0132223-07:00`
- Remote URL: `https://github.com/chenfei462/packsmith.git`
- Authenticated identity: `chenfei462`, verified through GitHub `/user` using the existing Git Credential Manager credential; GitHub repository permissions include admin/maintain/push.
- Credential correction: repository-local GitHub helper reset followed by `manager`, with username `chenfei462`. Global credentials and other stored accounts were preserved. No credentials were printed or saved in repository files or URLs.
- Transport: first authenticated attempt failed with `curl 52 Empty reply from server`; HTTP/1.1 retry succeeded. This was separate from the historical wrong-account HTTP 403.
- SHA gate: `git ls-remote origin refs/heads/feat/v0.2-reliability-gate` exactly matched local HEAD before hosted acceptance.

The legitimate newer commit `4d95fb8` changes only acceptance report wording after `ac3cf07`. Product code, tests, scripts, knowledge-base files, package manifests, and the static workflow are unchanged from closure commit `741b51a`. No unrelated user work was staged or pushed. The reports updated during this publication session remain local evidence about the certified commit and do not advance that commit.

## CI repair publication

- User explicitly approved including the test-required dependencies previously classified as excluded pre-existing work, preserving all other user work.
- New local and remote SHA: `ae66af25f6a78fa182a2509bc025899aeb5d1ce2`.
- Commit: `fix: make v0.2 release checkout complete and portable`.
- Push: successful fast-forward of only `feat/v0.2-reliability-gate`.
- Push completion / exact SHA verification timestamp: `2026-10-27T09:57:37.8601592-07:00` (America/Los_Angeles).
- Included: 252 enumerated missing dependency files, scoped runtime/platform fixes, exact-SHA CI checkout configuration, and a minimal README release-verification note.
- The user's full README rewrite was preserved in the working tree using index-only staging of the minimal release note. Other unrelated changes remain unstaged.
- Hosted static CI run for this head: `40545983644`; results pending inspection.
- Local post-CI repair verification: `npm test` = 555 total, 550 pass, 0 fail, 5 documented skips; knowledge tests = 19/19; runtime parser/spawn tests = 36/36 plus 1 documented skip; runtime smokes = all pass.
- The previous hosted run `40545983644` tested `ae66af2` before the final parser and Windows temporary-path fixes. Its failures are retained as diagnostics; they are not treated as a PASS.
- Hosted run `40548354918` for `fc37af9` was still in progress when the site/link jobs completed. The site job failed because its workflow omitted root `npm ci`, leaving `yaml` unavailable to the root CLI invoked by the site data generator. The link-check job failed because the selected lychee binary rejects `--exclude-mail`, and its zero-match shell fallback wrote an invalid two-line output value. Both workflow defects are corrected in the next commit; no product behavior is changed.
- Hosted run `40551023991` passed all Ubuntu matrix jobs and Windows Node 22/24, but Windows Node 20 exposed a real cross-platform classification defect: junction replacement can make `fs.realpath` return `ENOTEMPTY`. The repair maps `ENOTEMPTY`/`ELOOP` to the existing fail-closed redirected-directory refusal. Focused local verification: `tests/pack-manifest-v2.test.mjs` = 13 pass, 0 fail, 1 documented skip.
