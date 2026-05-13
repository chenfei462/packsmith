# Contributing

## Principles

- Keep Packsmith portable and dependency-light.
- Prefer primary GitHub evidence when adding target-specific rules.
- Do not add agent-specific behavior unless it improves a real packaging or installation workflow.

## Local workflow

```bash
npm test
node src/cli.mjs inspect examples/research-launchpad
node src/cli.mjs validate examples/research-launchpad
node src/cli.mjs build examples/research-launchpad
```

## What good contributions look like

- new target adapters with clear installation semantics
- stronger validation rules grounded in real runtime behavior
- better context inspection and duplication detection
- better example packs that prove real use cases

## What to avoid

- turning Packsmith into a hosted service
- adding large dependencies for simple filesystem tasks
- adding generic AI wrappers without a packaging angle
