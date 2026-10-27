"use strict";

import fs from "node:fs";
import path from "node:path";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveLevel(options = {}) {
  const env = process.env.PACKSMITH_LOG_LEVEL ?? "";
  if (env) {
    const normalized = env.trim().toLowerCase();
    if (LEVELS[normalized] !== undefined) return normalized;
  }
  if (options.trace) return "debug";
  if (options.verbose) return "info";
  return "warn";
}

class Logger {
  constructor(options = {}) {
    this.level = resolveLevel(options);
    this.stateDir = options.stateDir ?? null;
    this.logDir = null;
    this.stream = null;
    this._counter = {};
    this._enabled = LEVELS[this.level] <= LEVELS.debug;
  }

  _ensureStream() {
    if (this.stream) return;
    if (!this.stateDir) return;
    try {
      this.logDir = path.join(this.stateDir, "logs");
      fs.mkdirSync(this.logDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.stream = fs.createWriteStream(path.join(this.logDir, `packsmith-${stamp}.log`), { flags: "a" });
    } catch {
      this.stream = null;
    }
  }

  _emit(record) {
    const line = JSON.stringify(record);
    if (this.stream) {
      try { this.stream.write(line + "\n"); } catch { /* best-effort */ }
    }

    // A11y-4: every human-readable log line goes to stderr, never stdout, so a
    // piped stdout stays pure (notably `--json | jq` and CI log capture).
    // Routing is level-independent on purpose: stdout carries only the command
    // result, stderr carries the human log stream.
    console.error(`[${record.level.toUpperCase()}] ${record.msg}`);
  }

  _log(level, msg, extra = {}) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    this._ensureStream();
    this._emit({
      ts: new Date().toISOString(),
      level,
      msg,
      ...extra
    });
  }

  debug(msg, extra) { this._log("debug", msg, extra); }
  info(msg, extra) { this._log("info", msg, extra); }
  warn(msg, extra) { this._log("warn", msg, extra); }
  error(msg, extra) { this._log("error", msg, extra); }

  incr(key, n = 1) {
    this._counter[key] = (this._counter[key] ?? 0) + n;
  }

  counters() {
    return { ...this._counter };
  }

  flush() {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(resolve);
      } else {
        resolve();
      }
    });
  }
}

let _shared = null;

function getLogger() {
  return _shared;
}

function setLogger(logger) {
  _shared = logger;
}

/**
 * Packsmith structured error class for ERR-* messages.
 * Format: "conclusion symbol + reason + fix command", no stack trace in user output.
 *
 * `details` carries the template variables (pack name, checksums, risk level,
 * offending files). `templateKey` selects the ERR template at render time, so
 * the message text can change without touching call sites.
 */
class PacksmithError extends Error {
  constructor(code, message, fix = "") {
    super(message);
    this.name = "PacksmithError";
    this.code = code;
    this.fix = fix;
    this.exitCode = 1;
    this.templateKey = null;
    this.reasonDetails = {};
    this.packName = null;
    this.fixLine = fix;
  }
}

/**
 * Shorten a checksum for human display, matching the §4/§2.2 convention
 * (`sha256-9b1029b01d51…`): keep the algorithm prefix and the first 12
 * characters of the digest. The full value stays available in --json (§2.3).
 */
function shortChecksum(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "unknown";
  }

  const separator = value.indexOf("-");
  const hasPrefix = separator > 0 && separator < value.length - 1;

  if (!hasPrefix) {
    return value.length > 12 ? `${value.slice(0, 12)}…` : value;
  }

  const prefix = value.slice(0, separator + 1);
  const digest = value.slice(separator + 1);

  return digest.length > 12 ? `${prefix}${digest.slice(0, 12)}…` : value;
}

/**
 * ERR-* templates per design-input §4.
 * Shape: conclusion symbol + reason + fix command.
 * Each template: { code, header, reason, fix } where header/reason/fix are
 * functions of the error's `details` (and, for `fix`, the pack name).
 */
const ERR = {
  validate_fail: {
    code: "validate_error",
    header: (details) => `✗ pack invalid: ${details.count ?? 0} errors`,
    reason: (details) => {
      if (!details.errors || details.errors.length === 0) {
        return "  pack validation failed";
      }
      return details.errors.map((e) => `  - ${e}`).join("\n");
    },
    fix: (packName) => `  fix: resolve the issues above, then re-run \`packsmith validate ${packName ?? "<pack-dir>"}\``
  },
  checksum_drift: {
    code: "checksum_mismatch",
    header: (details) => `✗ install blocked: checksum mismatch for ${details.pack ?? "unknown"}`,
    reason: (details) =>
      `  expected ${shortChecksum(details.expected)}, got ${shortChecksum(details.actual)}\n` +
      "  the pack source changed after the registry recorded it",
    fix: () => "  fix: verify the source, then `packsmith registry refresh` and retry"
  },
  risk_denied: {
    code: "risk_denied",
    header: (details) => {
      const risk = details.risk ?? "medium";
      // "High-risk pack" stays in the headline: the existing CLI contract and
      // docs use it, and the parenthetical keeps the §4 sentence shape.
      return risk === "high"
        ? "✗ install blocked: computed risk is high (High-risk pack)"
        : `✗ install blocked: computed risk is ${risk}`;
    },
    reason: (details) => {
      const { reasons } = details;
      return reasons && reasons.length > 0
        ? reasons.map((r) => `  ${r}`).join("\n")
        : "  this install requires explicit opt-in";
    },
    fix: (packName, details) =>
      `  fix: re-run with \`--allow-risk ${details?.risk ?? "medium"}\`, or inspect first: \`packsmith passport ${packName}\``
  },
  target_missing: {
    code: "no_installable_target",
    header: () => "✗ no installable target found",
    reason: (details) => `  detected: ${details.detected ?? "none of the supported agent directories exist"}`,
    fix: (packName) =>
      `  fix: pick one explicitly, e.g. \`packsmith install ${packName} --target codex\`\n  see: packsmith targets`
  },
  registry_unreachable: {
    code: "registry_unreachable",
    header: (details) =>
      `⚠ remote registry unreachable (${details.reason ?? "network error"}), falling back to bundled catalog (${details.count ?? "??"} packs)`,
    reason: () => "",
    fix: () => "  fix: check connectivity, or `packsmith registry refresh` later"
  },
  empty_search: {
    code: "empty_search",
    header: (details) => `no packs match "${details.query ?? ""}"`,
    reason: (details) => {
      const { suggestion } = details;
      return suggestion ? `  did you mean "${suggestion}"?  try: packsmith search ${suggestion}` : "";
    },
    fix: (packName, details) => {
      const featured = details?.featured;
      return featured && featured.length > 0 ? `  featured: ${featured.join(", ")}` : "";
    }
  }
};

/**
 * Build a PacksmithError from an ERR template key.
 *
 * `message` carries the full rendered block (header + reason lines) so that
 * programmatic consumers and `assert.rejects(..., /regex/)` see the same facts
 * the human renderer prints. The lines are re-derived at render time from
 * `reasonDetails`, so the copy can change without touching call sites.
 */
function createPacksmithError(templateKey, details = {}, packName = null) {
  const tpl = ERR[templateKey] ?? ERR.validate_fail;
  const header = typeof tpl.header === "function" ? tpl.header(details) : tpl.header;
  const reason = typeof tpl.reason === "function" ? tpl.reason(details) : "";
  const message = [header, reason].filter((line) => typeof line === "string" && line.length > 0).join("\n");
  const err = new PacksmithError(tpl.code, message);
  err.templateKey = templateKey;
  err.reasonDetails = details;
  err.packName = packName;
  err.fixLine = typeof tpl.fix === "function" ? tpl.fix(packName, details) : (tpl.fix ?? "");
  return err;
}

/**
 * Render a PacksmithError into the exact stderr lines for the §4 template.
 * Returns an array of lines (no stack trace, ever).
 */
function renderPacksmithError(error) {
  const tpl = ERR[error.templateKey] ?? ERR.validate_fail;
  const details = error.reasonDetails ?? {};
  const header = typeof tpl.header === "function" ? tpl.header(details) : tpl.header;
  const reason = typeof tpl.reason === "function" ? tpl.reason(details) : "";
  const fix = error.fixLine ?? (typeof tpl.fix === "function" ? tpl.fix(error.packName, details) : "");

  return [header, reason, fix].filter((line) => typeof line === "string" && line.length > 0);
}

export {
  Logger,
  getLogger,
  setLogger,
  resolveLevel,
  PacksmithError,
  createPacksmithError,
  renderPacksmithError,
  shortChecksum,
  ERR
};
