#!/usr/bin/env node

/**
 * generate-catalog-shards.mjs — Splits the registry catalog into CDN-friendly
 * shards by category and language for faster regional loading.
 *
 * Usage:
 *   node scripts/generate-catalog-shards.mjs
 *
 * Output:
 *   dist/catalog-<category>.json   — packs filtered by category
 *   dist/catalog-<lang>.json       — catalog with localized metadata
 *   dist/catalog-full.json         — complete catalog (copy)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');

mkdirSync(distDir, { recursive: true });

// Load data
const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const i18nConfig = JSON.parse(readFileSync(resolve(root, 'i18n/config.json'), 'utf8'));
const packs = catalog.packs;

const categories = [...new Set(packs.map(p => p.category))];

function safeSlug(value, label) {
  const slug = String(value ?? '');
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error(`Invalid ${label}: ${slug}`);
  }
  return slug;
}

// 1. Full catalog copy
writeFileSync(resolve(distDir, 'catalog-full.json'), JSON.stringify(catalog, null, 2), 'utf8');
console.log('Generated: dist/catalog-full.json');

// 2. Category shards
for (const cat of categories) {
  const safeCategory = safeSlug(cat, 'catalog category');
  const shard = {
    schemaVersion: catalog.schemaVersion,
    updatedAt: catalog.updatedAt,
    category: safeCategory,
    packs: packs.filter(p => p.category === cat)
  };
  const filename = `catalog-${safeCategory}.json`;
  writeFileSync(resolve(distDir, filename), JSON.stringify(shard, null, 2), 'utf8');
  console.log(`Generated: dist/${filename} (${shard.packs.length} packs)`);
}

// 3. Language shards (catalog with localized name/description)
let generatedLanguageShards = 0;
for (const lang of i18nConfig.languages) {
  const safeLang = safeSlug(lang, 'catalog language');
  const filePath = resolve(root, 'i18n', safeLang, 'catalog-descriptions.json');
  if (!existsSync(filePath)) {
    throw new Error(`Missing catalog translations for language: ${safeLang}`);
  }

  const translations = JSON.parse(readFileSync(filePath, 'utf8'));

  const localizedPacks = packs.map(p => {
    const t = translations[p.id];
    if (!t || t._todo) return p;
    return {
      ...p,
      name: t.name || p.name,
      description: t.description || p.description,
      _lang: lang
    };
  });

  const shard = {
    schemaVersion: catalog.schemaVersion,
    updatedAt: catalog.updatedAt,
    language: safeLang,
    packs: localizedPacks
  };

  const filename = `catalog-${safeLang}.json`;
  writeFileSync(resolve(distDir, filename), JSON.stringify(shard, null, 2), 'utf8');
  generatedLanguageShards++;
  console.log(`Generated: dist/${filename} (${safeLang} localized)`);
}

// Summary
const totalFiles = 1 + categories.length + generatedLanguageShards;
console.log(`\nTotal: ${totalFiles} catalog shards generated in dist/`);
