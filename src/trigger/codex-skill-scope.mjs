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

  // The render is a JSON array whose text fields contain the
  // `<skills_instructions>` block. Parse it to get the decoded text (real
  // newlines, unescaped backslashes); if it is not valid JSON, fall back to
  // the raw text so a plain-text render also works.
  let text = raw;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const parts = [];
      for (const message of parsed) {
        const content = message?.content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
          if (typeof part?.text === "string") parts.push(part.text);
        }
      }
      if (parts.length > 0) text = parts.join("\n");
    }
  } catch {
    // Not valid JSON: use raw text as-is (still searched for the block).
  }

  const blockMatch = text.match(/<skills_instructions>([\s\S]*?)<\/skills_instructions>/);

  if (!blockMatch) {
    // No skills block at all: the runtime offered zero skills.
    return [];
  }

  const block = blockMatch[1];
  const locators = [];
  const unparsedEntries = [];

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();

    // Match two entry formats:
    //   1. bullet:  `- name: description (file: <locator>)`
    //   2. bare:    `(file: <locator>)` on its own line
    const isBullet = trimmed.startsWith("- ") && trimmed.includes("(file:");
    const isBare = trimmed.startsWith("(file: ") && trimmed.endsWith(")");

    if (!isBullet && !isBare) {
      continue;
    }

    // The locator is the LAST parenthesised `(file: …)` group on the line.
    const locatorMatch = trimmed.match(/\(file: (.+)\)\s*$/);

    if (!locatorMatch || locatorMatch[1].trim().length === 0) {
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
  const normalized = locator.replace(/\\+/g, "/").toLowerCase();
  const expectedSuffix = `${workspaceDir.replace(/\\+/g, "/").toLowerCase()}/.agents/skills/${skillName.toLowerCase()}/skill.md`;
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
    .replace(/\t/g, "\\t");
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
