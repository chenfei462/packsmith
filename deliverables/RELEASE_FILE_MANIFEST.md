# Packsmith v0.2 release file manifest

Generated from `git status --porcelain=v1` against acceptance baseline `0fff9841fdd29d386bed0d2a31eaf9778371f8d9` on 2026-10-26. The untracked `deliverables/` directory is expanded to one row per file so each artifact is classified independently.

Only rows classified B/C/D/E are eligible for the dedicated closure commit. Rows classified A/F must remain unstaged. Status is the worktree status observed during classification.

## Classification counts

| Class | Meaning | Paths |
|---|---|---:|
| A | pre-existing user work | 326 |
| B | Packsmith v0.2 implementation | 3 |
| C | Packsmith v0.2 tests | 3 |
| D | knowledge-base material | 24 |
| E | closure / acceptance evidence | 18 |
| F | unrelated / unknown | 7 |

## Path-by-path classification

| Status | Path | Classification | Include in closure commit | Reason |
|---|---|---|---|---|
| ?? | `.github/CODEOWNERS` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/dependabot.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/ISSUE_TEMPLATE/adapter_request.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `.github/ISSUE_TEMPLATE/feature_request.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/ISSUE_TEMPLATE/pack_request.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/ISSUE_TEMPLATE/security_report.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/ISSUE_TEMPLATE/translation_request.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/labeler.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `.github/pull_request_template.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.github/release-drafter.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/ai-examples-generator.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/ai-pack-generator.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/ai-translate.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/benchmark.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `.github/workflows/ci.yml` | B | include | The v0.2 hosted static reliability workflow and deterministic gate. |
| A  | `.github/workflows/community-automation.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/compliance.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/content-coverage-report.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/content-intelligence.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/demo-generator.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/ecosystem-health.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/i18n-sync.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/i18n-validate.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/link-check.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/pack-freshness.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/pr-metrics.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/release-drafter.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/release.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/security.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/stale.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `.github/workflows/starter-kits.yml` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `.gitignore` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `.workbuddy/` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| ?? | `.zcode/` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| ?? | `.zcodeignore` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| ?? | `1` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| ?? | `智能体特工学院_AI课程资料/` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| AM | `CHANGELOG.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `CODE_OF_CONDUCT.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `CONTRIBUTING.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\CLI_SMOKE_EVIDENCE.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\CONFORMANCE_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\engineering-assurance\code-review-packsmith-2026-09-25.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\incident-refresh-install-hang-2026-09-25.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\architecture-review.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\code-review.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\docs-observability-review.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\incident-response.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\postmortem-doc-review.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\engineering-assurance\raw\testing-review.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\EXTERNAL_EVIDENCE_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\FINAL_ACCEPTANCE.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\GITHUB_ACTIONS_VERIFICATION.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\gstack\product-docs-packsmith-2026-09-26.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\INDEPENDENT_FINAL_REVIEW.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\INDEPENDENT_REVIEW.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\KB_INTEGRITY_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\KNOWLEDGE_DISTILLATION_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\M0_BASELINE.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\PASS_CLOSURE_BASELINE.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\PLATFORM_SKIP_AUDIT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\PRD-经营通SMB一体化经营管理工作台.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-docs\_raw\design-input.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-docs\_raw\security-input.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-docs\01-feature-spec-packsmith-2026-09-26.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-docs\02-competitive-analysis-packsmith-2026-09-26.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-docs\03-roadmap-packsmith-2026-09-26.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\competitive-analysis.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\metrics-baseline.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\prd-part1.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\prd-part2.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\roadmap-part1.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\roadmap-part2.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\smb-product-planning-2026-09-26.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\product-strategy\user-research.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\REAL_RUNTIME_EVIDENCE.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\RELEASE_FILE_MANIFEST.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\RUNTIME_COMPATIBILITY_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\SOURCE_INVENTORY.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\TEST_REPORT.md` | E | include | Required or directly supporting v0.2 closure evidence. |
| ?? | `deliverables\WAVE1_IMPLEMENTATION_REPORT.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\WAVE2_IMPLEMENTATION_REPORT.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `deliverables\WAVE3_IMPLEMENTATION_REPORT.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `docs/adapter-contribution-guide.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/adapters/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/assets/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/content-coverage.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `docs/deliverable-product-plan.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/demo-script-3min.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/demo-script-5min.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/demo-transcript.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/design-partner-evidence.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/design-partner-program.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/ecosystem-report.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/gh-skill-parity.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/hackathon-demo.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/hackathon-submission.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/investor-metrics.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `docs/launch-plan.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `docs/mass-market-optimization.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/open-core-boundary.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-codex-acceptance.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-m12-execution-plan.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-wave2-codex-acceptance.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-wave2-runtime-verification.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-wave3-codex-acceptance.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/plans/packsmith-v0.2-wave3-execution-plan.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `docs/positioning.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/productization-competitive-blueprint-2026-05.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `docs/registry-and-adapters.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `docs/registry-submission-guide.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `docs/release-checklist.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/release-evidence.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/signing-design.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/site/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `docs/specification.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/starter-kits/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/superpowers/plans/2026-07-06-hackathon-investor-optimization.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `docs/superpowers/plans/2026-10-26-packsmith-v0.2-final-closure.md` | E | include | Closure execution plan retained as acceptance evidence. |
| ?? | `docs/trae-integration.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `docs/trust-and-audit.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `i18n/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| A  | `knowledge-base/claims/product.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/claims/research.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/claims/runtime.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/claims/spec.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/evidence/manifest.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/implementations/profiles.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/incidents/incidents.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/product/competitive-boundaries.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/product/positioning.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/product/roadmap-evidence.json` | D | include | Versioned v0.2 evidence graph material. |
| A  | `knowledge-base/research/findings.json` | D | include | Versioned v0.2 evidence graph material. |
|  M | `knowledge-base/rules/activation.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/rules/compatibility.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/rules/context.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/rules/security.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/rules/spec.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/agent-skills.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/claude-code.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/codex.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/cursor.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/gemini-cli.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/runtimes/opencode.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
| ?? | `knowledge-base/sources/extended.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
|  M | `knowledge-base/sources/sources.json` | D | include | Versioned v0.2 evidence graph material (sources, claims, rules, runtimes, and records). |
| ?? | `nul` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
| ?? | `official-packs/accessibility-auditor/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/agent-memory-curator/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/agent-memory-curator/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/agent-memory-curator/prompts/curate-agent-memory.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/agent-memory-curator/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/agent-memory-curator/skills/agent-memory-curation/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/api-contract-reviewer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/api-docs-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-docs-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-docs-writer/prompts/write-api-docs.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/api-docs-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-docs-writer/skills/api-docs-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/api-surface-mapper/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-surface-mapper/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-surface-mapper/prompts/map-api-surface.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/api-surface-mapper/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/api-surface-mapper/skills/api-surface-map/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/architecture-decision-recorder/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/bug-hunter/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/bug-hunter/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/bug-hunter/prompts/hunt-bug.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/bug-hunter/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/bug-hunter/skills/bug-hunting/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/bug-reproducer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/changelog-curator/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/changelog-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/changelog-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/changelog-writer/prompts/write-changelog.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/changelog-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/changelog-writer/skills/changelog-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/ci-failure-triage/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/codebase-modernizer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/competitor-breakdown/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/competitor-breakdown/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/competitor-breakdown/prompts/break-down-competitors.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/competitor-breakdown/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/competitor-breakdown/skills/competitor-breakdown/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/context-budgeter/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/context-budgeter/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/context-budgeter/prompts/budget-context.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/context-budgeter/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/context-budgeter/skills/context-budgeting/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/contributing-guide-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/contributing-guide-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/contributing-guide-writer/prompts/write-contributing-guide.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/contributing-guide-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/contributing-guide-writer/skills/contributing-guide-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/data-pipeline-checker/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/database-index-advisor/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/database-schema-reader/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/database-schema-reader/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/database-schema-reader/prompts/read-database-schema.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/database-schema-reader/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/database-schema-reader/skills/database-schema-reading/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/dependency-auditor/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/dependency-auditor/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/dependency-auditor/prompts/audit-dependencies.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/dependency-auditor/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/dependency-auditor/skills/dependency-audit/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/dependency-risk-auditor/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/dependency-upgrader/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/docs-maintainer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/docs-maintainer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/docs-maintainer/prompts/sync-docs.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/docs-maintainer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/docs-maintainer/skills/docs-alignment/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/frontend-state-debugger/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/github-trending-analyst/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/github-trending-analyst/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/github-trending-analyst/prompts/analyze-github-trends.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/github-trending-analyst/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/github-trending-analyst/skills/github-trending-analysis/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/incident-postmortem/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/issue-triage/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/issue-triage/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/issue-triage/prompts/triage-issues.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/issue-triage/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/issue-triage/skills/issue-triage/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/launch-researcher/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/launch-researcher/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/launch-researcher/prompts/build-launch-thesis.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/launch-researcher/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/launch-researcher/skills/launch-research/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/legacy-code-translator/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/legacy-code-translator/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/legacy-code-translator/prompts/translate-legacy-code.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/legacy-code-translator/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/legacy-code-translator/skills/legacy-code-translation/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/migration-planner/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/multi-agent-router/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/multi-agent-router/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/multi-agent-router/prompts/route-agent-task.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/multi-agent-router/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/multi-agent-router/skills/multi-agent-routing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/onboarding-guide-writer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/onboarding-guide/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/onboarding-guide/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/onboarding-guide/prompts/write-onboarding-guide.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/onboarding-guide/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/onboarding-guide/skills/onboarding-guide/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/performance-profiler/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/performance-profiler/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/performance-profiler/prompts/profile-performance.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/performance-profiler/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/performance-profiler/skills/performance-profiling/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/pr-description-writer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/product-requirements-shaper/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/prompt-debugger/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/prompt-debugger/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/prompt-debugger/prompts/debug-prompt.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/prompt-debugger/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/prompt-debugger/skills/prompt-debugging/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/prompt-quality-auditor/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/readme-converter/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/readme-converter/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/readme-converter/prompts/convert-readme.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/readme-converter/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/readme-converter/skills/readme-conversion/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/refactor-guide/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/refactor-planner/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/refactor-planner/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/refactor-planner/prompts/plan-refactor.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/refactor-planner/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/refactor-planner/skills/refactor-planning/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/release-checklist/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/release-checklist/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/release-checklist/prompts/write-release-checklist.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/release-checklist/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/release-checklist/skills/release-checklist/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/release-note-writer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/repo-cartographer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/repo-cartographer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/repo-cartographer/prompts/map-repository.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/repo-cartographer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/repo-cartographer/skills/repo-map/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/risk-probe/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/roadmap-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/roadmap-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/roadmap-writer/prompts/write-roadmap.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/roadmap-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/roadmap-writer/skills/roadmap-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/security-pass/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/security-reviewer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/security-reviewer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/security-reviewer/prompts/review-security-risk.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/security-reviewer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/security-reviewer/skills/security-review/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/senior-code-reviewer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/senior-code-reviewer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/senior-code-reviewer/prompts/review-current-change.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/senior-code-reviewer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/senior-code-reviewer/skills/senior-code-review/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/skill-author/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/skill-author/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/skill-author/prompts/author-skill.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/skill-author/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/skill-author/skills/skill-authoring/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/terraform-reviewer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/test-fixture-designer/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/test-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/test-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/test-writer/prompts/write-focused-tests.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/test-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/test-writer/skills/focused-test-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/tutorial-writer/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/tutorial-writer/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/tutorial-writer/prompts/write-tutorial.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/tutorial-writer/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/tutorial-writer/skills/tutorial-writing/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/workflow-packager/examples/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/workflow-packager/packsmith.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/workflow-packager/prompts/package-workflow.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `official-packs/workflow-packager/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| AM | `official-packs/workflow-packager/skills/workflow-packaging/SKILL.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `OPTIMIZATION.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `package.json` | C | include | Registers the evidence integrity test in the deterministic suite. |
|  M | `README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `RELEASE_NOTES.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `ROADMAP.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `scripts/real-runtime-evidence.mjs` | E | include | Bounded runtime evidence harness used by v0.2 acceptance. |
| ?? | `SECURITY.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/e2e/accessibility.spec.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/e2e/canvas.spec.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/e2e/fallback.spec.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/e2e/golden/` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/e2e/helpers/canvas-pixels.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/e2e/routes.spec.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/eslint.config.js` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/nul` | F | exclude | Unrelated local tooling, scratch, or course material; not part of Packsmith v0.2. |
|  M | `site/package.json` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/playwright.config.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/README.md` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/src/animation/useSectionTimeline.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/animation/useSectionTimeline.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/app/App.test.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/app/routes.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/components/Navigation.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/ExperienceCanvas.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/ExperienceProvider.test.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/ExperienceProvider.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/performance/derivePerformanceTier.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/performance/derivePerformanceTier.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/performance/FrameGovernor.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/performance/frameGovernorState.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/src/experience/performance/softwareRenderer.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/src/experience/performance/softwareRenderer.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/src/experience/primitives/Atmosphere.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `site/src/experience/primitives/PassportCore.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/SceneDirector.test.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/SceneDirector.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/docs/DocsScene.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/home/HomeScene.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/pack-detail/PackDetailScene.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/registry/registryLayout.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/registry/registryLayout.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/experience/scenes/registry/RegistryScene.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/docs/docs.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/hero/HeroSection.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/home/home.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/pack-detail/pack-detail.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/pack-detail/packDetailModel.test.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/pack-detail/PassportFacts.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/features/registry/registry.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/pages/HomePage.test.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/pages/PackDetailPage.test.tsx` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/styles/global.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/styles/motion.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/src/styles/tokens.css` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
|  M | `site/vite.config.ts` | A | exclude | Pre-existing user work outside the Packsmith v0.2 closure scope. |
| ?? | `src/knowledge/evidence.mjs` | B | include | Knowledge graph loader/integrity implementation for v0.2. |
|  M | `src/knowledge/loader.mjs` | B | include | Knowledge graph loader/integrity implementation for v0.2. |
| ?? | `tests/knowledge/evidence.test.mjs` | C | include | Automated v0.2 knowledge graph integrity coverage. |
|  M | `tests/knowledge/loader.test.mjs` | C | include | Automated v0.2 knowledge graph integrity coverage. |



