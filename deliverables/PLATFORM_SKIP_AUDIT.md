# Platform skip audit

Date: 2026-10-26 (America/Los_Angeles)

The fresh `npm test` run reported 5 platform skips. All are expected Windows capability limitations and have deterministic alternatives.

| Test | Platform | Reason | Expected? | Coverage alternative | Release impact |
|---|---|---|---|---|---|
| `v2 refuses a SKILL.md symlink that escapes the pack` | Windows | Symlink creation unavailable (`EPERM`) | Yes | Junction escape test plus path-containment fixtures | No loss of release gate coverage; symlink primitive is unavailable in this runner |
| `saveBaseline rejects symlink at target` | Windows | Symlink creation unavailable | Yes | Atomic replacement, junction, and race tests | No loss of baseline safety coverage |
| `a symlinked skill source is refused before anything is installed` | Windows | Symlink creation unavailable | Yes | Git-boundary and junction isolation tests | No loss of installation isolation coverage |
| `dangling triggers.json symlink is refused, not followed` | Windows | Symbolic-link privilege unavailable (`EPERM`) | Yes | Junction and publish-window race tests | No loss of trigger-init containment coverage |
| `real local PowerShell control matches native evidence` | Windows | Local PowerShell unavailable (`EPERM`) | Yes | Parser controls and Windows shim tests exercise equivalent evidence semantics | No false PASS; native control is explicitly skipped |

No skip is unexplained, and no skip changes the Packsmith v0.2 verdict.
