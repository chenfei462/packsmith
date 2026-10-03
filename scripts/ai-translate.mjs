#!/usr/bin/env node

/**
 * ai-translate.mjs — AI-powered translation pipeline for pack metadata.
 *
 * Uses Claude API to translate pack names and descriptions into all configured
 * languages, preserving technical terminology and developer tone.
 *
 * Usage:
 *   node scripts/ai-translate.mjs                    # Translate all missing entries
 *   node scripts/ai-translate.mjs --pack <id>        # Translate specific pack
 *   node scripts/ai-translate.mjs --lang zh,ja       # Translate to specific languages
 *   node scripts/ai-translate.mjs --dry-run          # Preview without writing
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const specificPack = readOptionValue('--pack');
const specificPackId = specificPack ? safeSlug(specificPack, 'pack id') : null;
const specificLangs = readOptionValue('--lang')?.split(',').map(lang => safeSlug(lang.trim(), 'language code'));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

// Load config
const config = JSON.parse(readFileSync(resolve(root, 'i18n/config.json'), 'utf8'));
const languages = (specificLangs || config.languages).map(lang => safeSlug(lang, 'language code'));

// Load catalog
const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const packs = specificPackId
  ? catalog.packs.filter(p => p.id === specificPackId)
  : catalog.packs;

if (specificPackId && packs.length === 0) {
  console.error(`Pack "${specificPackId}" not found in catalog.`);
  process.exit(1);
}

// Language display names for prompting
const langNames = {
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German'
};

async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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

async function translateBatch(packsToTranslate, lang) {
  const langName = langNames[lang] || lang;

  // Batch up to 10 packs per API call for efficiency
  const batchSize = 10;
  const results = {};

  for (let i = 0; i < packsToTranslate.length; i += batchSize) {
    const batch = packsToTranslate.slice(i, i + batchSize);

    const entries = batch.map(p =>
      `- id: "${p.id}"\n  name: "${p.name}"\n  description: "${p.description}"`
    ).join('\n');

    const prompt = `Translate the following AI developer tool pack metadata into ${langName}.

Rules:
- Keep the translation concise (similar length to English)
- Use technical terminology common in the ${langName}-speaking developer community
- Do NOT translate: tool names, command names, file paths, brand names (GitHub, npm, etc.)
- Preserve the action-oriented tone (e.g., "Finds bugs..." → active voice in target language)
- Return ONLY valid JSON, no explanation or code fences

Input:
${entries}

Return a JSON object mapping pack IDs to translated fields:
{
  "<pack-id>": {
    "name": "<translated name>",
    "description": "<translated description>"
  }
}`;

    try {
      const response = await callClaude(prompt);

      // Parse JSON from response
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (e) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }

      Object.assign(results, parsed);
      console.log(`  [${lang}] Translated batch ${Math.floor(i / batchSize) + 1} (${batch.length} packs)`);

      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  [${lang}] Batch ${Math.floor(i / batchSize) + 1} failed: ${e.message}`);
    }
  }

  return results;
}

async function main() {
  console.log('═══ AI Translation Pipeline ═══\n');
  console.log(`Packs: ${packs.length}`);
  console.log(`Languages: ${languages.join(', ')}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Model: claude-haiku-4-5-20251001 (fast + cost-effective)\n`);

  let totalTranslated = 0;
  const changes = [];

  for (const lang of languages) {
    const filePath = resolve(root, 'i18n', lang, 'catalog-descriptions.json');
    const dirPath = resolve(root, 'i18n', lang);

    // Ensure directory exists
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    // Load existing translations
    let existing = {};
    if (existsSync(filePath)) {
      existing = JSON.parse(readFileSync(filePath, 'utf8'));
    }

    // Find packs needing translation (missing or marked _todo)
    const needsTranslation = packs.filter(p => {
      const entry = existing[p.id];
      return !entry || entry._todo;
    });

    if (needsTranslation.length === 0) {
      console.log(`[${lang}] All packs already translated ✓`);
      continue;
    }

    console.log(`[${lang}] ${needsTranslation.length} pack(s) need translation`);

    if (dryRun) {
      console.log(`  [dry-run] Would translate: ${needsTranslation.map(p => p.id).join(', ')}`);
      continue;
    }

    // Translate
    const translations = await translateBatch(needsTranslation, lang);
    const translatedCount = Object.keys(translations).length;

    if (translatedCount > 0) {
      // Merge with existing
      for (const [id, translation] of Object.entries(translations)) {
        if (translation.name && translation.description) {
          existing[id] = {
            name: translation.name,
            description: translation.description
          };
        }
      }

      // Sort and write
      const sorted = {};
      for (const key of Object.keys(existing).sort()) {
        sorted[key] = existing[key];
      }

      writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
      totalTranslated += translatedCount;
      changes.push({ lang, count: translatedCount });
      console.log(`  ✓ Wrote ${translatedCount} translations to i18n/${lang}/catalog-descriptions.json`);
    }
  }

  // Summary
  console.log('\n═══ Translation Summary ═══');
  console.log(`Total translated: ${totalTranslated}`);
  if (changes.length > 0) {
    changes.forEach(c => console.log(`  ${c.lang}: +${c.count}`));
  }

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, [
      `translated_count=${totalTranslated}`,
      `languages_updated=${changes.map(c => c.lang).join(',')}`,
      `has_changes=${totalTranslated > 0 ? 'true' : 'false'}`,
      ''
    ].join('\n'), { flag: 'a' });
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
