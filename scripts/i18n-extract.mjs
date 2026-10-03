#!/usr/bin/env node

/**
 * i18n-extract.mjs — Extracts translatable strings from catalog and generates
 * TODO templates for missing entries in each language.
 *
 * Usage:
 *   node scripts/i18n-extract.mjs
 *
 * Behavior:
 *   - Reads registry/catalog.json for all pack metadata
 *   - For each configured language, checks catalog-descriptions.json
 *   - Adds TODO entries for any packs missing translations
 *   - Preserves existing translations (never overwrites)
 *   - Writes updated files back to disk
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load config
const config = JSON.parse(readFileSync(resolve(root, 'i18n/config.json'), 'utf8'));
const { languages, requiredFields, optionalFields } = config;

// Load catalog
const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const packs = catalog.packs;

let totalAdded = 0;
const changes = [];

for (const lang of languages) {
  const dirPath = resolve(root, `i18n/${lang}`);
  const filePath = resolve(dirPath, 'catalog-descriptions.json');

  // Ensure directory exists
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  // Load existing translations or start fresh
  let translations = {};
  if (existsSync(filePath)) {
    try {
      translations = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`Error reading ${filePath}: ${e.message}`);
      console.error('Skipping this language to avoid data loss.');
      continue;
    }
  }

  let addedForLang = 0;
  let changedForLang = false;

  for (const pack of packs) {
    const existing = translations[pack.id];

    // Skip if already has a complete translation (no _todo marker)
    if (existing && !existing._todo) {
      continue;
    }

    // Generate TODO template with English source as placeholder
    const template = {
      _todo: true,
      _source_name: pack.name,
      _source_description: pack.description
    };

    // Add required fields with English placeholder
    for (const field of requiredFields) {
      if (field === 'name') template.name = pack.name;
      if (field === 'description') template.description = pack.description;
    }

    // Add optional fields
    for (const field of optionalFields) {
      if (field === 'usageExample' && pack.usageExample) {
        template.usageExample = pack.usageExample;
      }
    }

    const nextEntry = existing
      ? {
          ...template,
          ...existing,
          _todo: true,
          _source_name: pack.name,
          _source_description: pack.description
        }
      : template;

    if (JSON.stringify(existing) !== JSON.stringify(nextEntry)) {
      translations[pack.id] = nextEntry;
      changedForLang = true;
    }

    if (!existing) {
      addedForLang++;
    }
  }

  if (changedForLang) {
    // Sort keys alphabetically for consistent diffs
    const sorted = {};
    for (const key of Object.keys(translations).sort()) {
      sorted[key] = translations[key];
    }

    writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    changes.push({ lang, added: addedForLang });
    totalAdded += addedForLang;
    console.log(`[${lang}] Added ${addedForLang} TODO template(s)`);
  } else {
    console.log(`[${lang}] All packs already have translations`);
  }
}

console.log(`\nTotal: ${totalAdded} template(s) added across ${changes.length} language(s)`);

// Set output for GitHub Actions
if (process.env.GITHUB_OUTPUT) {
  const outputFile = process.env.GITHUB_OUTPUT;
  const hasChanges = totalAdded > 0 ? 'true' : 'false';
  writeFileSync(outputFile, `has_changes=${hasChanges}\ntotal_added=${totalAdded}\n`, { flag: 'a' });
}

process.exit(0);
