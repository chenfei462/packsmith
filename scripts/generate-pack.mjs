#!/usr/bin/env node

/**
 * generate-pack.mjs — AI-powered pack generation for regional ecosystems.
 *
 * Uses Claude API to generate complete pack content (packsmith.json, SKILL.md, prompt)
 * for region-specific developer workflows.
 *
 * Usage:
 *   node scripts/generate-pack.mjs --pack wechat-miniprogram-reviewer
 *   node scripts/generate-pack.mjs --batch regional-packs.json
 *   node scripts/generate-pack.mjs --batch regional-packs.json --dry-run
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../src/lib/pack.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function readOptionValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Error: ${name} requires a value.`);
    process.exit(1);
  }

  return value;
}

function safeSlug(value, label) {
  const slug = String(value ?? '');
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error(`Invalid ${label}: ${slug}`);
  }
  return slug;
}

const batchFile = readOptionValue('--batch');
const singlePack = readOptionValue('--pack');
const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

// Load an existing pack as reference template
const referencePack = JSON.parse(
  readFileSync(resolve(root, 'official-packs/senior-code-reviewer/packsmith.json'), 'utf8')
);
const referenceSkill = readFileSync(
  resolve(root, 'official-packs/senior-code-reviewer/skills/senior-code-review/SKILL.md'), 'utf8'
);

// Regional pack definitions
const defaultBatch = [
  {
    id: 'wechat-miniprogram-reviewer',
    region: 'China',
    category: 'code-quality',
    description: 'Reviews WeChat Mini Program code for platform compliance, performance best practices, and common pitfalls.',
    docsUrl: 'https://developers.weixin.qq.com/miniprogram/dev/framework/',
    tags: ['wechat', 'miniprogram', 'china', 'review', 'mobile']
  },
  {
    id: 'alipay-mini-reviewer',
    region: 'China',
    category: 'code-quality',
    description: 'Reviews Alipay Mini Program code for platform standards, API usage, and submission requirements.',
    docsUrl: 'https://opendocs.alipay.com/mini/',
    tags: ['alipay', 'miniprogram', 'china', 'review', 'payments']
  },
  {
    id: 'alibaba-cloud-deployer',
    region: 'China',
    category: 'repository-understanding',
    description: 'Reviews Alibaba Cloud (Aliyun) deployment configurations, ECS/OSS/RDS setup, and security groups.',
    docsUrl: 'https://help.aliyun.com/',
    tags: ['alibaba', 'aliyun', 'cloud', 'china', 'deployment', 'infrastructure']
  },
  {
    id: 'tencent-cloud-reviewer',
    region: 'China',
    category: 'repository-understanding',
    description: 'Reviews Tencent Cloud resource configurations, CVM/COS/TencentDB setup, and VPC security.',
    docsUrl: 'https://cloud.tencent.com/document',
    tags: ['tencent', 'cloud', 'china', 'infrastructure', 'review']
  },
  {
    id: 'line-bot-builder',
    region: 'Japan/SEA',
    category: 'agent-workflow',
    description: 'Guides LINE Bot development with Messaging API best practices, rich menus, and Flex Messages.',
    docsUrl: 'https://developers.line.biz/en/docs/messaging-api/',
    tags: ['line', 'bot', 'japan', 'messaging', 'chatbot']
  },
  {
    id: 'rakuten-api-integrator',
    region: 'Japan',
    category: 'repository-understanding',
    description: 'Guides Rakuten API integration for e-commerce, points, and payment systems.',
    docsUrl: 'https://webservice.rakuten.co.jp/',
    tags: ['rakuten', 'japan', 'ecommerce', 'api', 'payments']
  },
  {
    id: 'kakao-mini-reviewer',
    region: 'Korea',
    category: 'code-quality',
    description: 'Reviews Kakao Mini App code for platform compliance, Kakao SDK usage, and UX guidelines.',
    docsUrl: 'https://developers.kakao.com/docs',
    tags: ['kakao', 'korea', 'miniapp', 'review', 'mobile']
  },
  {
    id: 'naver-seo-optimizer',
    region: 'Korea',
    category: 'product-launch',
    description: 'Optimizes web content for Naver search engine including structured data, Naver Blog SEO, and SmartStore visibility.',
    docsUrl: 'https://searchadvisor.naver.com/',
    tags: ['naver', 'korea', 'seo', 'search', 'optimization']
  },
  {
    id: 'gdpr-compliance-checker',
    region: 'Europe',
    category: 'code-quality',
    description: 'Checks code and configurations for GDPR compliance including data handling, consent flows, and privacy by design.',
    docsUrl: 'https://gdpr.eu/',
    tags: ['gdpr', 'europe', 'privacy', 'compliance', 'security']
  },
  {
    id: 'aws-china-deployer',
    region: 'China',
    category: 'repository-understanding',
    description: 'Reviews AWS China region deployment differences including ICP requirements, partition-specific endpoints, and service availability.',
    docsUrl: 'https://docs.amazonaws.cn/',
    tags: ['aws', 'china', 'cloud', 'deployment', 'infrastructure']
  },
  {
    id: 'dingtalk-bot-builder',
    region: 'China',
    category: 'agent-workflow',
    description: 'Guides DingTalk (钉钉) bot and mini-app development with webhook integration and interactive cards.',
    docsUrl: 'https://open.dingtalk.com/document/',
    tags: ['dingtalk', 'china', 'bot', 'enterprise', 'messaging']
  },
  {
    id: 'feishu-bot-builder',
    region: 'China',
    category: 'agent-workflow',
    description: 'Guides Feishu (飞书/Lark) bot development with event subscriptions, card messages, and approval workflows.',
    docsUrl: 'https://open.feishu.cn/document/',
    tags: ['feishu', 'lark', 'china', 'bot', 'enterprise', 'messaging']
  }
];

async function callClaude(prompt, systemPrompt) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });

  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body
      });

      if (!response.ok) {
        const error = await response.text();
        lastError = new Error(`Claude API error (${response.status}): ${error}`);

        if (attempt < 3 && RETRYABLE_STATUSES.has(response.status)) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        throw lastError;
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      lastError = error;

      if (attempt < 3 && error.name === 'AbortError') {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function generatePack(packDef) {
  console.log(`\n🔨 Generating: ${packDef.id} (${packDef.region})`);

  const systemPrompt = `You are a Packsmith pack author. You generate AI agent skill packs that follow exact conventions.

A pack consists of:
1. packsmith.json — manifest with metadata
2. skills/<skill-id>/SKILL.md — skill definition with triggers, workflow, output format
3. prompts/<prompt-id>.md — prompt file

Follow these conventions exactly:
- Skill workflows have 4-6 numbered steps
- Output format is always a bullet list
- Trigger conditions are explicit
- Quality bar emphasizes grounding in evidence
- All packs support targets: claude-code, codex, github-copilot, opencode, cursor, trae
- Risk level is low unless shell/network permissions are required
- Context size estimate in characters (typically 3000-5000)`;

  // Generate SKILL.md
  const skillPrompt = `Generate a SKILL.md file for a pack called "${packDef.id}".

Description: ${packDef.description}
Region: ${packDef.region}
Category: ${packDef.category}
Official docs: ${packDef.docsUrl}

Reference format (follow this structure exactly):
${referenceSkill}

Requirements:
- The skill must reference the official documentation URL
- Include region-specific best practices
- Workflow steps should be actionable and specific to this platform
- Output format should list concrete deliverables
- Keep it under 4000 characters

Return ONLY the SKILL.md content, no code fences or explanation.`;

  const skillContent = await callClaude(skillPrompt, systemPrompt);

  // Generate packsmith.json
  const manifestPrompt = `Generate a packsmith.json manifest for pack "${packDef.id}".

Description: ${packDef.description}
Category: ${packDef.category}
Tags: ${packDef.tags.join(', ')}

Reference format:
${JSON.stringify(referencePack, null, 2)}

Requirements:
- Use id: "${packDef.id}"
- Use description: "${packDef.description}"
- version: "0.1.0"
- targets: ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"]
- category: "${packDef.category}"
- tags: ${JSON.stringify(packDef.tags)}
- skills array with one skill entry pointing to "skills/${packDef.id}"
- prompts array with one prompt entry pointing to "prompts/${packDef.id}.md"
- targetSupport with honest install notes for each target, including trae as local TRAE Skill directories
- Appropriate permissions (most regional packs need filesystem: required, shell: optional)
- context.estimatedChars between 3000-5000
- context.riskLevel: "low" unless network access is truly required

Return ONLY valid JSON, no code fences or explanation.`;

  const manifestContent = await callClaude(manifestPrompt, systemPrompt);

  // Generate prompt file
  const promptPrompt = `Generate a short prompt markdown file for the pack "${packDef.id}".

Description: ${packDef.description}

The prompt file should be 5-10 lines:
- Title (# heading)
- One line describing what to run
- Focus statement
- Return format (3-5 bullet items)

Return ONLY the markdown content, no code fences or explanation.`;

  const promptContent = await callClaude(promptPrompt, systemPrompt);

  return { skillContent, manifestContent, promptContent };
}

async function writePack(packDef, content) {
  const packId = safeSlug(packDef.id, 'pack id');
  const packDir = resolve(root, 'official-packs', packId);
  const skillId = packId;
  const skillDir = resolve(packDir, `skills/${skillId}`);
  const promptDir = resolve(packDir, 'prompts');

  mkdirSync(skillDir, { recursive: true });
  mkdirSync(promptDir, { recursive: true });

  // Write manifest
  let manifest;
  try {
    manifest = JSON.parse(content.manifestContent);
  } catch (e) {
    // Try to extract JSON from response
    const jsonMatch = content.manifestContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      manifest = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse manifest JSON for ${packDef.id}: ${e.message}`);
    }
  }
  manifest = {
    ...manifest,
    name: packId,
    description: packDef.description,
    version: manifest.version ?? '0.1.0',
    targets: ['claude-code', 'codex', 'github-copilot', 'opencode', 'cursor', 'trae'],
    category: packDef.category,
    tags: packDef.tags,
    skills: [
      {
        ...(manifest.skills?.[0] ?? {}),
        id: skillId,
        path: `skills/${skillId}`,
        description: manifest.skills?.[0]?.description ?? packDef.description
      }
    ],
    prompts: [
      {
        ...(manifest.prompts?.[0] ?? {}),
        id: packId,
        path: `prompts/${packId}.md`,
        description: manifest.prompts?.[0]?.description ?? `Prompt for running the ${packId} workflow.`
      }
    ],
    targetSupport: {
      ...(manifest.targetSupport ?? {}),
      'claude-code': 'Installs as a Claude Code skill directory with SKILL.md as the entry point.',
      codex: 'Installs as a Codex skill pack with a generated AGENTS.md bridge.',
      'github-copilot': 'Installs as a GitHub Copilot project skill under .github/skills with a generated SKILL.md bridge.',
      opencode: 'Installs as a Packsmith OpenCode skill directory with PACKSMITH.md bridge notes.',
      cursor: 'Installs as a Cursor rule pack with a generated .mdc rule and copied Packsmith assets.',
      trae: 'Installs as a local TRAE Skill directory with a generated SKILL.md bridge and copied Packsmith assets.'
    }
  };
  writeFileSync(resolve(packDir, 'packsmith.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Write skill
  writeFileSync(resolve(skillDir, 'SKILL.md'), content.skillContent.trim() + '\n', 'utf8');

  // Write prompt
  writeFileSync(resolve(promptDir, `${packId}.md`), content.promptContent.trim() + '\n', 'utf8');

  await validatePack(packDir);

  console.log(`  ✓ Written to official-packs/${packDef.id}/`);
}

async function main() {
  let packDefs;

  if (batchFile) {
    packDefs = JSON.parse(readFileSync(resolve(root, batchFile), 'utf8'));
  } else if (singlePack) {
    packDefs = defaultBatch.filter(p => p.id === singlePack);
    if (packDefs.length === 0) {
      console.error(`Pack "${singlePack}" not found in default batch.`);
      console.log('Available:', defaultBatch.map(p => p.id).join(', '));
      process.exit(1);
    }
  } else {
    packDefs = defaultBatch;
  }

  console.log(`═══ AI Pack Generator ═══`);
  console.log(`Packs to generate: ${packDefs.length}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`API: Claude claude-sonnet-4-6`);

  const results = { success: [], failed: [] };

  for (const packDef of packDefs) {
    const packId = safeSlug(packDef.id, 'pack id');
    // Skip if pack already exists
    if (existsSync(resolve(root, 'official-packs', packId, 'packsmith.json'))) {
      console.log(`\n⏭ Skipping ${packDef.id} (already exists)`);
      continue;
    }

    try {
      const content = await generatePack(packDef);

      if (dryRun) {
        console.log(`  [dry-run] Would write to official-packs/${packId}/`);
        console.log(`  Skill preview: ${content.skillContent.substring(0, 100)}...`);
      } else {
        await writePack(packDef, content);
      }

      results.success.push(packId);

      // Rate limiting: wait 2s between API calls
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`);
      results.failed.push({ id: packId, error: e.message });
    }
  }

  // Summary
  console.log('\n═══ Generation Summary ═══');
  console.log(`Success: ${results.success.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed packs:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
  }

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    const outputFile = process.env.GITHUB_OUTPUT;
    writeFileSync(outputFile, [
      `generated_count=${results.success.length}`,
      `failed_count=${results.failed.length}`,
      `generated_packs=${results.success.join(',')}`,
      ''
    ].join('\n'), { flag: 'a' });
  }

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
