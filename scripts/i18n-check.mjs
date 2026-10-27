#!/usr/bin/env node

/**
 * i18n-check.mjs - Validates translation completeness and correctness.
 *
 * Usage:
 *   node scripts/i18n-check.mjs          # Local mode (prints report)
 *   node scripts/i18n-check.mjs --ci     # CI mode (emits GitHub Actions annotations)
 *
 * Checks:
 *   1. JSON syntax validity for all translation files
 *   2. All packs in catalog have entries in each language
 *   3. Required fields (name, description) are non-empty strings
 *   4. Coverage percentage per language meets threshold
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ciMode = process.argv.includes('--ci');

const config = JSON.parse(readFileSync(resolve(root, 'i18n/config.json'), 'utf8'));
const { languages, requiredFields, completionThreshold } = config;

const catalog = JSON.parse(readFileSync(resolve(root, 'registry/catalog.json'), 'utf8'));
const packIds = catalog.packs.map(p => p.id);
const totalPacks = packIds.length;

let hasErrors = false;
let hasWarnings = false;
const results = [];

function reportError(file, message) {
  if (ciMode) console.log(`::error file=${file}::${message}`);
  else console.error(`  Error: ${message}`);
  hasErrors = true;
}

function reportWarning(file, message) {
  if (ciMode) console.log(`::warning file=${file}::${message}`);
  else console.warn(`  Warning: ${message}`);
  hasWarnings = true;
}

for (const lang of languages) {
  const relativeFile = `i18n/${lang}/catalog-descriptions.json`;
  const filePath = resolve(root, relativeFile);

  if (!existsSync(filePath)) {
    const msg = `${relativeFile} does not exist`;
    if (ciMode) reportError(relativeFile, msg);
    else reportWarning(relativeFile, msg);
    results.push({ lang, coverage: 0, missing: packIds.length, errors: [msg] });
    continue;
  }

  let translations;
  try {
    translations = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    const msg = `${relativeFile} has invalid JSON: ${e.message}`;
    reportError(relativeFile, msg);
    results.push({ lang, coverage: 0, missing: packIds.length, errors: [msg] });
    continue;
  }

  const errors = [];
  const missingPacks = [];
  let translatedCount = 0;

  for (const packId of packIds) {
    const entry = translations[packId];

    if (!entry) {
      missingPacks.push(packId);
      continue;
    }

    let entryValid = true;
    for (const field of requiredFields) {
      if (!entry[field] || typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`${packId}: missing or empty required field "${field}"`);
        entryValid = false;
      }
    }

    if (entry._todo) {
      missingPacks.push(packId);
      continue;
    }

    if (entryValid) translatedCount++;
  }

  const coverage = totalPacks === 0 ? 1 : translatedCount / totalPacks;
  const coveragePct = (coverage * 100).toFixed(1);

  results.push({
    lang,
    coverage: coveragePct,
    translated: translatedCount,
    missing: missingPacks.length,
    errors
  });

  for (const err of errors) {
    reportError(relativeFile, `[${lang}] ${err}`);
  }

  if (missingPacks.length > 0) {
    const msg = `[${lang}] Missing translations for ${missingPacks.length} packs: ${missingPacks.slice(0, 5).join(', ')}${missingPacks.length > 5 ? '...' : ''}`;
    if (ciMode) reportError(relativeFile, msg);
    else reportWarning(relativeFile, msg);
  }

  if (coverage < completionThreshold) {
    const msg = `[${lang}] Coverage ${coveragePct}% is below threshold ${(completionThreshold * 100).toFixed(0)}%`;
    if (ciMode) reportError(relativeFile, msg);
    else reportWarning(relativeFile, msg);
  }
}

console.log('\ni18n Coverage Report\n');
console.log(`Catalog packs: ${totalPacks}`);
console.log(`Languages: ${languages.join(', ')}`);
console.log(`Threshold: ${(completionThreshold * 100).toFixed(0)}%\n`);

console.log('Language  Coverage  Translated  Missing  Status');
console.log('--------  --------  ----------  -------  ------');

for (const r of results) {
  const status = r.errors?.length > 0 ? 'ERROR' :
    (parseFloat(r.coverage) >= completionThreshold * 100) ? 'OK' : 'LOW';
  console.log(
    `${r.lang.padEnd(10)}${String(r.coverage + '%').padEnd(10)}${String(r.translated ?? 0).padEnd(12)}${String(r.missing).padEnd(9)}${status}`
  );
}

console.log('');

if (hasErrors) {
  console.error('Translation validation failed with errors.');
  process.exit(1);
}

if (ciMode && hasWarnings) {
  console.error('Translation validation failed with warnings in CI.');
  process.exit(1);
}

console.log('Translation validation passed.');
process.exit(0);
