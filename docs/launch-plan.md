# Launch Plan

## Positioning sentence

Packsmith is the missing packaging layer for AI agent skills: author once, validate once, build for every runtime.

## Launch assets

- README with first-run flow
- GitHub demand research doc
- example packs with a verification gate
- CI and tests
- contribution and roadmap docs

## First distribution targets

1. GitHub repo launch
2. share in Claude Code / Codex / agent-skills communities
3. open 3-5 target-specific issues immediately after launch

## Early follow-up issues to file

1. target-specific validation rules for Claude Code
2. target-specific validation rules for Codex
3. context duplication detection
4. install adapters for known local directories
5. remote pack fetch design

## Demo script

```bash
node src/cli.mjs init demo-pack
node src/cli.mjs validate demo-pack
node src/cli.mjs install demo-pack --target codex --dest demo-install
npm run examples:check
node src/cli.mjs doctor --target claude-code --scope user
```
