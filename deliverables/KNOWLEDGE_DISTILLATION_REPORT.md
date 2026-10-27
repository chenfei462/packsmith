# Knowledge distillation report

Measured from the loaded JSON knowledge base on 2026-10-26:

| Measure | Count |
|---|---:|
| Sources | 28 |
| Accepted sources | 28 |
| Rejected sources | 0 recorded |
| Canonical sources | 1 |
| Official runtime sources | 5 |
| Academic sources | 3 |
| Implementation references | 11 profiles |
| Atomic claims | 16 |
| Normative claims represented through rule evidence | 20 rules |
| Runtime capability claims | 5 extended claims plus 6 runtime records |
| Research findings | 5 |
| Incident entries | 10 |
| Product evidence entries | 9 |
| Rules linked to evidence | 20 |
| Rules missing evidence | 0 |
| Tests derived from evidence | 20 rule families plus runtime and trigger suites |
| Runtime coverage | Agent Skills, Claude Code, Codex, Cursor, Gemini CLI, OpenCode |
| Conflicts | 0 unresolved in the loaded KB |
| Stale claims | 0 marked stale |
| Unknown claims | Runtime live behavior for static-only targets remains unknown by design |

The expanded graph is loaded by `src/knowledge/evidence.mjs` and tested offline. It verifies unique IDs, source/claim references, authority and source types, non-normative research, dates, and family counts. The implemented chain is `source → claim → rule/runtime/research/incident/product evidence → test or consumer`.
