import { spawnSync } from "node:child_process";
import path from "node:path";

import { InfrastructureError } from "../core/diagnostics.mjs";
import { resolveLaunchEntry } from "../runtimes/base.mjs";

/**
 * Codex skill-scope isolation (v0.2 Milestone 7, actual-discovery gate).
 *
 * Real Codex 0.148.0 discovers skills from roots that are NOT governed by
 * HOME/USERPROFILE or CODEX_HOME: the user-level root is resolved from the
 * OS home directory (`dirs::home_dir()` — a Windows known folder, so
 * environment stripping cannot move it), plus bundled/plugin roots. A git
 * boundary therefore stops repository-level scanning but does NOT stop the
 * real user's global `.agents/skills` from being discoverable — a negative
 * run can load and read an unrelated global skill (observed: a completed
 * `Get-Content` of the user's `superpowers/using-superpowers/SKILL.md`).
 *
 * The supported mechanism is the official `skills.config` selector
 * (`SkillsConfig { bundled, include_instructions, config: [SkillConfig] }`,
 * `SkillConfig { path | name, enabled }`, verified against
 * rust-v0.148.0 `codex-rs/config/src/skills_config.rs`): rules are read from
 * the User and SessionFlags layers — so a `-c skills.config=[...]` override
 * applies even under `--ignore-user-config` — and a canonical-document-path
 * selector disables exactly the skills listed.
 *
 * `--ignore-user-config` is NOT usable as isolation: empirically it drops
 * EVERY skill (including the workspace-local skill under test), so it both
 * fails to isolate and breaks the run. `--ephemeral`/`--ignore-rules` are
 * unrelated to skill discovery. This module therefore:
 *
 *   1. AUDITS the skills the CLI would make available, WITHOUT a model, via
 *      `codex debug prompt-input` (renders the model-visible prompt input,
 *      whose `<skills_instructions>` block lists every available skill with
 *      its canonical `(file: …/SKILL.md)` locator);
 *   2. builds a `skills.config` list disabling every available skill EXCEPT
 *      the one under test (matched by canonical path);
 *   3. verifies the scoped view actually contains the target and no other
 *      skill, and reports the outcome.
 *
 * Everything here is offline and model-free. When the audit cannot run, or
 * the scoped view still contains a non-target skill, the caller gets an
 * infrastructure error — the run never claims isolation it could not
 * establish, and never fakes a walker.
 */

/** Locator pattern in the `<skills_instructions>` block: `(file: …/SKILL.md)`. */
/**
 * Parse every distinct canonical SKILL.md locator out of a prompt-input
 * render. The render contains a `<skills_instructions>` block in which
 * each available skill is listed as a bullet with a `(file: <path>)`
 * locator. A path may legally contain parentheses (e.g.
 * `/fixture/global/collection(with-parentheses)/other-skill/SKILL.md`),
 * so the block is extracted first and each bullet line is matched for its
 * trailing `(file: …)` group — never `[^)]`, which truncates at the first
 * inner parenthesis. Any bullet that LOOKS like a skill entry but does not
 * produce a parseable absolute locator is fail-closed: an unparsed entry
 * could be a skill that scoping then misses.
 *
 * Pure. Throws InfrastructureError on fail-closed conditions.
 */
export function parseAvailableSkillLocators(promptInputJson) {
  const raw = String(promptInputJson ?? "");

  // STRICT JSON parsing: the render MUST be a JSON array. A malformed
  // render is an infrastructure error — falling back to raw-text scanning
  // would let fabricated locators from non-developer content contaminate
  // the scope.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new InfrastructureError("skill audit render is not valid JSON; refusing to scope");
  }

  if (!Array.isArray(parsed)) {
    throw new InfrastructureError("skill audit render must be a JSON array of messages");
  }

  // Only developer-role input_text fields are trusted. Collect ALL
  // skills_instructions blocks from every developer message — there may be
  // multiple trusted blocks in one render.
  const blocks = [];

  for (const message of parsed) {
    if (message?.role !== "developer") continue;
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type !== "input_text" || typeof part?.text !== "string") continue;
      // Strict tag-pairing state machine: walk the text and enforce that
      // open/close tags strictly alternate with no nesting. This catches
      // open-target → open-inner → close-inner → close-foreign sequences
      // where a naive openCount === closeCount check would pass but the
      // foreign block is inside the inner one and gets silently dropped.
      const tagPattern = /<\/?skills_instructions>/g;
      let inside = false;
      let blockStart = -1;
      let match;
      while ((match = tagPattern.exec(part.text)) !== null) {
        if (!inside && match[0] === "<skills_instructions>") {
          inside = true;
          blockStart = match.index + match[0].length;
        } else if (inside && match[0] === "</skills_instructions>") {
          blocks.push(part.text.slice(blockStart, match.index));
          inside = false;
        } else {
          throw new InfrastructureError(
            inside
              ? "skill audit render contains a nested <skills_instructions> tag; nesting is not allowed"
              : "skill audit render contains a stray </skills_instructions> close tag without a matching open tag"
          );
        }
      }
      if (inside) {
        throw new InfrastructureError(
          "skill audit render contains an unclosed <skills_instructions> tag; refusing to scope"
        );
      }
    }
  }

  if (blocks.length === 0) {
    // No skills block at all: the runtime offered zero skills.
    return [];
  }

  const locators = [];
  const unparsedEntries = [];

  for (const block of blocks) {
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();

      // A bullet mentioning SKILL.md without a `(file:` locator is
      // suspicious and must fail closed — it could be a skill entry whose
      // locator was stripped or corrupted.
      if (trimmed.startsWith("- ") && trimmed.includes("SKILL.md") && !trimmed.includes("(file:")) {
        unparsedEntries.push(trimmed);
        continue;
      }

      // ANY line containing a `(file:` marker is a skill entry candidate.
      // Lines without the marker are not entries and are silently ignored.
      // A candidate is only valid when it is either a bullet entry
      // (`- name: … (file: …)`) or a bare `(file: …)` line. Any other
      // format containing a `(file:` marker is fail-closed — it could be
      // a skill entry in an unknown format that scoping then misses.
      if (!trimmed.includes("(file:")) {
        continue;
      }

      const isBullet = trimmed.startsWith("- ");
      const isBare = trimmed.startsWith("(file: ") && trimmed.endsWith(")");

      if (!isBullet && !isBare) {
        unparsedEntries.push(trimmed);
        continue;
      }

      // The locator is the LAST parenthesised `(file: …)` group on the line.
      const locatorMatch = trimmed.match(/\(file: (.+)\)\s*$/);

      if (!locatorMatch || locatorMatch[1].trim().length === 0) {
        // Includes: bare `(file: /path` with no closing `)`, malformed
        // non-bullet lines with `(file:` but no closing group, etc.
        unparsedEntries.push(trimmed);
        continue;
      }

      const locator = locatorMatch[1].trim().replace(/\\+/g, "/");

      if (!locator.startsWith("/") && !/^[A-Za-z]:\//.test(locator)) {
        unparsedEntries.push(trimmed);
        continue;
      }

      locators.push(locator);
    }
  }

  if (unparsedEntries.length > 0) {
    throw new InfrastructureError(
      `skill audit found ${unparsedEntries.length} unparseable skill entry/entries; refusing to scope (fail-closed): ${unparsedEntries[0].slice(0, 200)}`
    );
  }

  return [...new Set(locators)].sort();
}

/** True when `locator` names the skill under test (its SKILL.md path is
 * inside `<workspace>/.agents/skills/<name>/`). Case-insensitive on Windows
 * path semantics; compared on normalized separators. */
export function isTargetSkillLocator(locator, { workspaceDir, skillName }) {
  const normalized = locator.replace(/\\+/g, "/");
  const expectedSuffix = `${workspaceDir.replace(/\\+/g, "/")}/.agents/skills/${skillName}/SKILL.md`;
  // Windows/conda file systems are case-insensitive; Linux/macOS are not.
  if (process.platform === "win32") {
    return normalized.toLowerCase() === expectedSuffix.toLowerCase();
  }
  return normalized === expectedSuffix;
}

/**
 * Escape a path for use inside a TOML basic string (double-quoted).
 * TOML basic strings support backslash escapes; a literal backslash must be
 * doubled, a double quote must be escaped, and control characters use
 * \uXXXX form. Single quotes do NOT need escaping in basic strings.
 */
function tomlEscapeString(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\x08/g, "\\b")
    .replace(/\x0C/g, "\\f")
    // Control characters U+0000–U+001F (excluding already-escaped \n \r \t
    // \b \f, which were handled above as their literal codepoints) plus
    // U+007F (DEL) must use \uXXXX form per TOML spec.
    .replace(/[\x00-\x07\x0B\x0E-\x1F\x7F]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Build the `-c skills.config=…` TOML value disabling every non-target
 * skill by canonical path. Uses TOML basic strings (double-quoted) with
 * proper escaping so paths containing apostrophes, quotes or backslashes
 * produce valid TOML. Pure. `targetLocator` (the skill under test) is
 * never disabled; if it is absent from `locators` the caller must treat
 * that as a failure (the run cannot prove the target is available).
 */
export function buildSkillScopeConfigValue(locators, targetLocator) {
  const entries = locators
    .filter((locator) => locator !== targetLocator)
    .map((locator) => `{path="${tomlEscapeString(locator)}",enabled=false}`);

  return `[${entries.join(",")}]`;
}

async function runPromptInputAudit({ binaryPath, binaryArgs, workspaceDir, extraArgs, env, timeoutMs }) {
  // Resolve the binary the same way the live adapter does: a Windows .cmd
  // shim cannot be spawned directly, so it is resolved to its real node/exe
  // entry (no shell interpolation).
  const entry = await resolveLaunchEntry({
    workspaceDir,
    binaryPath,
    binaryArgs
  });

  const result = spawnSync(entry.command, [...entry.args, "debug", "prompt-input", ...extraArgs, "t"], {
    cwd: workspaceDir,
    env,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.error) {
    throw new InfrastructureError(`codex skill audit could not run (${binaryPath}): ${result.error.message}`, {
      cause: result.error
    });
  }

  if (result.status !== 0) {
    throw new InfrastructureError(`codex skill audit exited ${result.status}: ${String(result.stderr ?? "").slice(0, 300)}`);
  }

  return String(result.stdout ?? "");
}

/**
 * Audit the CLI's available skills and produce a scoped trigger context
 * fragment. Returns:
 *
 *   {
 *     ok: true,
 *     scopeConfigValue,        // the -c value disabling every non-target skill
 *     availableSkills,         // count seen before scoping
 *     scopedSkills,            // count remaining after scoping
 *     targetLocator,           // canonical path of the skill under test
 *     notes: []                // human-readable provenance
 *   }
 *
 * Throws InfrastructureError when the target skill is not discoverable in
 * the isolated workspace, or when the scoped view still lists a non-target
 * skill (isolation could not be established).
 */
export async function establishCodexSkillScope({
  workspaceDir,
  skillName,
  binaryPath,
  binaryArgs,
  env,
  timeoutMs = 120000
}) {
  const audit = (extraArgs) =>
    runPromptInputAudit({ binaryPath, binaryArgs, workspaceDir, extraArgs, env, timeoutMs });

  const baseline = await audit([]);
  const available = parseAvailableSkillLocators(baseline);
  const targetLocator = available.find((locator) => isTargetSkillLocator(locator, { workspaceDir, skillName }));

  if (targetLocator === undefined) {
    throw new InfrastructureError(
      `the skill under test (${skillName}) is not among the ${available.length} skills the runtime reports as available in ${workspaceDir}; refusing to run`
    );
  }

  const scopeConfigValue = buildSkillScopeConfigValue(available, targetLocator);
  const scoped = await audit(["-c", `skills.config=${scopeConfigValue}`]);
  const scopedLocators = parseAvailableSkillLocators(scoped);
  const nonTarget = scopedLocators.filter((locator) => locator !== targetLocator);

  if (!scopedLocators.some((locator) => locator === targetLocator)) {
    throw new InfrastructureError(
      `skill scoping removed the skill under test (${skillName}); refusing to run`
    );
  }

  if (nonTarget.length > 0) {
    throw new InfrastructureError(
      `skill scoping left ${nonTarget.length} non-target skill(s) available (e.g. ${nonTarget[0]}); isolation could not be established`
    );
  }

  return {
    ok: true,
    scopeConfigValue,
    availableSkills: available.length,
    scopedSkills: scopedLocators.length,
    targetLocator,
    notes: [
      `codex skill scope: ${available.length} available -> ${scopedLocators.length} scoped (target ${skillName})`,
      "mechanism: official skills.config path selectors (rust-v0.148.0 codex-rs/config/src/skills_config.rs); --ignore-user-config is NOT used (it drops every skill)"
    ]
  };
}

/**
 * Merge a scoped `skills.config` override into an isolation flag list.
 * Pure. The override is placed as `-c skills.config=…` immediately before
 * the protocol flags so Codex's SessionFlags layer sees it.
 */
export function withSkillScopeFlags(flags, scopeConfigValue) {
  return ["-c", `skills.config=${scopeConfigValue}`, ...flags];
}
