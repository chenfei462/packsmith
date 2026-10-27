# Fresh real-runtime evidence

Recorded 2026-10-26. The bounded harness used one run per case, five cases, and two selected live runtimes. Authentication was supplied through private local Codex auth JSON and Claude settings files; no credential values were printed or copied into this report.

Fixture: `github-demand`, with two positive cases, two negative cases, and one near miss. Raw artifacts are retained at:

`C:\Users\hacjr\AppData\Local\Temp\packsmith-real-evidence-e08c86d301074252bf8d622a77d4e805\runs\`

Each completed run directory contains `stdout.log`, `stderr.log`, `events.jsonl`, `result.json`, `runtime.json`, and the isolated workspace. The interrupted final Claude launch retained only partial stream files and is recorded as incomplete.

| Runtime | Version | Cases completed | Observed states | Evidence |
|---|---|---:|---|---|
| Codex | `codex-cli 0.148.0` | 5/5 | 1 triggered, 2 not_triggered, 1 ambiguous, 1 timeout | `runs/20261026-26f396`, `29f3a2`, `6b9034`, `942cde`, `c29482` |
| Claude Code | `2.1.289` | 2/5 before bounded harness termination | 2 timeout; third launch incomplete | `runs/20261026-406825`, `efb3a7`, `fabf9d` |

Codex's binary subset contains one true positive and two true negatives. The two unresolved observations remain unresolved; they are not converted to false negatives. On the measured binary subset, recall is 50%, precision is 100%, and false-positive rate is 0%; the overall sample is incomplete because of the ambiguous and timeout states. Durations and runtime versions are stored in each `result.json`/`runtime.json`.

This is fresh end-to-end evidence that the supported runner launches a real runtime, retains structured/raw artifacts, and preserves failure states. It is not a claim of universal Skill quality or a cross-runtime PASS score.
