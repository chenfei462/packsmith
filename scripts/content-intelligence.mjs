#!/usr/bin/env node

/**
 * content-intelligence.mjs — AI-powered content intelligence gathering.
 *
 * Monitors competitor activity, runtime documentation changes, and community
 * signals to generate actionable content optimization recommendations.
 *
 * Usage:
 *   node scripts/content-intelligence.mjs
 *
 * Requires:
 *   ANTHROPIC_API_KEY — for AI analysis
 *   GITHUB_TOKEN — for GitHub API access
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

// Competitor repos to monitor
const competitors = [
  { owner: 'transitive-bullshit', repo: 'agentic' },
  { owner: 'block', repo: 'goose' },
  { owner: 'paul-gauthier', repo: 'aider' },
  { owner: 'continuedev', repo: 'continue' },
  { owner: 'openai', repo: 'codex' },
  { owner: 'anthropics', repo: 'claude-code' }
];

// Runtime repos to watch for breaking changes
const runtimes = [
  { owner: 'openai', repo: 'codex', target: 'codex' },
  { owner: 'opencode-ai', repo: 'opencode', target: 'opencode' }
];

// Community signal sources (GitHub topics)
const trendingTopics = [
  'ai-agent',
  'llm-tools',
  'developer-tools',
  'ai-coding',
  'prompt-engineering'
];

async function githubAPI(endpoint) {
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

  const response = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!response.ok) {
    if (response.status === 403) return null; // Rate limited
    throw new Error(`GitHub API ${response.status}: ${endpoint}`);
  }
  return response.json();
}

async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function gatherCompetitorIntel() {
  console.log('📡 Gathering competitor intelligence...');
  const intel = [];

  for (const { owner, repo } of competitors) {
    try {
      // Get recent releases
      const releases = await githubAPI(`/repos/${owner}/${repo}/releases?per_page=3`);
      if (releases && releases.length > 0) {
        const latest = releases[0];
        const daysAgo = Math.floor((Date.now() - new Date(latest.published_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo <= 30) {
          intel.push({
            type: 'release',
            repo: `${owner}/${repo}`,
            title: latest.name || latest.tag_name,
            date: latest.published_at,
            daysAgo,
            body: (latest.body || '').substring(0, 500)
          });
        }
      }

      // Get repo stats
      const repoData = await githubAPI(`/repos/${owner}/${repo}`);
      if (repoData) {
        intel.push({
          type: 'stats',
          repo: `${owner}/${repo}`,
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          description: repoData.description,
          updated: repoData.pushed_at
        });
      }

      await new Promise(r => setTimeout(r, 500)); // Rate limiting
    } catch (e) {
      console.log(`  ⚠ Could not fetch ${owner}/${repo}: ${e.message}`);
    }
  }

  return intel;
}

async function gatherRuntimeChanges() {
  console.log('📡 Checking runtime documentation changes...');
  const changes = [];

  for (const { owner, repo, target } of runtimes) {
    try {
      // Check recent commits for doc/convention changes
      const commits = await githubAPI(`/repos/${owner}/${repo}/commits?per_page=10`);
      if (commits) {
        const docCommits = commits.filter(c => {
          const msg = (c.commit?.message || '').toLowerCase();
          return msg.includes('doc') || msg.includes('skill') || msg.includes('agent') ||
                 msg.includes('convention') || msg.includes('format') || msg.includes('breaking');
        });

        if (docCommits.length > 0) {
          changes.push({
            target,
            repo: `${owner}/${repo}`,
            relevantCommits: docCommits.slice(0, 3).map(c => ({
              message: c.commit.message.split('\n')[0],
              date: c.commit.author.date
            }))
          });
        }
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log(`  ⚠ Could not check ${owner}/${repo}: ${e.message}`);
    }
  }

  return changes;
}

async function gatherCommunitySignals() {
  console.log('📡 Scanning community signals...');
  const signals = [];

  for (const topic of trendingTopics) {
    try {
      const results = await githubAPI(`/search/repositories?q=topic:${topic}+created:>2026-04-01&sort=stars&per_page=5`);
      if (results && results.items) {
        const newProjects = results.items.filter(r => r.stargazers_count > 50);
        if (newProjects.length > 0) {
          signals.push({
            topic,
            newProjects: newProjects.map(r => ({
              name: r.full_name,
              stars: r.stargazers_count,
              description: r.description,
              language: r.language
            }))
          });
        }
      }

      await new Promise(r => setTimeout(r, 1000)); // Search API rate limit
    } catch (e) {
      console.log(`  ⚠ Could not search topic "${topic}": ${e.message}`);
    }
  }

  return signals;
}

async function analyzeWithAI(competitorIntel, runtimeChanges, communitySignals) {
  console.log('\n🤖 Analyzing with AI...');

  // Load current catalog for context
  const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
  const currentPacks = catalog.packs.map(p => `${p.id} (${p.category})`).join(', ');

  const prompt = `You are a product strategist for Packsmith, an AI agent skill package manager.

Current pack catalog (${catalog.packs.length} packs): ${currentPacks}

Analyze the following market intelligence and provide actionable content recommendations.

## Competitor Activity
${JSON.stringify(competitorIntel, null, 2)}

## Runtime Changes
${JSON.stringify(runtimeChanges, null, 2)}

## Community Signals (trending projects)
${JSON.stringify(communitySignals, null, 2)}

Based on this intelligence, provide:

1. **New Pack Opportunities** (3-5 specific pack ideas based on market gaps)
   - Pack ID, description, why it matters now

2. **Existing Pack Updates** (packs that need updating based on runtime changes)
   - Which pack, what changed, what to update

3. **Competitive Positioning** (how to differentiate from competitor moves)
   - What competitors are doing, how Packsmith should respond

4. **Regional Opportunities** (market-specific content gaps)
   - Which region, what's needed, priority level

5. **Risk Alerts** (breaking changes or threats to address urgently)
   - What's at risk, impact, recommended action

Format as markdown. Be specific and actionable — each recommendation should be implementable.`;

  return await callClaude(prompt);
}

async function main() {
  console.log('═══ Content Intelligence Pipeline ═══\n');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Monitoring: ${competitors.length} competitors, ${runtimes.length} runtimes, ${trendingTopics.length} topics\n`);

  // Gather intelligence
  const competitorIntel = await gatherCompetitorIntel();
  const runtimeChanges = await gatherRuntimeChanges();
  const communitySignals = await gatherCommunitySignals();

  console.log(`\nGathered: ${competitorIntel.length} competitor signals, ${runtimeChanges.length} runtime changes, ${communitySignals.length} community signals`);

  // AI analysis
  let analysis;
  try {
    analysis = await analyzeWithAI(competitorIntel, runtimeChanges, communitySignals);
  } catch (e) {
    console.error(`AI analysis failed: ${e.message}`);
    analysis = '## Analysis Unavailable\n\nClaude API call failed. Raw intelligence data is available in the workflow artifacts.';
  }

  // Generate report
  const report = [
    `# Content Intelligence Report — ${new Date().toISOString().split('T')[0]}`,
    '',
    '## Raw Intelligence',
    '',
    `### Competitor Activity (${competitorIntel.filter(i => i.type === 'release').length} recent releases)`,
    '',
    ...competitorIntel.filter(i => i.type === 'release').map(i =>
      `- **${i.repo}** released "${i.title}" (${i.daysAgo} days ago)`
    ),
    '',
    `### Runtime Changes (${runtimeChanges.length} repos with relevant commits)`,
    '',
    ...runtimeChanges.map(c =>
      `- **${c.target}** (${c.repo}): ${c.relevantCommits.map(cc => cc.message).join('; ')}`
    ),
    '',
    `### Community Signals (${communitySignals.reduce((s, c) => s + c.newProjects.length, 0)} trending projects)`,
    '',
    ...communitySignals.flatMap(s =>
      s.newProjects.map(p => `- [${p.name}](https://github.com/${p.name}) ⭐${p.stars} — ${p.description}`)
    ),
    '',
    '---',
    '',
    '## AI Analysis & Recommendations',
    '',
    analysis,
    '',
    '---',
    '*Generated by `scripts/content-intelligence.mjs`*'
  ].join('\n');

  writeFileSync(resolve(root, 'docs/content-intelligence-report.md'), report, 'utf8');
  console.log('\n✓ Report written to docs/content-intelligence-report.md');

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    const hasSignals = competitorIntel.length + runtimeChanges.length + communitySignals.length > 0;
    writeFileSync(process.env.GITHUB_OUTPUT, [
      `has_signals=${hasSignals ? 'true' : 'false'}`,
      `competitor_signals=${competitorIntel.filter(i => i.type === 'release').length}`,
      `runtime_changes=${runtimeChanges.length}`,
      `community_signals=${communitySignals.reduce((s, c) => s + c.newProjects.length, 0)}`,
      ''
    ].join('\n'), { flag: 'a' });
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
