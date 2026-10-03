#!/usr/bin/env node

/**
 * generate-demo.mjs — Generates CLI demo scripts for VHS (terminal recorder).
 *
 * Creates .tape files that VHS can render into GIF/SVG animations showing
 * Packsmith CLI in action. Each demo covers a key user journey.
 *
 * Usage:
 *   node scripts/generate-demo.mjs              # Generate all demo tapes
 *   node scripts/generate-demo.mjs --render     # Generate + render with VHS (requires vhs binary)
 *
 * Output:
 *   docs/assets/demos/*.tape   — VHS tape scripts
 *   docs/assets/demos/*.gif    — Rendered GIFs (if --render)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const demosDir = resolve(root, 'docs/assets/demos');

mkdirSync(demosDir, { recursive: true });

const shouldRender = process.argv.includes('--render');
const demoEnv = 'PACKSMITH_HOME=/tmp/packsmith-demo-state PACKSMITH_TEST_HOME=/tmp/packsmith-demo-home';
const demoCli = `${demoEnv} node ../../../src/cli.mjs`;

// Demo 1: Discovery flow (search → show → preview)
const discoveryTape = `# Packsmith Discovery Demo
# Shows: search → show → preview workflow

Output discovery.gif
Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 600
Set Theme "Dracula"
Set Padding 20

Type "# Preview trusted AI agent workflows with Packsmith"
Enter
Sleep 1s

Type "${demoCli} search code review"
Enter
Sleep 3s

Type "# Let's see more about the senior code reviewer"
Enter
Sleep 1s

Type "${demoCli} show senior-code-reviewer"
Enter
Sleep 4s

Type "# Preview what will be installed"
Enter
Sleep 1s

Type "${demoCli} preview senior-code-reviewer --target codex"
Enter
Sleep 3s

Type "# Ready to install!"
Enter
Sleep 2s
`;

// Demo 2: Install flow
const installTape = `# Packsmith Install Demo
# Shows: install → list → verify workflow

Output install.gif
Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 600
Set Theme "Dracula"
Set Padding 20

Type "# Install a workflow pack across your AI agents"
Enter
Sleep 1s

Type "${demoCli} install senior-code-reviewer --target codex --yes"
Enter
Sleep 3s

Type "# See what's installed"
Enter
Sleep 1s

Type "${demoCli} list"
Enter
Sleep 3s

Type "# Audit your installations"
Enter
Sleep 1s

Type "${demoCli} audit"
Enter
Sleep 3s

Type "# Done! The skill is now available in your AI agent."
Enter
Sleep 2s
`;

// Demo 3: Multi-language search
const i18nTape = `# Packsmith i18n Demo
# Shows: multi-language pack browsing

Output i18n.gif
Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 600
Set Theme "Dracula"
Set Padding 20

Type "# 🌐 Packsmith supports 7 languages"
Enter
Sleep 1s

Type "${demoCli} search 测试"
Enter
Sleep 3s

Type "${demoCli} search セキュリティ"
Enter
Sleep 3s

Type "${demoCli} search 코드 리뷰"
Enter
Sleep 3s

Type "# Install works the same in any language"
Enter
Sleep 1s

Type "${demoCli} install test-writer --target codex --yes"
Enter
Sleep 3s
`;

// Demo 4: Quality & Trust
const trustTape = `# Packsmith Trust Demo
# Shows: doctor → audit → policy workflow

Output trust.gif
Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 600
Set Theme "Dracula"
Set Padding 20

Type "# 🛡️ Quality scoring and trust verification"
Enter
Sleep 1s

Type "${demoCli} doctor ../../../official-packs/senior-code-reviewer"
Enter
Sleep 3s

Type "# Audit installed packs for integrity"
Enter
Sleep 1s

Type "${demoCli} audit"
Enter
Sleep 3s

Type "# Enforce organizational policy"
Enter
Sleep 1s

Type "${demoCli} audit --policy ../../../examples/policy.json"
Enter
Sleep 3s

Type "# Your installations are verified ✓"
Enter
Sleep 2s
`;

// Demo 5: Full journey (hero demo for README)
const heroTape = `# Packsmith Hero Demo
# The complete user journey in 30 seconds

Output packsmith-hero.gif
Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 650
Set Theme "Dracula"
Set Padding 24

Type "# Packsmith - The package manager for AI agent workflows"
Enter
Sleep 2s

Type "${demoCli} search security"
Enter
Sleep 3s

Type "${demoCli} show security-reviewer"
Enter
Sleep 3s

Type "${demoCli} install security-reviewer --target codex --yes"
Enter
Sleep 3s

Type "${demoCli} list"
Enter
Sleep 2s

Type "# ✅ Installed across Claude Code, Codex, Copilot, Cursor & OpenCode"
Enter
Sleep 3s
`;

// Write all tapes
const tapes = [
  { name: 'discovery', content: discoveryTape },
  { name: 'install', content: installTape },
  { name: 'i18n', content: i18nTape },
  { name: 'trust', content: trustTape },
  { name: 'packsmith-hero', content: heroTape }
];

for (const tape of tapes) {
  const filePath = resolve(demosDir, `${tape.name}.tape`);
  writeFileSync(filePath, tape.content, 'utf8');
  console.log(`Generated: docs/assets/demos/${tape.name}.tape`);
}

// Render if requested
if (shouldRender) {
  console.log('\nRendering GIFs with VHS...\n');

  try {
    execFileSync('vhs', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('Error: VHS is not installed. Install from https://github.com/charmbracelet/vhs');
    console.log('Tape files are generated — render manually with: vhs < file.tape');
    process.exit(1);
  }

  let renderFailures = 0;

  for (const tape of tapes) {
    const tapeFile = `${tape.name}.tape`;
    try {
      console.log(`Rendering: ${tape.name}.tape → ${tape.name}.gif`);
      execFileSync('vhs', [tapeFile], { cwd: demosDir, stdio: 'inherit' });
    } catch (e) {
      console.error(`  ✗ Failed to render ${tape.name}: ${e.message}`);
      renderFailures++;
    }
  }

  if (renderFailures > 0) {
    process.exit(1);
  }
}

// Generate an index markdown
const indexContent = [
  '# Packsmith Demo Assets',
  '',
  'Terminal recordings generated by [VHS](https://github.com/charmbracelet/vhs).',
  '',
  '## Available Demos',
  '',
  '| Demo | Description | Tape |',
  '|------|-------------|------|',
  '| Hero | Complete user journey (README) | `packsmith-hero.tape` |',
  '| Discovery | search → show → preview | `discovery.tape` |',
  '| Install | install → list → audit | `install.tape` |',
  '| i18n | Multi-language search | `i18n.tape` |',
  '| Trust | doctor → audit → policy | `trust.tape` |',
  '',
  '## Rendering',
  '',
  '```bash',
  '# Install VHS',
  'brew install charmbracelet/tap/vhs  # macOS',
  '',
  '# Render all demos',
  'node scripts/generate-demo.mjs --render',
  '',
  '# Render single demo',
  'vhs docs/assets/demos/packsmith-hero.tape',
  '```',
  '',
  '## Usage in README',
  '',
  '```markdown',
  '![Packsmith Demo](docs/assets/demos/packsmith-hero.gif)',
  '```',
  ''
].join('\n');

writeFileSync(resolve(demosDir, 'README.md'), indexContent, 'utf8');

console.log(`\n✓ Generated ${tapes.length} demo tapes + index`);
console.log(shouldRender ? 'GIFs rendered.' : 'Run with --render to create GIFs (requires VHS).');
