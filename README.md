# Packsmith

Build once, ship everywhere for agent skills.

`packsmith` is a zero-dependency CLI for turning a reusable skill pack into target-specific bundles for coding agents like Claude Code and Codex. It exists because the agent-skills ecosystem is exploding, but the authoring, validation, packaging, and install surfaces are still fragmented.

## Why this repo now

As of May 13, 2026:

- GitHub's trending page describes itself as what the community is "most excited about today", and agent tooling dominates the page.
- GitHub's `agent-skills` topic lists 4,526 public repositories.
- `anthropics/skills` shows 133k stars and an active issue queue around discoverability, duplicate loads, and install-path mismatches.

That combination is the signal: the category is proven, but the workflows are still rough.

## Positioning

Packsmith is not another giant skill library.

It is the packaging layer between:

- teams writing reusable skills/prompts/workflows
- agent runtimes that all expect slightly different layouts
- developers who need validation, portability, and context-budget discipline

## MVP

The first version ships five commands:

- `init`: scaffold a new pack
- `validate`: verify a pack manifest, skills, and prompts
- `inspect`: summarize targets, assets, and estimated context weight
- `build`: compile one source pack into target bundles
- `install`: copy a built target bundle into a local destination

Current targets:

- `claude-code`
- `codex`

## Quick start

```bash
node src/cli.mjs init my-pack
node src/cli.mjs inspect examples/research-launchpad
node src/cli.mjs validate examples/research-launchpad
node src/cli.mjs build examples/research-launchpad
node src/cli.mjs install examples/research-launchpad/dist/research-launchpad --target codex --dest .local-packs
```

Built output lands in `dist/<pack-name>/`.

## First-run flow

```bash
node src/cli.mjs init my-pack
node src/cli.mjs validate my-pack
node src/cli.mjs build my-pack
node src/cli.mjs install my-pack/dist/my-pack --target claude-code --dest .demo-install
```

That gives the repo a real story:

1. create a pack
2. validate it
3. build it for target runtimes
4. install the built bundle locally

## Pack format

Each pack is just a directory with a `packsmith.json` manifest:

```json
{
  "name": "research-launchpad",
  "description": "GitHub demand research pack for coding agents.",
  "version": "0.1.0",
  "targets": ["claude-code", "codex"],
  "skills": [
    {
      "id": "github-demand",
      "path": "skills/github-demand",
      "description": "Research GitHub demand signals and convert them into a launch thesis."
    }
  ],
  "prompts": [
    {
      "id": "launch",
      "path": "prompts/launch.md",
      "description": "Turn raw GitHub signals into a concrete MVP."
    }
  ]
}
```

## Repository layout

```text
.github/
  workflows/ci.yml
docs/
  github-demand-2026-05.md
  launch-plan.md
  positioning.md
  specification.md
examples/
  research-launchpad/
src/
  cli.mjs
  lib/
tests/
```

## Engineering posture

- zero runtime dependencies
- Node 20+
- CI runs `npm test` on pushes and pull requests
- example-first development with a bundled research pack

## What makes this star-worthy

- It sits on a real distribution bottleneck instead of shipping one more prompt bundle.
- It is agent-agnostic by design.
- It pushes a simple product story: author once, validate once, build for every agent.
- It gives the ecosystem something missing today: a portable pack compiler with context-aware inspection.
- It now has a complete local loop instead of stopping at compilation.

## Next steps

- add install adapters for local user directories
- add lockfiles and remote pack sources
- add target-specific lint rules
- add pack registry metadata and signed releases

## Maintainer docs

- [Positioning](./docs/positioning.md)
- [Launch plan](./docs/launch-plan.md)
- [GitHub demand research](./docs/github-demand-2026-05.md)

## License

MIT

## Sources

- https://github.com/trending
- https://github.com/topics/agent-skills
- https://github.com/anthropics/skills
- https://github.com/anthropics/skills/issues/675
- https://github.com/anthropics/skills/issues/919
- https://github.com/anthropics/skills/issues/1101
- https://github.com/anthropics/skills/issues/278
