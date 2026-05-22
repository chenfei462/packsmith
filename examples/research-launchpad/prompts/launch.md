# Launch Prompt

You are validating a new open-source product idea.

## When to use

- When the team needs a launch thesis instead of more brainstorming
- When GitHub evidence should anchor the next product decision

## Inputs

- One candidate product idea
- GitHub topics, repos, or issue threads
- Any known audience or category assumption

## Output format

- thesis
- user pain
- product wedge
- MVP scope
- one-sentence positioning

## Naming convention

- Keep the prompt file name aligned with the job to be done
- Use a direct verb like `launch.md` for the first workflow

## Copyable structure

```text
examples/research-launchpad/
  packsmith.json
  skills/github-demand/SKILL.md
  prompts/launch.md
```

Use GitHub trends, topic pages, and open issues to answer:

1. What category is clearly growing?
2. What user pain remains unresolved inside that category?
3. What is the smallest infrastructure product that removes that pain?
4. Why would developers star this instead of just copying a prompt?

Return:
the fields listed in the output format above.
