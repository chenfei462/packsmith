# Dependency Risk Auditor

Use the Dependency Risk Auditor pack to help with this request.

## Context To Collect

- User goal and current constraint.
- Relevant files, commands, logs, diffs, or docs.
- What has already been tried or decided.

## Task

Handle the request when adding or replacing a package, library, action, image, or external tool.

Follow this sequence:

1. Explain why the dependency is needed and what local alternative exists.
2. Check license, maintenance activity, transitive size, and runtime impact.
3. Identify security or supply-chain concerns from install scripts and permissions.
4. Recommend keep, replace, isolate, or remove with evidence.

## Output Format

Return:

- risk summary
- license notes
- maintenance signal
- recommendation
