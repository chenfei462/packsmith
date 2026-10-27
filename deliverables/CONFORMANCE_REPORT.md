# Conformance report

The Agent Skills conformance checks cover SKILL.md presence, frontmatter location and YAML parsing, name presence/format/length, directory-name identity, description presence/length, referenced-file resolution, and supporting-file inventory. The check suite also covers activation-description heuristics, context budgets, runtime-specific frontmatter, and security patterns.

Evidence: `tests/checks/spec.test.mjs`, `tests/checks/spec-links.test.mjs`, `tests/checks/activation.test.mjs`, `tests/checks/context.test.mjs`, `tests/checks/compatibility.test.mjs`, and `tests/checks/security.test.mjs` all ran in the 550-test offline suite with zero failures.

The conformance result is deterministic static validation. It does not claim that a valid Skill will activate in a model session.
