---
name: prompt-debugging
description: Diagnoses vague prompts, conflicting instructions, missing context, and weak output contracts.
---

# Prompt Debugger

Use this skill when an agent prompt produces inconsistent, verbose, unsafe, or unhelpful results.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Diagnoses vague prompts, conflicting instructions, missing context, and weak output contracts.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Identify the intended task, target user, required inputs, and expected output.
2. Find contradictions, vague verbs, hidden assumptions, missing constraints, and unbounded scope.
3. Separate model behavior issues from prompt design issues.
4. Rewrite the prompt around trigger conditions, workflow, output format, and verification.
5. Provide a small test case to compare old and new behavior.

## Output Format

Return:

- diagnosis
- conflicts
- rewritten prompt
- output contract
- test case

## Usage Example

```text
packsmith install prompt-debugger
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
