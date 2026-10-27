#!/usr/bin/env node

/**
 * generate-starter-kits.mjs — Generates curated pack combinations (starter kits)
 * for specific roles, tech stacks, and scenarios.
 *
 * A starter kit is a recommended set of packs that work well together for a
 * particular developer persona or workflow.
 *
 * Usage:
 *   node scripts/generate-starter-kits.mjs
 *
 * Output:
 *   docs/starter-kits/index.md          — browsable index
 *   docs/starter-kits/<kit-id>.md       — per-kit detail page
 *   registry/starter-kits.json          — machine-readable kit definitions
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const kitsDir = resolve(root, 'docs/starter-kits');

mkdirSync(kitsDir, { recursive: true });

// Load catalog
const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const packs = catalog.packs;
const packById = new Map(packs.map(pack => [pack.id, pack]));

function safeSlug(value, label) {
  const slug = String(value ?? '');
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error(`Invalid ${label}: ${slug}`);
  }
  return slug;
}

// Starter kit definitions
const starterKits = [
  {
    id: 'fullstack-developer',
    name: 'Full-Stack Developer Kit',
    emoji: '🚀',
    description: 'Essential packs for full-stack web developers — code quality, testing, documentation, and deployment.',
    audience: 'Full-stack developers working on web applications',
    packs: ['senior-code-reviewer', 'test-writer', 'bug-hunter', 'docs-maintainer', 'api-docs-writer', 'performance-profiler'],
    installCommand: 'packsmith install senior-code-reviewer test-writer bug-hunter docs-maintainer api-docs-writer performance-profiler'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer Kit',
    emoji: '🛡️',
    description: 'Security-focused packs for auditing code, dependencies, and infrastructure.',
    audience: 'Security engineers, DevSecOps, and security-conscious developers',
    packs: ['security-reviewer', 'dependency-auditor', 'senior-code-reviewer'],
    installCommand: 'packsmith install security-reviewer dependency-auditor senior-code-reviewer'
  },
  {
    id: 'open-source-maintainer',
    name: 'Open Source Maintainer Kit',
    emoji: '🌍',
    description: 'Everything you need to maintain a healthy open source project — docs, changelogs, contributor guides, and issue management.',
    audience: 'Open source project maintainers and core contributors',
    packs: ['docs-maintainer', 'changelog-writer', 'contributing-guide-writer', 'release-checklist', 'issue-triage', 'readme-converter'],
    installCommand: 'packsmith install docs-maintainer changelog-writer contributing-guide-writer release-checklist issue-triage readme-converter'
  },
  {
    id: 'new-team-member',
    name: 'New Team Member Kit',
    emoji: '👋',
    description: 'Quickly understand any codebase — architecture maps, onboarding guides, and legacy code translation.',
    audience: 'Developers joining a new team or inheriting an unfamiliar codebase',
    packs: ['repo-cartographer', 'onboarding-guide', 'legacy-code-translator', 'database-schema-reader', 'api-surface-mapper'],
    installCommand: 'packsmith install repo-cartographer onboarding-guide legacy-code-translator database-schema-reader api-surface-mapper'
  },
  {
    id: 'product-launcher',
    name: 'Product Launch Kit',
    emoji: '📣',
    description: 'From market research to launch execution — positioning, competitive analysis, and go-to-market workflows.',
    audience: 'Indie hackers, startup founders, and product managers shipping new tools',
    packs: ['launch-researcher', 'competitor-breakdown', 'github-trending-analyst', 'readme-converter', 'roadmap-writer', 'issue-triage'],
    installCommand: 'packsmith install launch-researcher competitor-breakdown github-trending-analyst readme-converter roadmap-writer issue-triage'
  },
  {
    id: 'ai-agent-builder',
    name: 'AI Agent Builder Kit',
    emoji: '🤖',
    description: 'Build and optimize AI agent workflows — prompt engineering, skill authoring, context management, and multi-agent routing.',
    audience: 'Developers building AI agents, prompt engineers, and AI tool creators',
    packs: ['prompt-debugger', 'skill-author', 'context-budgeter', 'multi-agent-router', 'workflow-packager', 'agent-memory-curator'],
    installCommand: 'packsmith install prompt-debugger skill-author context-budgeter multi-agent-router workflow-packager agent-memory-curator'
  },
  {
    id: 'code-quality-purist',
    name: 'Code Quality Purist Kit',
    emoji: '✨',
    description: 'Maximum code quality — reviews, tests, refactoring plans, and performance profiling.',
    audience: 'Senior developers and tech leads who prioritize code quality',
    packs: ['senior-code-reviewer', 'test-writer', 'refactor-planner', 'performance-profiler', 'bug-hunter', 'security-reviewer'],
    installCommand: 'packsmith install senior-code-reviewer test-writer refactor-planner performance-profiler bug-hunter security-reviewer'
  },
  {
    id: 'documentation-champion',
    name: 'Documentation Champion Kit',
    emoji: '📚',
    description: 'Keep documentation excellent — API docs, tutorials, changelogs, and contributor guides.',
    audience: 'Technical writers, developer advocates, and documentation-focused engineers',
    packs: ['api-docs-writer', 'tutorial-writer', 'changelog-writer', 'contributing-guide-writer', 'docs-maintainer', 'release-checklist'],
    installCommand: 'packsmith install api-docs-writer tutorial-writer changelog-writer contributing-guide-writer docs-maintainer release-checklist'
  }
];

function resolveKitPacks(kit) {
  return kit.packs.map(id => {
    const pack = packById.get(id);
    if (!pack) {
      throw new Error(`Starter kit ${kit.id} references unknown pack: ${id}`);
    }
    return pack;
  });
}

// Generate per-kit detail pages
for (const kit of starterKits) {
  const kitId = safeSlug(kit.id, 'starter kit id');
  const kitPacks = resolveKitPacks(kit);

  const content = [
    `# ${kit.emoji} ${kit.name}`,
    '',
    `> ${kit.description}`,
    '',
    `**Audience**: ${kit.audience}`,
    '',
    '## Install All',
    '',
    '```bash',
    kit.installCommand,
    '```',
    '',
    `## Included Packs (${kitPacks.length})`,
    '',
    '| Pack | Description | Category |',
    '|------|-------------|----------|',
    ...kitPacks.map(p =>
      `| [${p.name}](../../official-packs/${p.id}/) | ${p.description} | ${p.category} |`
    ),
    '',
    '## How They Work Together',
    '',
    ...kitPacks.map((p, i) =>
      `${i + 1}. **${p.name}** — ${p.description.split('.')[0]}.`
    ),
    '',
    '## Quick Start',
    '',
    '```bash',
    '# Install the full kit',
    kit.installCommand,
    '',
    '# Verify installation',
    'packsmith list',
    '',
    '# Start using — just describe your task to your AI agent',
    '# The installed skills will activate automatically based on context.',
    '```',
    '',
    '---',
    `*Part of [Packsmith Starter Kits](./index.md). Install individual packs with \`packsmith install <pack-id>\`.*`,
    ''
  ].join('\n');

  writeFileSync(resolve(kitsDir, `${kitId}.md`), content, 'utf8');
  console.log(`Generated: docs/starter-kits/${kitId}.md`);
}

// Generate index page
const indexContent = [
  '# 🎯 Packsmith Starter Kits',
  '',
  '> Curated pack combinations for specific roles and workflows. Install a full kit in one command.',
  '',
  '## Available Kits',
  '',
  ...starterKits.map(kit => [
    `### ${kit.emoji} [${kit.name}](./${kit.id}.md)`,
    '',
    kit.description,
    '',
    `**Audience**: ${kit.audience} | **Packs**: ${kit.packs.length}`,
    '',
    '```bash',
    kit.installCommand,
    '```',
    ''
  ].join('\n')),
  '## How to Choose',
  '',
  '| If you are... | Start with |',
  '|---------------|-----------|',
  ...starterKits.map(kit => `| ${kit.audience.split(',')[0]} | [${kit.name}](./${kit.id}.md) |`),
  '',
  '## Mix and Match',
  '',
  'Starter kits are just recommendations. You can:',
  '- Install individual packs from any kit',
  '- Combine packs from multiple kits',
  '- Remove packs you don\'t need with `packsmith remove <pack-id>`',
  '',
  '---',
  '*Starter kits are generated by `scripts/generate-starter-kits.mjs`.*',
  ''
].join('\n');

writeFileSync(resolve(kitsDir, 'index.md'), indexContent, 'utf8');

// Generate machine-readable registry
const registryData = {
  schemaVersion: 1,
  updatedAt: catalog.updatedAt,
  kits: starterKits.map(kit => ({
    id: kit.id,
    name: kit.name,
    description: kit.description,
    audience: kit.audience,
    packs: kit.packs,
    packCount: kit.packs.length
  }))
};

writeFileSync(resolve(root, 'registry/starter-kits.json'), JSON.stringify(registryData, null, 2) + '\n', 'utf8');

console.log(`\n✓ Generated ${starterKits.length} starter kits`);
console.log(`  - ${starterKits.length} detail pages in docs/starter-kits/`);
console.log(`  - 1 index page`);
console.log(`  - 1 machine-readable registry (registry/starter-kits.json)`);
