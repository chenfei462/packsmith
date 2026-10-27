# Packsmith v0.2 Final Closure Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean Packsmith v0.2 closure commit whose evidence, deterministic tests, hosted CI, and independent review support a truthful PASS verdict.

**Architecture:** Preserve the existing implementation and separate unrelated dirty work from v0.2 closure files. Strengthen the knowledge graph validator/tests, generate measured evidence reports, then stage only classified B/C/D/E paths and verify the exact release SHA through remote and hosted CI evidence.

**Tech Stack:** Node.js ESM, Node built-in test runner, JSON knowledge records, Git, GitHub Actions.

---

### Task 1: Classify the dirty worktree and write the manifest

**Files:**
- Create: `deliverables/RELEASE_FILE_MANIFEST.md`

- [ ] Capture `git status --porcelain=v1` and compare each path to `0fff9841fdd29d386bed0d2a31eaf9778371f8d9`.
- [ ] Classify every path as A-F with `path`, `classification`, `include/exclude`, and `reason`.
- [ ] Keep only B/C/D/E eligible for the release staging list; leave A/F unstaged.

### Task 2: Enforce evidence graph integrity

**Files:**
- Modify: `src/knowledge/evidence.mjs`
- Modify: `tests/knowledge/evidence.test.mjs`
- Modify: `knowledge-base/**/*.json` only when a real reference is missing or invalid

- [ ] Validate unique source, claim, rule, incident, implementation profile, and product IDs.
- [ ] Resolve every `claim.sourceId`, `rule.evidenceIds`, `runtime.evidenceIds`, and declared consumer reference.
- [ ] Enforce normative rules to canonical/official sources and runtime facts to official evidence or explicit `UNKNOWN`/`NOT_VERIFIED`.
- [ ] Validate dates and report measured counts plus zero failures.
- [ ] Run `node --test tests/knowledge/evidence.test.mjs tests/knowledge/runtime-facts.test.mjs tests/knowledge/loader.test.mjs`.

### Task 3: Run deterministic, legacy, and CLI acceptance

**Files:**
- Create/update: `deliverables/PLATFORM_SKIP_AUDIT.md`
- Create/update: `deliverables/CLI_SMOKE_EVIDENCE.md`

- [ ] Run `npm test` and record exact totals.
- [ ] Run `npm run smoke:v01` and record 5/5.
- [ ] Run doctor, trigger, runtime, isolation, matrix, baseline, regression, and CI smoke commands; record exact outcomes.
- [ ] Explain all five Windows/platform skips with a coverage alternative and release impact.

### Task 4: Create the clean closure commit

**Files:**
- Stage only manifest, KB implementation/tests/data, closure evidence, and required v0.2 runtime artifacts

- [ ] Run `git diff --cached --name-status` and `git diff --cached --stat` after explicitly staging paths.
- [ ] Verify no A/F paths are staged.
- [ ] Commit with `git commit -m "chore: close Packsmith v0.2 acceptance"` and record the new SHA.

### Task 5: Re-run final-commit evidence and remote checks

**Files:**
- Update: `deliverables/REMOTE_RELEASE_EVIDENCE.md`
- Update: `deliverables/REAL_RUNTIME_EVIDENCE.md`

- [ ] Run deterministic and smoke gates from the committed tree.
- [ ] Reconfirm bounded runtime evidence while preserving triggered, not_triggered, ambiguous, timeout, and infra_error distinctions.
- [ ] Push `feat/v0.2-reliability-gate`, resolve the remote branch SHA, and record push evidence.

### Task 6: Hosted and independent acceptance

**Files:**
- Update: `deliverables/GITHUB_ACTIONS_VERIFICATION.md`
- Create/update: `deliverables/INDEPENDENT_FINAL_REVIEW.md`
- Update: `deliverables/FINAL_ACCEPTANCE.md`

- [ ] Trigger the normal GitHub workflow for the exact release SHA and record run/job IDs, runner, Node, steps, artifacts, and conclusion.
- [ ] Have an independent reviewer consume the final commit, tests, KB, runtime evidence, and hosted CI; run the required false-PASS probes.
- [ ] Fix findings, rerun affected gates, and update the report to `PACKSMITH_V0_2_PASS` only if every gate is evidenced; otherwise use the permitted blocking/partial verdict.

### Task 7: Final verification

- [ ] Run `git status`, `git diff`, and `git diff HEAD`.
- [ ] Verify final acceptance SHA equals the tested remote SHA and no unrelated files are included.
