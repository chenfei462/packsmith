"use strict";

// Typosquatting detection for pack names (security-input.md §3 item 6).
// Pure string logic: no I/O, no dependencies, deterministic — safe to unit
// test in isolation and cheap enough to run on every preview/plan/install.

// Names within this edit distance of a known pack name are flagged. 2 keeps
// single typos and doubled typos covered while leaving genuinely different
// names alone.
export const TYPOSQUAT_DISTANCE_THRESHOLD = 2;

/**
 * Edit distance with transposition support (restricted Damerau-Levenshtein,
 * a.k.a. optimal string alignment). Plain Levenshtein scores a swapped letter
 * pair ("reviewer" -> "reveiwer") as 2 edits, which would understate exactly
 * the single-keystroke typos typosquatting relies on; counting adjacent
 * transpositions as one edit scores it 1. Implemented as a full matrix because
 * pack names are short (tens of characters) and the clarity is worth it.
 */
export function editDistance(left, right) {
  const a = String(left);
  const b = String(right);

  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const rows = a.length + 1;
  const columns = b.length + 1;
  const matrix = new Array(rows);

  for (let i = 0; i < rows; i++) {
    matrix[i] = new Array(columns);
    matrix[i][0] = i;
  }

  for (let j = 0; j < columns; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + substitutionCost // substitution
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        distance = Math.min(distance, matrix[i - 2][j - 2] + 1); // transposition
      }

      matrix[i][j] = distance;
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Return every known name within `maxDistance` edits of `packName`, sorted by
 * distance then name. Comparison is case-insensitive (a case swap is the
 * cheapest typosquat of all). The exact name itself (distance 0) is not a
 * match — installing the genuine pack must never warn.
 */
export function findTyposquattingMatches(packName, knownNames, options = {}) {
  const maxDistance = options.maxDistance ?? TYPOSQUAT_DISTANCE_THRESHOLD;
  const target = String(packName ?? "").trim().toLowerCase();

  if (target.length === 0) {
    return [];
  }

  const seen = new Set();
  const matches = [];

  for (const knownName of knownNames ?? []) {
    if (knownName === null || knownName === undefined) {
      continue;
    }

    const knownLabel = String(knownName).trim();
    const candidate = knownLabel.toLowerCase();

    if (candidate.length === 0 || candidate === target || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);

    const distance = editDistance(target, candidate);

    if (distance <= maxDistance) {
      matches.push({ name: knownLabel, distance });
    }
  }

  return matches.sort(
    (left, right) => left.distance - right.distance || left.name.localeCompare(right.name)
  );
}
