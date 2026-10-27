# Knowledge integrity evidence

Date: 2026-10-26 (America/Los_Angeles)

The expanded evidence graph was loaded with `src/knowledge/evidence.mjs` and validated before staging.

| Family | Count |
|---|---:|
| Sources | 28 |
| Claims | 17 |
| Executable rules | 20 |
| Runtime records | 6 |
| Research findings | 5 |
| Implementation profiles | 11 |
| Incidents | 10 |
| Product evidence entries | 9 |

Measured invariants:

- Source, claim, rule, runtime, research, implementation profile, incident, and product IDs are unique.
- 20/20 rules resolve `evidenceIds` to claims and each claim resolves to a cited source.
- 6/6 runtime records resolve `evidenceIds` to claims with canonical or official source authority.
- All declared claim consumers resolve to an existing rule, runtime, research object, or product object.
- Normative claims and rule evidence use canonical or official authority; product security policy is explicitly `UNKNOWN`/non-normative.
- Research records are explicitly non-normative.
- Dates are valid ISO calendar dates.
- Integrity failures: **0**.

Fresh focused verification:

```text
node --test tests/knowledge/evidence.test.mjs tests/knowledge/runtime-facts.test.mjs tests/knowledge/loader.test.mjs
19 tests, 19 pass, 0 fail, 0 skipped
```
