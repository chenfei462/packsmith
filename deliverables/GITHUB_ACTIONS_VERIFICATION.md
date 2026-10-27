# GitHub Actions verification

Date: 2026-10-27 (America/Los_Angeles)

Final reviewed SHA: `75269dbe5b0d735619c32c2a74d2657ce30df716`

- Branch: `feat/v0.2-reliability-gate`
- Remote SHA: matched final local SHA.
- CI run `40553632750`: `success`.
- site-ci run `40553632458`: `success`.
- link-check run `40553632409`: `success`.

CI checked the exact release SHA, installed dependencies, ran the offline suite, legacy smoke, doctor JSON gate, registry quality gate, package dry run, audit, generated-file verification, and the site check. The behavioral runtime scope was explicitly reported as skipped because the hosted workflow has no paid model credentials.

No hosted PASS is inferred from a badge alone; job conclusions and step conclusions were inspected. The final hosted runs passed.
