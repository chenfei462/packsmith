#!/usr/bin/env node

/**
 * pack-freshness.mjs — Checks pack content freshness based on git history
 * and generates a staleness report.
 *
 * Usage:
 *   node scripts/pack-freshness.mjs
 *
 * Checks:
 *   1. Last modification date of each pack (via git log)
 *   2. Packs not modified in >90 days are flagged as stale
 *   3. Generates a markdown report for issue creation
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const STALE_THRESHOLD_DAYS = 90;
const now = Date.now();

// Load catalog
const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const packs = catalog.packs;

const stale = [];
const fresh = [];
const unknown = [];

function safePackId(value) {
  const packId = String(value ?? '');
  if (!/^[a-z0-9-]+$/i.test(packId)) {
    throw new Error(`Invalid pack id for git path: ${packId}`);
  }
  return packId;
}

for (const pack of packs) {
  try {
    const packDir = `official-packs/${safePackId(pack.id)}`;

    // Get last commit date for this pack directory
    const lastCommit = execFileSync(
      'git',
      ['log', '-1', '--format=%aI', '--', packDir],
      { cwd: root, encoding: 'utf8' }
    ).trim();

    if (!lastCommit) {
      unknown.push({ id: pack.id, reason: 'no git history' });
      continue;
    }

    const lastDate = new Date(lastCommit);
    const daysSince = Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    const entry = {
      id: pack.id,
      name: pack.name,
      category: pack.category,
      lastModified: lastCommit.split('T')[0],
      daysSince
    };

    if (daysSince > STALE_THRESHOLD_DAYS) {
      stale.push(entry);
    } else {
      fresh.push(entry);
    }
  } catch (e) {
    unknown.push({ id: pack.id, reason: e.message.split('\n')[0] });
  }
}

// Sort stale by days (most stale first)
stale.sort((a, b) => b.daysSince - a.daysSince);

// Print summary
console.log('═══ Pack Freshness Report ═══\n');
console.log(`Total packs: ${packs.length}`);
console.log(`Fresh (< ${STALE_THRESHOLD_DAYS} days): ${fresh.length}`);
console.log(`Stale (> ${STALE_THRESHOLD_DAYS} days): ${stale.length}`);
console.log(`Unknown: ${unknown.length}\n`);

if (stale.length > 0) {
  console.log('Stale packs:');
  for (const p of stale) {
    console.log(`  - ${p.id} (${p.category}) — last modified ${p.lastModified} (${p.daysSince} days ago)`);
  }
}

// Generate markdown report for GitHub issue
if (stale.length > 0) {
  const report = [
    '## Pack Freshness Report',
    '',
    `**Date**: ${new Date().toISOString().split('T')[0]}`,
    `**Stale threshold**: ${STALE_THRESHOLD_DAYS} days`,
    '',
    `| Pack | Category | Last Modified | Days Since |`,
    `|------|----------|---------------|------------|`,
    ...stale.map(p => `| ${p.id} | ${p.category} | ${p.lastModified} | ${p.daysSince} |`),
    '',
    '### Recommended Actions',
    '',
    '- Review each stale pack for relevance to current AI agent runtimes',
    '- Check if referenced tools/APIs still exist',
    '- Update workflow steps if runtime conventions have changed',
    '- Consider archiving packs that are no longer useful',
    ''
  ].join('\n');

  // Write report to file for workflow consumption
  writeFileSync(resolve(root, 'docs/freshness-report.md'), report, 'utf8');
  console.log('\nReport written to docs/freshness-report.md');
}

// Set GitHub Actions environment variables
if (process.env.GITHUB_ENV) {
  const envFile = process.env.GITHUB_ENV;
  const envContent = [
    `STALE_PACKS=${stale.length > 0 ? 'true' : ''}`,
    `STALE_COUNT=${stale.length}`,
  ].join('\n');
  writeFileSync(envFile, envContent + '\n', { flag: 'a' });
}

if (process.env.GITHUB_OUTPUT) {
  const outputFile = process.env.GITHUB_OUTPUT;
  writeFileSync(outputFile, `stale_count=${stale.length}\n`, { flag: 'a' });
}

// Set STALE_REPORT env var for issue body (truncated for GitHub limits)
if (process.env.GITHUB_ENV && stale.length > 0) {
  const shortReport = stale.slice(0, 20).map(p =>
    `- **${p.id}** (${p.category}) — ${p.daysSince} days since last update`
  ).join('\n');

  const envFile = process.env.GITHUB_ENV;
  // Use delimiter syntax for multiline env vars
  writeFileSync(envFile, `STALE_REPORT<<EOF\n${shortReport}\nEOF\n`, { flag: 'a' });
}

process.exit(0);
