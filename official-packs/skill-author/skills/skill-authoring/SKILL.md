---
name: skill-authoring
description: Helps users turn repeated agent workflows into clear triggers, examples, and output formats.
---

# Skill Author

Use this skill when creating a new Packsmith or agent skill from a repeated workflow.

## Trigger Conditions

- The user names this workflow directly.
- The task matches the pack description: Helps users turn repeated agent workflows into clear triggers, examples, and output formats.
- The work would benefit from a repeatable agent process with clear evidence and output.

## Workflow

1. Clarify the skill's job, trigger conditions, inputs, and non-goals.
2. Write frontmatter, description, workflow steps, output format, and examples.
3. Add verification or quality checks so the skill avoids vague behavior.
4. Keep the skill focused enough to be reusable across repositories.
5. Produce files that fit the target pack structure.

## Output Format

Return:

- skill name
- trigger conditions
- SKILL.md content
- usage example
- quality checklist

## Usage Example

```text
packsmith install skill-author
```

## Quality Bar

- Ground recommendations in files, commands, docs, or clearly labeled assumptions.
- Keep the response focused on the user request and avoid unrelated platform work.
- State what was not verified when evidence is incomplete.
