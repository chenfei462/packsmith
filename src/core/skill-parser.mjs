import path from "node:path";
import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { listDirectoryFiles, pathExists } from "../lib/fs-utils.mjs";
import {
  SKILL_FILE_NAME,
  firstSegment,
  skillFileExists,
  toPosixPath
} from "./paths.mjs";

/**
 * Skill parser (v0.2 Milestone 1, plan §7).
 *
 * Responsibility: read / parse / normalize / collect metadata — nothing else.
 * This module deliberately does NOT decide whether a Skill is valid; every
 * judgment (name format, description quality, context limits, security)
 * belongs to the diagnostics engine and checks/ (later milestones). The
 * `parse.status` field below only reports what the parser *saw* on disk.
 *
 * YAML is parsed with the `yaml` package (plan §7: correct YAML parsing is a
 * correctness requirement; a hand-written parser is forbidden).
 */

/**
 * Parser outcomes. Facts, not verdicts:
 *   ok                       — SKILL.md exists and frontmatter parsed into a mapping
 *   missing-skill-file       — the directory exists but has no SKILL.md
 *   missing-frontmatter      — no `--- ... ---` block (incl. unterminated block); whole file is body
 *   empty-frontmatter        — block present but YAML value is empty/comment-only
 *   frontmatter-not-mapping  — YAML parsed but is a scalar/sequence, not a mapping
 *   invalid-yaml             — the yaml package raised a parse error
 */
export const PARSE_STATUSES = [
  "ok",
  "missing-skill-file",
  "missing-frontmatter",
  "empty-frontmatter",
  "frontmatter-not-mapping",
  "invalid-yaml"
];

const FENCE_OPEN = /^---\s*$/;
const FENCE_CLOSE = /^---\s*$/;

/**
 * Split raw SKILL.md content into `{ frontmatterText, body, hasBlock }`.
 * Pure function. Rules (documented, deterministic):
 * - a leading UTF-8 BOM is stripped before fence detection;
 * - frontmatter opens with a `---` line on line 1 and closes at the next
 *   `---` line; an unterminated block means there is NO frontmatter block
 *   (the whole content is body), matching how runtimes treat such files;
 * - CRLF is tolerated; `body` keeps its original line endings, minus the
 *   single newline that directly follows the closing fence.
 */
export function splitFrontmatter(rawContent) {
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;
  const lineEnd = content.indexOf("\n");
  const firstLine = (lineEnd === -1 ? content : content.slice(0, lineEnd)).replace(/\r$/, "");

  if (!FENCE_OPEN.test(firstLine)) {
    return { frontmatterText: null, body: content, hasBlock: false };
  }

  const rest = lineEnd === -1 ? "" : content.slice(lineEnd + 1);
  const lines = rest.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (FENCE_CLOSE.test(lines[index].replace(/\r$/, ""))) {
      const frontmatterText = lines.slice(0, index).join("\n");
      let body = lines.slice(index + 1).join("\n");
      // Drop exactly one leading newline right after the closing fence.
      if (body.startsWith("\r")) body = body.slice(1);
      if (body.startsWith("\n")) body = body.slice(1);
      return { frontmatterText, body, hasBlock: true };
    }
  }

  return { frontmatterText: null, body: content, hasBlock: false };
}

/**
 * Parse frontmatter text with the `yaml` package.
 * Pure function. Returns `{ value, error }` — exactly one of the two is set.
 * `value` is null when the document is empty/comment-only.
 */
export function parseFrontmatterDoc(frontmatterText) {
  try {
    return { value: parseYaml(frontmatterText), error: null };
  } catch (error) {
    const position = Array.isArray(error?.linePos) && error.linePos[0]
      ? { line: error.linePos[0].line, column: error.linePos[0].col }
      : null;
    return {
      value: null,
      error: {
        message: error?.message ?? String(error),
        ...(position ? { line: position.line, column: position.column } : {})
      }
    };
  }
}

/**
 * Build the normalized `frontmatter` object: `{ name, description, ...extra }`.
 * `name`/`description` are null when absent; values are reported as parsed
 * (no coercion) so later checks see the facts.
 */
export function normalizeFrontmatter(yamlValue) {
  const rest = { ...yamlValue };
  const name = Object.hasOwn(rest, "name") ? rest.name : null;
  const description = Object.hasOwn(rest, "description") ? rest.description : null;
  delete rest.name;
  delete rest.description;

  return { name, description, ...rest };
}

/** Deterministic token estimate. 口径 (documented): `Math.ceil(chars / 4)` —
 * the "≈4 characters per token" rule of thumb, applied to the body's UTF-16
 * code-unit count (the same `content.length` measure v0.1 uses for
 * `contextChars`). It is a crude, stable magnitude estimate for context-size
 * checks, NOT a real tokenizer count; it is deliberately deterministic so the
 * same Skill always yields the same number on every machine. */
export function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}

function countLines(text) {
  if (text === "") {
    return 0;
  }

  return text.split(/\r?\n/).length;
}

/** Walk the skill directory and collect the file inventory plus the
 * references/scripts/assets views (first path segment convention). */
async function collectFileMetadata(root) {
  const rawFiles = await listDirectoryFiles(root);
  const files = rawFiles.map(toPosixPath);
  const inDir = (dirName) => files.filter((file) => file !== SKILL_FILE_NAME && firstSegment(file) === dirName);

  return {
    files,
    references: inDir("references"),
    scripts: inDir("scripts"),
    assets: inDir("assets")
  };
}

/**
 * Parse one skill directory into the normalized object (plan §7):
 *
 * {
 *   root, skillFile, directoryName,
 *   parse: { status, error|null },
 *   frontmatter: { name, description, ...extra } | null,
 *   body,
 *   files, references, scripts, assets,
 *   stats: { lines, chars, estimatedTokens, fileCount }
 * }
 *
 * `frontmatter` is null when there is no usable frontmatter block
 * (missing-skill-file / missing-frontmatter / invalid-yaml). Supporting-file
 * metadata and stats are still collected for every existing directory so the
 * diagnostics engine always gets the full picture.
 *
 * Throws only when `root` itself does not exist — a caller bug, not a skill
 * fact. All skill-level problems are reported via `parse.status`.
 */
export async function parseSkill(rootDir) {
  const root = path.resolve(rootDir);

  if (!(await pathExists(root))) {
    throw new Error(`Skill directory does not exist: ${root}`);
  }

  const directoryName = path.basename(root);
  const fileMetadata = await collectFileMetadata(root);
  const skillFile = path.join(root, SKILL_FILE_NAME);

  if (!(await skillFileExists(root))) {
    return {
      root,
      skillFile: null,
      directoryName,
      parse: { status: "missing-skill-file", error: null },
      frontmatter: null,
      body: null,
      ...fileMetadata,
      stats: {
        lines: 0,
        chars: 0,
        estimatedTokens: 0,
        fileCount: fileMetadata.files.length
      }
    };
  }

  const rawContent = await readFile(skillFile, "utf8");
  const { frontmatterText, body, hasBlock } = splitFrontmatter(rawContent);

  const stats = {
    lines: countLines(body),
    chars: body.length,
    estimatedTokens: estimateTokens(body.length),
    fileCount: fileMetadata.files.length
  };

  if (!hasBlock) {
    return {
      root,
      skillFile,
      directoryName,
      parse: { status: "missing-frontmatter", error: null },
      frontmatter: null,
      body,
      ...fileMetadata,
      stats
    };
  }

  const { value, error } = parseFrontmatterDoc(frontmatterText);

  if (error) {
    return {
      root,
      skillFile,
      directoryName,
      parse: { status: "invalid-yaml", error },
      frontmatter: null,
      body,
      ...fileMetadata,
      stats
    };
  }

  if (value === null || value === undefined) {
    return {
      root,
      skillFile,
      directoryName,
      parse: { status: "empty-frontmatter", error: null },
      frontmatter: {},
      body,
      ...fileMetadata,
      stats
    };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      root,
      skillFile,
      directoryName,
      parse: { status: "frontmatter-not-mapping", error: null },
      frontmatter: {},
      body,
      ...fileMetadata,
      stats
    };
  }

  return {
    root,
    skillFile,
    directoryName,
    parse: { status: "ok", error: null },
    frontmatter: normalizeFrontmatter(value),
    body,
    ...fileMetadata,
    stats
  };
}
