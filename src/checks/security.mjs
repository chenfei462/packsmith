import { readFile } from "node:fs/promises";
import path from "node:path";

import { requireRule, diagnosticFromRule, joinDisplayPath } from "./support.mjs";

/**
 * Security checks (plan §11): PS-SEC-001 … PS-SEC-003.
 *
 * Deterministic pattern scan over the skill's text content — SKILL.md plus
 * the supporting files it ships under scripts/ and references/ (assets are
 * binary and are not scanned). Detected pattern families (plan §11):
 *
 *   PS-SEC-001  sensitive file access (.env, credentials, private keys,
 *               ~/.ssh)
 *   PS-SEC-002  remote shell execution (curl|sh, wget|sh, remote executable
 *               scripts)
 *   PS-SEC-003  destructive shell patterns (rm -rf, sudo)
 *
 * Findings are severity "warning" by design (knowledge-base rules): pattern
 * matches are a human-review signal, not a verdict — a security-reviewer
 * skill legitimately mentions these patterns in prose. One diagnostic per
 * (rule, file) with the matched lines listed in the message.
 */

/** Max matched lines listed per diagnostic; keeps messages bounded. */
const MAX_LISTED_LINES = 5;

const SENSITIVE_FILE_PATTERNS = [
  { label: ".env file reference", pattern: /(^|[^\w.])\.env\b/ },
  { label: "credentials reference", pattern: /\bcredentials?\b/i },
  { label: "private key block", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  { label: "private key file", pattern: /\bid_(rsa|dsa|ecdsa|ed25519)\b/i },
  { label: "~/.ssh reference", pattern: /~[\\/]\.ssh\b|\.ssh[\\/](id_|authorized_keys|known_hosts|config)/ }
];

const REMOTE_SHELL_PATTERNS = [
  { label: "curl piped into a shell", pattern: /\bcurl\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da|fi|k)?sh\b/i },
  { label: "wget piped into a shell", pattern: /\bwget\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da|fi|k)?sh\b/i },
  { label: "process substitution from curl/wget", pattern: /\b(ba)?sh\s*<+\(?\s*(curl|wget)\b/i },
  { label: "shell -c around curl/wget", pattern: /\b(ba)?sh\s+-c\s+["'`]?\$?\(?(curl|wget)\b/i },
  { label: "remote executable script download", pattern: /\b(curl|wget)\b[^\n]*https?:\/\/\S+\.(sh|bash)\b/i }
];

const DESTRUCTIVE_SHELL_PATTERNS = [
  { label: "rm -rf", pattern: /\brm\s+(-{1,2}[a-zA-Z-]*[rR][a-zA-Z-]*[fF]|[fF][a-zA-Z-]*[rR])/ },
  { label: "sudo", pattern: /\bsudo\b/ }
];

function scanText(text, patterns) {
  const matches = [];

  if (typeof text !== "string") {
    return matches;
  }

  const lines = text.split(/\r?\n/);

  for (const { label, pattern } of patterns) {
    const matchedLines = [];
    let total = 0;

    for (let index = 0; index < lines.length; index += 1) {
      if (pattern.test(lines[index])) {
        total += 1;

        if (matchedLines.length < MAX_LISTED_LINES) {
          matchedLines.push(index + 1);
        }
      }
    }

    if (total > 0) {
      matches.push({ label, lines: matchedLines, total });
    }
  }

  return matches;
}

async function readTextFile(absolutePath) {
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    // An unreadable supporting file is not a security finding; the content
    // simply cannot be scanned.
    return null;
  }
}

/**
 * Run the security checks for one parsed skill.
 *
 * `skill`    — parseSkill() output.
 * `context`: { rules, displayDir }
 *
 * Returns an array of diagnostic objects (plan §8). Async: supporting files
 * are read for scanning.
 */
export async function checkSecurity(skill, context) {
  const { rules, displayDir } = context;
  const diagnostics = [];

  // Without a SKILL.md there is no skill content to scan.
  if (typeof skill.rawContent !== "string") {
    return diagnostics;
  }

  const scanUnits = [{ file: joinDisplayPath(displayDir, "SKILL.md"), text: skill.rawContent }];

  // Supporting files ship with the skill and run with the agent's privileges;
  // scan scripts/ and references/ contents too. Sorted for determinism.
  const supportingFiles = [...skill.scripts, ...skill.references].sort();

  for (const relativeFile of supportingFiles) {
    const text = await readTextFile(path.join(skill.root, relativeFile));

    if (text !== null) {
      scanUnits.push({ file: joinDisplayPath(displayDir, relativeFile), text });
    }
  }

  const ruleFamilies = [
    { ruleId: "PS-SEC-001", patterns: SENSITIVE_FILE_PATTERNS },
    { ruleId: "PS-SEC-002", patterns: REMOTE_SHELL_PATTERNS },
    { ruleId: "PS-SEC-003", patterns: DESTRUCTIVE_SHELL_PATTERNS }
  ];

  for (const { ruleId, patterns } of ruleFamilies) {
    const secRule = requireRule(rules, ruleId);

    for (const unit of scanUnits) {
      const matches = scanText(unit.text, patterns);

      if (matches.length === 0) {
        continue;
      }

      const detail = matches
        .map((match) => {
          const listed = match.lines.join(", ");
          const extra = match.total > match.lines.length ? ` (+${match.total - match.lines.length} more)` : "";
          return `${match.label} at line(s) ${listed}${extra}`;
        })
        .join("; ");

      diagnostics.push(
        diagnosticFromRule(secRule, {
          message: `${secRule.message} Matched: ${detail}.`,
          file: unit.file,
          line: matches[0].lines[0]
        })
      );
    }
  }

  return diagnostics;
}
