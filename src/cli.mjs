#!/usr/bin/env node

import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  auditInstalledPacks,
  buildPack,
  doctorPack,
  initPack,
  inspectPack,
  installBundle,
  installPack,
  listInstalledPacks,
  previewInstallPlan,
  preparePublish,
  pinInstalledPack,
  removeInstalledPack,
  syncInstalledPacks,
  updateInstalledPacks,
  validatePolicy,
  validatePack
} from "./lib/pack.mjs";

import { getLogger, Logger, PacksmithError, renderPacksmithError, setLogger, shortChecksum } from "./lib/log.mjs";
import {
  addRegistry,
  findRegistryPack,
  listRegistries,
  refreshRegistries,
  searchRegistry,
  useRegistry,
  validateRegistry
} from "./lib/registry.mjs";

import { defaultInstallRoot, defaultStateDir, TARGET_ADAPTERS } from "./lib/targets.mjs";

import { runDoctor } from "./doctor.mjs";
import { renderDoctorTerminal } from "./reporters/terminal.mjs";
import { renderDoctorJson } from "./reporters/json.mjs";

/**
 * Exit-code taxonomy (docs/specification.md#退出码):
 *   0  success
 *   1  runtime fatal error or --ci gate failure
 *   2  usage / argument error
 *   3  reserved
 *   4  internal / unexpected error
 */
class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
  }
}

/**
 * Flag whitelists per subcommand (#8). Any flag not in the list is rejected.
 * "registry" flag is global (available for search, show, info, preview, install).
 */
const COMMAND_FLAGS = {
  init:      ["dryRun", "json", "quiet", "yes", "pin", "allowRisk", "stateDir"],
  validate:  ["json", "quiet", "allowRisk"],
  inspect:   ["json", "quiet"],
  doctor:    ["json", "quiet", "format", "target"],
  score:     ["json", "quiet", "registry", "scope", "stateDir"],
  passport:  ["json", "quiet", "registry", "scope", "stateDir"],
  targets:   ["json", "quiet"],
  build:     ["json", "quiet", "out", "allowRisk"],
  install:   ["json", "quiet", "target", "registry", "dest", "dryRun", "yes", "pin", "allowRisk", "allowScripts", "policy", "scope", "stateDir"],
  preview:   ["json", "quiet", "target", "registry", "allTargets", "scope", "stateDir"],
  list:      ["json", "quiet", "stateDir"],
  remove:    ["json", "quiet", "stateDir"],
  pin:       ["json", "quiet", "stateDir"],
  update:    ["json", "quiet", "allowRisk", "stateDir"],
  sync:      ["json", "quiet", "policy", "allowRisk", "stateDir"],
  search:    ["json", "quiet", "registry", "stateDir"],
  show:      ["json", "quiet", "registry", "scope", "stateDir"],
  info:      ["json", "quiet", "registry", "scope", "stateDir"],
  publish:   ["json", "quiet", "dryRun"],
  registry:  ["json", "quiet", "registry", "qualityGate", "stateDir"],
  policy:    ["json", "quiet"],
  audit:     ["json", "quiet", "policy", "ci", "verbose", "stateDir"]
};

const BOOLEAN_FLAGS = new Set(["--dry-run", "--ci", "--json", "--quiet", "--yes", "--pin", "--verbose", "--trace", "--all-targets"]);

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function writeOutput(options, printer) {
  if (options.quiet && !options.json) {
    return;
  }
  printer();
}

function printHelp() {
  console.log(`Packsmith

The package manager for AI agent workflows.

Quick start:
  packsmith search <query>          find a pack
  packsmith passport <pack>         judge it before install
  packsmith install <pack> --yes    install after preview

Run \`packsmith\` for the interactive menu.

Usage:
  packsmith
  packsmith search <query> [--registry <catalog>]
  packsmith show <pack> [--registry <catalog>]
  packsmith preview <pack> [--target <name>] [--json]
  packsmith preview <pack> --all-targets [--json]
  packsmith passport <pack> [--json]
  packsmith install plan <pack> [--target <name>] [--json]
  packsmith install <pack-id> [--target <name>] [--registry <catalog>] [--dry-run] [--yes]
  packsmith score <pack> [--json]
  packsmith list
  packsmith remove <pack>
  packsmith pin <pack>
  packsmith targets [--json]

Authoring:
  packsmith init <pack-dir>
  packsmith validate <pack-dir>
  packsmith inspect <pack-dir>
  packsmith doctor <path> [--target <runtime>] [--format json]
  packsmith build <pack-dir> [--out dist]
  packsmith install <pack-or-built-dir> [--target <name>] [--dest <dir>] [--dry-run]
  packsmith publish <pack-dir> --dry-run
  packsmith registry list|add|use|refresh|validate [--registry <catalog>]
  packsmith update [pack]
  packsmith sync [--policy <file>]
  packsmith policy validate <policy-file>
  packsmith audit [--policy <file>] [--ci]

Examples:
  packsmith                     # interactive browser
  packsmith search review
  packsmith passport senior-code-reviewer
  packsmith preview senior-code-reviewer
  packsmith score senior-code-reviewer
  packsmith install senior-code-reviewer --target codex --yes
  packsmith audit --ci
  npm install -g @packsmith/cli # after npm publication

Installed packs:
  Default state: ${process.env.PACKSMITH_HOME ?? "~/.packsmith"}
  Default targets: ~/.claude/skills, ~/.codex/skills, .github/skills, ~/.copilot/skills, ~/.opencode/skills, ~/.cursor/rules/packsmith, .trae/skills, .traecli/skills, ~/.trae-cn/skills

Options:
  --allow-risk <level>  Allow risk level (low|medium|high). Default: medium.
                        Script-containing packs require medium or higher (or --allow-scripts).
  --policy <file>       Skip remote registry confirmation and use local policy.
                        Requires previewing the plan first.
  --yes                 Bypass remote registry confirmation (only when no --policy).
  --allow-scripts       Explicitly allow script-containing packs without --allow-risk.

More help:
  README: https://github.com/chenfei462/packsmith
  Authoring: packsmith init my-pack
`);
}

function parseOptions(args, command = null) {
  const positionals = [];
  const options = {};
  const flagNames = new Set();

  const allowedFlags = command ? COMMAND_FLAGS[command] : null;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--") {
      // "--" terminator: everything after is a positional argument (#41)
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (BOOLEAN_FLAGS.has(value)) {
      const name = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (allowedFlags && !allowedFlags.includes(name)) {
        throw new UsageError(`Unknown flag --${name.replace(/([A-Z])/g, "-$1").toLowerCase()} for command '${command}'.`);
      }
      flagNames.add(name);
      options[name] = true;
      continue;
    }

    if (value.startsWith("--")) {
      const raw = value.slice(2);

      // --flag=value form (#41)
      const eqIndex = raw.indexOf("=");
      let name;
      let inlineValue;

      if (eqIndex !== -1) {
        name = raw.slice(0, eqIndex).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        inlineValue = raw.slice(eqIndex + 1);
      } else {
        name = raw.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        inlineValue = null;
      }

      if (allowedFlags && !allowedFlags.includes(name)) {
        throw new UsageError(`Unknown flag --${name.replace(/([A-Z])/g, "-$1").toLowerCase()} for command '${command}'.`);
      }

      if (inlineValue !== null) {
        flagNames.add(name);
        options[name] = inlineValue;
        continue;
      }

      const nextValue = args[index + 1];

      if (!nextValue || nextValue.startsWith("--")) {
        throw new UsageError(`Missing value for ${value}.`);
      }

      flagNames.add(name);
      options[name] = nextValue;
      index += 1;
      continue;
    }

    positionals.push(value);
  }

  return { positionals, options, flagNames };
}

function stateOptions(options) {
  return {
    stateDir: options.stateDir ?? options.home,
    registry: options.registry,
    target: options.target,
    scope: options.scope,
    cwd: process.cwd(),
    dest: options.dest,
    dryRun: options.dryRun,
    yes: options.yes,
    allowRisk: options.allowRisk,
    allowScripts: options.allowScripts,
    pin: options.pin,
    outDir: options.out,
    ci: options.ci,
    policy: options.policy,
    json: options.json,
    quiet: options.quiet,
    verbose: options.verbose,
    ...(input.isTTY && output.isTTY ? { confirmInstall: confirmInstallInteractively } : {}),
    selectTargets: selectTargetsInteractively
  };
}

async function selectTargetsInteractively(targets) {
  if (!input.isTTY || !output.isTTY) {
    return targets;
  }

  console.log("Multiple agent targets were detected:");

  targets.forEach((target, index) => {
    const label = target === "claude-code" ? "Claude Code" : target === "codex" ? "Codex" : target;
    console.log(`  ${index + 1}. ${label}`);
  });

  const rl = createInterface({ input, output });
  const answer = await rl.question("Install to which target? Press Enter for all, or type a number: ");
  rl.close();

  const trimmed = answer.trim();

  if (!trimmed) {
    return targets;
  }

  const selectedIndex = Number.parseInt(trimmed, 10) - 1;

  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= targets.length) {
    throw new UsageError("Invalid target selection.");
  }

  return [targets[selectedIndex]];
}

async function confirmInstallInteractively(plan) {
  if (!input.isTTY || !output.isTTY) {
    return false;
  }

  printInstallPlan(plan);
  const rl = createInterface({ input, output });
  const answer = await rl.question("Install this remote registry pack? [y/N]: ");
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function formatTargetLabel(target) {
  return target === "claude-code"
    ? "Claude Code"
    : target === "codex"
      ? "Codex"
      : target === "github-copilot"
        ? "GitHub Copilot"
        : target === "opencode"
          ? "OpenCode"
          : target === "cursor"
            ? "Cursor"
            : target === "trae"
              ? "TRAE"
            : target;
}

function formatPermissionSummary(permissions = {}) {
  const names = ["shell", "filesystem", "network", "browser"];
  return names.map((name) => `${name} ${permissions[name] ?? "none"}`).join(", ");
}

function formatList(values = []) {
  return values.length > 0 ? values.join(", ") : "none";
}

function declaredRiskFromPlan(plan) {
  const declared = plan.risk.reasons.find((reason) => reason.startsWith("registry declares "))?.match(/^registry declares (.+) risk$/);
  return declared?.[1] ?? plan.pack.riskLevel ?? "unknown";
}

function explainRiskPosture(declared, computed, reasons = []) {
  const postureReasons = reasons.filter((reason) => !reason.startsWith("registry declares "));
  const reasonText = postureReasons.length > 0 ? ` because ${postureReasons.join(", ")}` : "";

  if (declared === computed) {
    return `declared ${declared}; computed install risk remains ${computed}${reasonText}`;
  }

  return `declared ${declared}; elevated to ${computed}${reasonText}`;
}

function riskPostureFromPlan(plan) {
  const declared = declaredRiskFromPlan(plan);
  const computed = plan.risk.level;

  return {
    declared,
    computed,
    explanation: explainRiskPosture(declared, computed, plan.risk.reasons),
    reasons: plan.risk.reasons
  };
}

function formatTargetInstallLine(result) {
  const label = formatTargetLabel(result.target);
  const status = result.dryRun ? "would install" : "installed";
  return `- ${label}: ${status} -> ${result.installDir}`;
}

function formatSkippedTargetLine(result) {
  return `- ${result.name}: ${result.reason}`;
}

function formatAgentPrompt(manifest) {
  const text = `${manifest.name} ${manifest.description ?? ""}`.toLowerCase();

  if (/\breview|reviewer|code-review\b/.test(text)) {
    return `Use ${manifest.name} to review my current changes`;
  }

  return `Use ${manifest.name} when this task matches its workflow`;
}

function printInstallPlan(plan, options = {}) {
  const heading = options.heading ?? "Dry run";

  console.log(`${heading} for ${plan.pack.id}`);
  console.log(`Install plan for ${plan.pack.id}@${plan.pack.version}`);

  // Typosquatting advisory (security-input.md §3 item 6): shown before every
  // other section so it is impossible to miss in preview output.
  for (const match of plan.typosquatting ?? []) {
    console.log("");
    console.log(
      `WARNING: 疑似 typosquatting: "${plan.pack.id}" is ${match.distance} edit(s) from installed/official pack "${match.name}" (edit distance ${match.distance}). ` +
        "Verify the exact pack name and publisher before installing."
    );
  }

  console.log("");
  console.log("Trust:");
  console.log(`- Publisher: ${plan.provenance.publisher}`);
  console.log(`- Verified: ${plan.provenance.verified ? "yes" : "no"}`);
  console.log(`- Source: ${plan.provenance.source}`);
  if (plan.provenance.sourceChecksum) {
    console.log(`- Source checksum: ${plan.provenance.sourceChecksum}`);
  }
  console.log(`- Checksum: ${plan.provenance.checksum}`);
  console.log(`- Checksum status: ${plan.provenance.checksumStatus}`);
  console.log(`- Risk: ${plan.risk.level}`);
  console.log("");
  console.log("Context:");
  console.log(`- Estimated size: ${plan.context.estimatedChars} chars`);
  console.log(`- Token pressure: ${plan.context.tokenPressure}`);
  console.log("");
  console.log("Permissions:");

  for (const [name, value] of Object.entries(plan.permissions)) {
    console.log(`- ${name}: ${value}`);
  }

  console.log("");
  console.log("Assets:");
  console.log(`- Scripts: ${plan.assets.hasScripts ? "yes" : "no"}`);
  console.log(`- Binaries: ${plan.assets.hasBinaries ? "yes" : "no"}`);
  console.log(`- Executables: ${plan.assets.hasExecutables ? "yes" : "no"}`);
  console.log("");
  console.log("Writes:");

  for (const target of plan.targets) {
    console.log(`- ${target.name} (${target.scope}) -> ${target.installDir}`);

    for (const writePath of target.writes) {
      console.log(`  - ${writePath}`);
    }
  }

  if (plan.risk.reasons.length > 0) {
    console.log("");
    console.log("Risk reasons:");

    for (const reason of plan.risk.reasons) {
      console.log(`- ${reason}`);
    }
  }
}

function printInstallResult(result) {
  const verb = result.dryRun ? "Dry run for" : "Installed";

  console.log(`${verb} ${result.manifest.name}`);
  console.log("");
  console.log("Targets:");

  for (const installed of result.installed) {
    console.log(formatTargetInstallLine(installed));
  }

  for (const skipped of result.skipped) {
    console.log(formatSkippedTargetLine(skipped));
  }

  console.log("");
  console.log("Next:");

  if (result.dryRun) {
    console.log("- Re-run without --dry-run to install.");
  } else {
    console.log("- Run your agent in this repo or home workspace.");
    for (const installed of result.installed) {
      console.log(`- Ask ${formatTargetLabel(installed.target)}: ${formatAgentPrompt(result.manifest)}.`);
    }
  }
}

function printListResult(result) {
  if (result.installed.length === 0) {
    console.log(`No packs installed. State directory: ${result.stateDir}`);
    return;
  }

  console.log("Installed packs:");

  for (const entry of result.installed) {
    const trust = entry.verified ? "verified" : "unverified";
    console.log(`- ${entry.pack}@${entry.version} (${entry.target}, ${trust}) -> ${entry.installDir}`);
  }
}

function printSearchResult(result) {
  if (result.results.length === 0) {
    console.log(`No packs found for that query in ${result.catalog.path}.`);
    console.log("");
    console.log("Try:");
    console.log("  packsmith search review");
    console.log("  packsmith search docs");
    console.log("  packsmith registry validate");
    return;
  }

  console.log(`Found ${result.results.length} pack(s):`);

  for (const pack of result.results) {
    const trust = pack.verified ? "verified" : "unverified";
    const proof = `stars: ${pack.stars ?? 0}, installs: ${pack.installCount ?? 0}`;
    const category = pack.category ? ` ${pack.category}` : "";
    console.log(`- ${pack.id}@${pack.version}${category} [${trust}; ${proof}] ${pack.description}`);
  }
}

function printShowResult(result, options = {}) {
  const pack = result.entry;
  const posture = options.riskPosture;
  const previewError = options.previewError;

  console.log(`${pack.name ?? pack.id} (${pack.id})`);
  console.log(`Version: ${pack.version}`);
  console.log(`Description: ${pack.description}`);
  console.log(`Category: ${pack.category ?? "uncategorized"}`);
  console.log(`Targets: ${(pack.targets ?? []).join(", ")}`);
  console.log(`Author: ${pack.author ?? "unknown"}`);
  console.log(`License: ${pack.license ?? "not specified"}`);
  if (posture) {
    console.log(`Declared risk: ${posture.declared}`);
    console.log(`Computed install risk: ${posture.computed}`);
    console.log(`Risk explanation: ${posture.explanation}`);
  } else if (previewError) {
    console.log(`Risk: computation unavailable — ${previewError.message}`);
  } else {
    console.log(`Risk: ${pack.riskLevel ?? "unknown"}`);
  }
  console.log(`Estimated context: ${pack.estimatedContextSize ?? "unknown"} chars`);
  console.log(`Verified: ${pack.verified ? "yes" : "no"}`);
  console.log(`Source: ${pack.source ?? "not specified"}`);
  console.log(`Repository: ${pack.repository ?? pack.source ?? "not specified"}`);
  console.log(`Tags: ${(pack.tags ?? []).join(", ") || "none"}`);
  console.log(`Example: ${pack.usageExample ?? `packsmith install ${pack.id}`}`);
  console.log(`Updated: ${pack.updatedAt ?? "unknown"}`);
  console.log(`Stars: ${pack.stars ?? 0}`);
  console.log(`Installs: ${pack.installCount ?? 0}`);
}

function printAuditResult(result) {
  if (result.results.length === 0) {
    console.log(`No installed packs found. State directory: ${result.stateDir}`);
    return;
  }

  console.log("Packsmith Audit");
  if (result.policy) {
    console.log(`Allowed required permissions: ${formatList(result.policy.allowedRequiredPermissions)}`);
  }

  for (const item of result.results) {
    console.log("");
    console.log(`${item.pack}@${item.version} (${item.target})`);
    console.log(`- Status: ${item.status}`);
    console.log(`- Source: ${item.source ?? "unknown"}`);
    console.log(`- Registry: ${item.registry ?? "none"}`);
    console.log(`- Publisher: ${item.publisher ?? "unknown"}`);
    console.log(`- Verified: ${item.verified ? "yes" : "no"}`);
    console.log(`- Checksum: ${item.currentChecksum ?? "missing"}`);

    if (item.update?.status === "available") {
      console.log(`- Update: available ${item.update.version}`);
    } else if (item.update?.status === "current") {
      console.log("- Update: current");
    } else {
      console.log(`- Update: ${item.update?.status ?? "not checked"}`);
    }

    if (item.issues.length > 0) {
      console.log(`- Issues: ${item.issues.join(", ")}`);
    }

    if (item.policyIssues.length > 0) {
      console.log(`- Policy: ${item.policyIssues.join(", ")}`);
    }

    const permissions = Object.entries(item.permissions);

    if (permissions.length > 0) {
      console.log(`- Permissions: ${permissions.map(([name, value]) => `${name}: ${value}`).join(", ")}`);
    }
  }
}

function printSyncResult(result) {
  if (result.synced.length === 0) {
    console.log(`No installed packs to sync. State directory: ${result.stateDir}`);
    return;
  }

  console.log("Sync results:");

  for (const item of result.synced) {
    console.log(`- ${item.pack} (${item.target}): ${item.status}`);
  }

  if (result.audit) {
    const policyIssues = result.audit.results.flatMap((item) =>
      item.policyIssues.map((issue) => ({
        pack: item.pack,
        target: item.target,
        issue
      }))
    );

    if (policyIssues.length === 0) {
      console.log("");
      console.log("Policy: ok");
    } else {
      console.log("");
      console.log("Policy violations:");

      for (const item of policyIssues) {
        console.log(`- ${item.pack} (${item.target}): ${item.issue}`);
      }
    }
  }
}

function printRegistryValidationResult(result) {
  if (result.valid) {
    console.log(`Registry valid: ${result.catalog.packs.length} pack(s) checked in ${result.catalog.path}.`);
    return;
  }

  console.log(`Registry invalid: ${result.catalog.path}`);

  for (const issue of result.issues) {
    console.log(`- ${issue}`);
  }
}

function printRegistryRefreshResult(result) {
  console.log("Registry refresh:");

  for (const item of result.refreshed) {
    const detail =
      item.status === "cached"
        ? ` -> ${item.cachePath}`
        : item.status === "error"
          ? ` (${item.message})`
          : item.path
            ? ` -> ${item.path}`
            : "";
    console.log(`- ${item.name}: ${item.status}${detail}`);
  }
}

function printPolicyValidationResult(result) {
  if (result.valid) {
    console.log(`Policy valid: ${result.path}.`);
    console.log(`Allowed required permissions: ${formatList(result.policy.allowedRequiredPermissions)}`);
    console.log("Required permissions outside this set are blocked before install and during audit.");
    return;
  }

  console.log(`Policy invalid: ${result.path}`);

  for (const issue of result.issues) {
    console.log(`- ${issue}`);
  }
}

function printPublishResult(result) {
  console.log(`Publish dry run: ${result.manifest.name}@${result.manifest.version}`);
  console.log(`Pack: ${result.packDir}`);
  console.log(`Size: ${result.packSize} bytes`);
  console.log(`Targets: ${result.manifest.targets.join(", ")}`);
  console.log(`Doctor warnings: ${result.doctor.quality.warnings.length}`);
  console.log("");
  console.log("Registry entry preview:");
  console.log(JSON.stringify(result.registryEntry, null, 2));
  console.log("");
  console.log("Next:");
  console.log("- Add the registry entry to registry/catalog.json or submit it in a PR.");
  console.log("- Run: packsmith registry validate");
  console.log("- Real remote publishing is not performed by this dry run.");
}

function resolveScorePack(inputValue, options = {}) {
  return (async () => {
    const { pathExists } = await import("./lib/fs-utils.mjs");
    const localPath = path.resolve(inputValue);

    if (await pathExists(localPath)) {
      return {
        packDir: localPath,
        source: "local"
      };
    }

    const registryResult = await findRegistryPack(inputValue, { registry: options.registry });
    const source = registryResult.entry.source;

    if (typeof source !== "string" || /^https?:\/\//i.test(source)) {
      throw new Error(`Pack "${inputValue}" cannot be scored from a remote source yet. Refresh or install a local registry source first.`);
    }

    const packDir = path.isAbsolute(source) ? source : path.resolve(path.dirname(registryResult.catalog.path), source);

    if (!(await pathExists(packDir))) {
      throw new Error(`Pack "${inputValue}" source not found: ${packDir}.`);
    }

    return {
      packDir,
      source: "registry"
    };
  })();
}

function buildScoreSummary(result, source) {
  return {
    pack: result.name,
    version: result.version,
    source,
    overall: result.score.overall,
    dimensions: Object.fromEntries(Object.entries(result.score.dimensions).map(([name, dimension]) => [name, dimension.score])),
    fixes: result.score.fixes,
    context: {
      totalChars: result.context.totalChars,
      tokenPressure: result.context.tokenPressure
    },
    portability: {
      score: result.portability.score,
      targets: result.portability.targets.map((target) => ({
        id: target.target,
        name: target.name,
        status: target.status
      }))
    }
  };
}

function printScoreResult(summary) {
  const targetNames = summary.portability.targets
    .map((target) => (target.status === "ok" ? target.name : `${target.name} (${target.status})`))
    .join(", ");

  console.log(`Packsmith Score: ${summary.pack}`);
  console.log("");
  console.log(`Overall: ${summary.overall}/100`);
  console.log(`Context: ${summary.context.totalChars} chars, ${summary.context.tokenPressure} pressure`);
  console.log(`Portability: ${targetNames || "none"}`);

  if (summary.fixes.length > 0) {
    console.log("");
    console.log("Recommended fixes:");

    for (const fix of summary.fixes) {
      console.log(`- ${fix}`);
    }
  }
}

function supportedPreviewTargetIds() {
  return TARGET_ADAPTERS.filter((adapter) => adapter.status === "supported").map((adapter) => adapter.id);
}

function buildTargetSummary(targets) {
  const readyTargets = targets.filter((target) => target.status === "preview-ready");
  const notReadyTargets = targets.filter((target) => target.status !== "preview-ready");

  return {
    total: targets.length,
    ready: readyTargets.length,
    notReady: notReadyTargets.length,
    readyTargets: readyTargets.map((target) => target.id),
    notReadyTargets: notReadyTargets.map((target) => target.id)
  };
}

async function buildAllTargetPreview(inputValue, options = {}) {
  const targets = [];

  for (const target of supportedPreviewTargetIds()) {
    try {
      const plan = await previewInstallPlan(inputValue, { ...options, target });
      const targetPlan = plan.targets.find((item) => item.target === target) ?? plan.targets[0];

      targets.push({
        id: target,
        name: targetPlan?.name ?? formatTargetLabel(target),
        status: "preview-ready",
        risk: plan.risk.level,
        scope: targetPlan?.scope,
        installDir: targetPlan?.installDir,
        bridgeFiles: targetPlan?.bridgeFiles ?? [],
        warnings: targetPlan?.warnings ?? [],
        writes: targetPlan?.writes?.length ?? 0,
        checksum: targetPlan?.checksum ?? plan.provenance.checksum,
        checksumStatus: plan.provenance.checksumStatus,
        plan
      });
    } catch (error) {
      targets.push({
        id: target,
        name: formatTargetLabel(target),
        status: "not-ready",
        reason: error.message
      });
    }
  }

  const firstReady = targets.find((target) => target.plan);

  return {
    pack: firstReady?.plan.pack ?? { id: inputValue },
    summary: buildTargetSummary(targets),
    targets
  };
}

function printPreviewMatrix(result) {
  console.log(`Preview matrix for ${result.pack.id}`);
  console.log("");

  const firstPlan = result.targets.find((target) => target.plan)?.plan;

  for (const match of firstPlan?.typosquatting ?? []) {
    console.log(
      `WARNING: 疑似 typosquatting: "${result.pack.id}" is ${match.distance} edit(s) from installed/official pack "${match.name}" (edit distance ${match.distance}). ` +
        "Verify the exact pack name and publisher before installing."
    );
    console.log("");
  }

  for (const target of result.targets) {
    const detail =
      target.status === "preview-ready"
        ? `${target.status}  risk=${target.risk}  writes=${target.writes}  checksum=${target.checksumStatus}`
        : `${target.status}  ${target.reason}`;

    console.log(`${target.name.padEnd(16)} ${detail}`);
  }
}

async function buildPassport(inputValue, options = {}) {
  const preview = await buildAllTargetPreview(inputValue, options);
  const firstPlan = preview.targets.find((target) => target.plan)?.plan;

  if (!firstPlan) {
    throw new Error(`Pack "${inputValue}" cannot be previewed for any supported target.`);
  }

  const resolved = await resolveScorePack(inputValue, options);
  const score = buildScoreSummary(await doctorPack(resolved.packDir), resolved.source);

  return {
    pack: firstPlan.pack,
    targetSummary: preview.summary,
    preview,
    score,
    risk: {
      ...firstPlan.risk,
      ...riskPostureFromPlan(firstPlan)
    },
    context: firstPlan.context,
    provenance: firstPlan.provenance,
    permissions: firstPlan.permissions,
    // PS-3: re-installing is the most common mistake, so the Passport must
    // state what is already on disk. Read from the lockfile, the same source
    // `packsmith list` reports.
    installed: await describeInstalledTargets(firstPlan.pack.id, options),
    audit: {
      status: "preview-only",
      reason: "No files were written."
    }
  };
}

/**
 * Report which targets already hold this pack, straight from packsmith.lock.
 * Returns [] when the state directory has no lockfile yet.
 */
async function describeInstalledTargets(packId, options = {}) {
  const { installed } = await listInstalledPacks({ stateDir: options.stateDir });
  const normalizedId = String(packId).toLowerCase();

  return installed
    .filter((entry) => String(entry.pack).toLowerCase() === normalizedId)
    .map((entry) => ({
      target: entry.target,
      version: entry.version,
      installDir: entry.installDir
    }));
}

function printPassport(passport) {
  const targetOrder = ["claude-code", "codex", "github-copilot", "cursor", "opencode", "trae"];
  const targetsById = new Map(passport.preview.targets.map((target) => [target.id, target]));
  const orderedTargets = targetOrder.map((id) => targetsById.get(id)).filter(Boolean);
  const declared = passport.risk.declared;
  const computed = passport.risk.computed;
  const conflict = declared !== computed;

  console.log(`PACKSMITH PASSPORT — ${passport.pack.id}`);
  console.log(passport.pack.description);
  console.log("");

  // Runtime readiness
  const readyTargets = orderedTargets.filter((t) => t.status === "preview-ready");
  console.log("RUNTIME READINESS            all targets preview-ready");
  for (const target of readyTargets) {
    console.log(`  ${target.name}`);
  }
  console.log("");

  // Risk assessment — visual focus when declared vs computed conflict
  const riskPrefix = conflict ? "⚠ " : "";
  const riskUpgrade = conflict ? ` (upgraded from declared: ${declared})` : "";
  console.log(`RISK ASSESSMENT              ${riskPrefix}${computed.toUpperCase()}${riskUpgrade}`);
  if (conflict) {
    const postureReasons = passport.risk.reasons.filter((reason) => !reason.startsWith("registry declares "));
    const reasonText = postureReasons.length > 0 ? postureReasons.join("; ") : "";
    console.log(`  Why: ${reasonText}`);
  }
  console.log(`  Permissions: ${formatPermissionSummary(passport.permissions)}`);
  console.log("");

  // Trust section
  console.log("TRUST");
  console.log(`  Registry metadata   ${passport.provenance.verified ? "verified" : "unverified"} ✓`);
  console.log(`  Quality Score       ${passport.score.overall}/100`);
  console.log(`  Context             ${passport.context.estimatedChars} chars (${passport.context.tokenPressure} pressure)`);
  console.log(`  Publisher           ${passport.provenance.publisher}`);

  // Checksum is truncated to the first 12 chars; the full value stays in --json.
  // The mismatch status is only worth a line when it is not the default state.
  const checksumLabel = shortChecksum(passport.provenance.checksum);
  const mismatch = passport.provenance.checksumStatus === "mismatch";
  console.log(
    `  Checksum            ${checksumLabel} (${mismatch ? "mismatch, " : ""}full value in --json)`
  );
  console.log("");

  // Installed status — re-installing is the most common mistake, so say what
  // is already on disk instead of assuming a clean machine.
  const installed = passport.installed ?? [];
  if (installed.length === 0) {
    console.log("NOT INSTALLED on any target");
  } else {
    console.log(`INSTALLED on ${installed.length} target${installed.length === 1 ? "" : "s"}`);
    for (const entry of installed) {
      console.log(`  ${formatTargetLabel(entry.target)} ${entry.version} -> ${entry.installDir}`);
    }
  }
  console.log("");

  // NEXT command block
  console.log("NEXT");
  console.log(`  packsmith preview ${passport.pack.id} --all-targets   see exact file writes`);
  console.log(`  packsmith install ${passport.pack.id} --target codex --yes`);
  console.log("");
  console.log("Trust before install. Nothing was written.");
}

function printTargetsResult(result) {
  console.log("Packsmith Targets");

  for (const target of result.targets) {
    console.log("");
    console.log(`${target.name} (${target.id})`);
    console.log(`- Status: ${target.status}`);
    console.log(`- Scopes: ${target.scopes.join(", ") || "none"}`);
    const defaultPaths = Object.entries(target.defaultInstallRoots);

    if (defaultPaths.length <= 1) {
      console.log(`- Default path: ${defaultPaths[0]?.[1] ?? "not configured"}`);
    } else {
      console.log("- Default paths:");

      for (const [scope, installRoot] of defaultPaths) {
        console.log(`  - ${scope}: ${installRoot}`);
      }
    }

    if (target.warnings.length > 0) {
      console.log(`- Warnings: ${target.warnings.join("; ")}`);
    }
  }
}

function buildTargetsResult(options = {}) {
  return {
    targets: TARGET_ADAPTERS.map((adapter) => {
      const scopes = adapter.scopes ?? ["personal"];
      const defaultInstallRoots = {};

      for (const scope of scopes) {
        defaultInstallRoots[scope] = defaultInstallRoot(adapter.id, { scope, cwd: options.cwd ?? process.cwd() });
      }

      return {
        id: adapter.id,
        name: adapter.name,
        status: adapter.status,
        scopes,
        defaultInstallRoots,
        bridgeFiles: adapter.bridgeFiles ?? [],
        validationRules: adapter.validationRules ?? [],
        documentationUrl: adapter.documentationUrl,
        docsConfirmedAt: adapter.docsConfirmedAt,
        warnings: adapter.compatibilityWarnings ?? []
      };
    })
  };
}

function nextScriptedAnswer() {
  const script = process.env.PACKSMITH_TUI_SCRIPT;

  if (!script) {
    return null;
  }

  const [answer, ...rest] = script.split(/\r?\n|,/);
  process.env.PACKSMITH_TUI_SCRIPT = rest.join("\n");
  return answer;
}

async function askInteractive(rl, question) {
  const scripted = nextScriptedAnswer();

  if (scripted !== null) {
    console.log(`${question}${scripted}`);
    return scripted;
  }

  return rl.question(question);
}

async function runInteractive() {
  console.log("Packsmith Interactive");
  console.log("The package manager for AI agent workflows.");
  console.log("");
  console.log("Browse registry, search packs, view details, choose a target, and install or copy a command.");
  console.log("");

  const rl = createInterface({ input, output });

  try {
    while (true) {
      console.log("Actions:");
      console.log("  1. Browse registry");
      console.log("  2. Search packs");
      console.log("  3. Pack info");
      console.log("  4. Install pack");
      console.log("  q. Quit");

      const action = (await askInteractive(rl, "Select: ")).trim().toLowerCase();

      if (action === "q" || action === "quit" || action === "exit") {
        console.log("Goodbye.");
        return;
      }

      if (action === "1") {
        printSearchResult(await searchRegistry("", {}));
        continue;
      }

      if (action === "2") {
        const query = (await askInteractive(rl, "Search: ")).trim();
        printSearchResult(await searchRegistry(query, {}));
        continue;
      }

      if (action === "3") {
        const packId = (await askInteractive(rl, "Pack id: ")).trim();
        printShowResult(await findRegistryPack(packId, {}));
        continue;
      }

      if (action === "4") {
        const packId = (await askInteractive(rl, "Pack id: ")).trim();
        const target = (await askInteractive(rl, "Target (claude-code/codex/github-copilot/opencode/cursor/trae, blank to auto-detect): ")).trim();
        const dryRunAnswer = (await askInteractive(rl, "Dry run first? [Y/n]: ")).trim().toLowerCase();
        const dryRun = dryRunAnswer !== "n" && dryRunAnswer !== "no";
        const result = await installPack(packId, {
          target: target || undefined,
          dryRun,
          selectTargets: selectTargetsInteractively
        });

        if (result.dryRun && result.plan) {
          printInstallPlan(result.plan, { heading: "Install plan" });
        } else {
          printInstallResult(result);
        }
        continue;
      }

      console.log("Unknown action. Choose 1, 2, 3, 4, or q.");
    }
  } finally {
    rl.close();
  }
}

let currentCommand = null;
let currentRawArgs = [];
let currentOptions = {};

async function main() {
  const [, , command, ...rawArgs] = process.argv;
  currentCommand = command;
  currentRawArgs = rawArgs;

  if (!command) {
    if ((!input.isTTY || !output.isTTY) && !process.env.PACKSMITH_TUI_SCRIPT) {
      printHelp();
      return;
    }

    await runInteractive();
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const { positionals, options } = parseOptions(rawArgs, command);
  currentOptions = options;

  const logger = new Logger({ stateDir: options.stateDir, verbose: options.verbose, trace: options.trace });
  setLogger(logger);

  const [primary] = positionals;

  if (command === "init") {
    if (!primary) {
      throw new UsageError("Missing <pack-dir> argument for init.");
    }

    const result = await initPack(primary);
    writeOutput(options, () => console.log(`Initialized pack "${result.manifest.name}" in ${result.packDir}.`));
    return;
  }

  if (command === "validate") {
    if (!primary) {
      throw new UsageError("Missing <pack-dir> argument for validate.");
    }

    const result = await validatePack(primary);
    writeOutput(options, () =>
      console.log(`Validated pack "${result.manifest.name}" with ${result.skillCount} skill(s) and ${result.promptCount} prompt(s).`)
    );
    return;
  }

  if (command === "inspect") {
    if (!primary) {
      throw new UsageError("Missing <pack-dir> argument for inspect.");
    }

    const result = await inspectPack(primary);
    if (options.quiet && !options.json) {
      return;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "doctor") {
    if (!primary) {
      throw new UsageError("Missing <path> argument for doctor.");
    }

    // v0.2 reliability gate (plan §12): doctor <path> [--target <runtime>]
    // [--format json] over a whole workspace or a single skill directory.
    // Exit codes (plan §8): 0 = PASS, 1 = Skill validation failure,
    // 2 = usage / infrastructure failure (never a Skill finding).
    if (options.format !== undefined && options.format !== "json") {
      throw new UsageError(`Unsupported --format value for doctor: ${options.format}. Use --format json.`);
    }

    const jsonOutput = options.format === "json" || options.json;

    try {
      const report = await runDoctor({ targetPath: primary, target: options.target ?? null });

      if (jsonOutput) {
        printJson(JSON.parse(renderDoctorJson(report)));
      } else if (!options.quiet) {
        console.log(renderDoctorTerminal(report));
      }

      process.exitCode = report.exitCode;
    } catch (error) {
      // Usage mistakes (bad path, unknown --target) stay usage errors: exit 2
      // via the standard usage path.
      if (error.isUsageError) {
        throw new UsageError(error.message);
      }

      // Infrastructure failures (broken knowledge base, unreadable target)
      // are Packsmith faults, never Skill failures (plan §4.4): exit 2 with
      // the canonical error envelope when JSON output was requested.
      console.error(`Error: ${error.message}`);

      if (jsonOutput) {
        printJson({
          schemaVersion: 1,
          ok: false,
          error: {
            code: "infrastructure_error",
            message: error.message,
            exitCode: 2
          }
        });
      }

      process.exitCode = 2;
    }

    return;
  }

  if (command === "score") {
    if (!primary) {
      throw new UsageError("Missing <pack> argument for score.");
    }

    const resolved = await resolveScorePack(primary, options);
    const result = await doctorPack(resolved.packDir);
    const summary = buildScoreSummary(result, resolved.source);

    if (options.json) {
      printJson(summary);
    } else {
      writeOutput(options, () => printScoreResult(summary));
    }

    return;
  }

  if (command === "passport") {
    if (!primary) {
      throw new UsageError("Missing <pack> argument for passport.");
    }

    const result = await buildPassport(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printPassport(result));
    }

    return;
  }

  if (command === "targets") {
    const result = buildTargetsResult(stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printTargetsResult(result));
    }

    return;
  }

  if (command === "build") {
    if (!primary) {
      throw new UsageError("Missing <pack-dir> argument for build.");
    }

    const result = await buildPack(primary, options.out ?? "dist");
    const planned = result.targetsPlanned.length > 0 ? ` (${result.targetsPlanned.join(", ")} planned)` : "";
    writeOutput(options, () =>
      console.log(`Built "${result.manifest.name}" for ${result.targetsBuilt.join(", ")} in ${result.outputRoot}${planned}.`)
    );
    return;
  }

  if (command === "install") {
    if (!primary) {
      throw new UsageError("Missing <pack-or-built-dir|pack-id> argument for install.");
    }

    // #30: installing more than one pack id is rejected instead of silently
    // installing only the first one.
    if (primary !== "plan" && positionals.length > 1) {
      throw new UsageError(
        `Install can only accept one pack id. Received extra: ${positionals.slice(1).map((p) => `'${p}'`).join(", ")}`
      );
    }

    if (primary === "plan") {
      const planTarget = positionals[1];

      if (!planTarget) {
        throw new UsageError("Missing <pack> argument for install plan.");
      }

      const result = await previewInstallPlan(planTarget, stateOptions(options));

      if (options.json) {
        printJson(result);
      } else {
        writeOutput(options, () => printInstallPlan(result, { heading: "Install plan" }));
      }

      return;
    }

    if (options.dest) {
      if (!options.target) {
        throw new UsageError("Missing required --target <name> option.");
      }

      const result = await installBundle(primary, { target: options.target, dest: options.dest });
      writeOutput(options, () => console.log(`Installed "${result.manifest.name}" target "${result.target}" into ${result.installDir}.`));
      return;
    }

    const result = await installPack(primary, stateOptions(options));

    if (options.json && result.plan) {
      printJson(result.dryRun ? result.plan : result);
    } else if (result.dryRun && result.plan) {
      writeOutput(options, () => printInstallPlan(result.plan));
    } else {
      writeOutput(options, () => printInstallResult(result));
    }

    return;
  }

  if (command === "preview") {
    if (!primary) {
      throw new UsageError("Missing <pack> argument for preview.");
    }

    if (options.allTargets) {
      const result = await buildAllTargetPreview(primary, stateOptions(options));

      if (options.json) {
        printJson(result);
      } else {
        writeOutput(options, () => printPreviewMatrix(result));
      }

      return;
    }

    const result = await previewInstallPlan(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printInstallPlan(result, { heading: "Preview" }));
    }

    return;
  }

  if (command === "list") {
    const result = await listInstalledPacks(stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printListResult(result));
    }

    return;
  }

  if (command === "remove") {
    if (!primary) {
      throw new UsageError("Missing <pack> argument for remove.");
    }

    const result = await removeInstalledPack(primary, stateOptions(options));
    writeOutput(options, () => console.log(`Removed ${result.pack} from ${result.removed.length} target(s).`));
    return;
  }

  if (command === "pin") {
    if (!primary) {
      throw new UsageError("Missing <pack> argument for pin.");
    }

    const result = await pinInstalledPack(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => console.log(`Pinned ${result.pack} in ${result.pinned.length} target(s).`));
    }

    return;
  }

  if (command === "update") {
    const result = await updateInstalledPacks(primary, stateOptions(options));

    if (result.updated.length === 0) {
      writeOutput(options, () => console.log("No installed packs to update."));
      return;
    }

    writeOutput(options, () => {
      console.log("Update results:");

      for (const item of result.updated) {
        console.log(`- ${item.pack} (${item.target}): ${item.status}`);
      }
    });

    return;
  }

  if (command === "sync") {
    const result = await syncInstalledPacks(stateOptions(options));
    writeOutput(options, () => printSyncResult(result));

    if (options.policy && result.audit.results.some((item) => item.status !== "ok")) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "search") {
    if (!primary) {
      throw new UsageError("Missing <query> argument for search.");
    }

    const result = await searchRegistry(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printSearchResult(result));
    }

    return;
  }

  if (command === "show" || command === "info") {
    if (!primary) {
      throw new UsageError(`Missing <pack> argument for ${command}.`);
    }

    const result = await findRegistryPack(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      // #7: fail closed — when the computed risk is unavailable it is never
      // replaced by the catalog's declared risk level.
      let riskPosture;
      let previewError = null;
      try {
        riskPosture = riskPostureFromPlan(await previewInstallPlan(primary, stateOptions(options)));
      } catch (error) {
        previewError = error;
      }

      writeOutput(options, () => printShowResult(result, { riskPosture, previewError }));
    }

    return;
  }

  if (command === "publish") {
    if (!primary) {
      throw new UsageError("Missing <pack-dir> argument for publish.");
    }

    if (!options.dryRun) {
      throw new UsageError("Remote publish is not implemented yet. Run packsmith publish <pack-dir> --dry-run to validate a submission.");
    }

    const result = await preparePublish(primary, stateOptions(options));

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printPublishResult(result));
    }

    return;
  }

  if (command === "registry") {
    const subcommand = primary;

    if (subcommand === "list") {
      const result = await listRegistries(stateOptions(options));

      if (options.json) {
        printJson(result);
      } else {
        writeOutput(options, () => {
          console.log(`Active registry: ${result.active}`);
          for (const registry of result.registries) {
            console.log(`- ${registry.name} (${registry.type}) ${registry.url}`);
          }
        });
      }

      return;
    }

    if (subcommand === "add") {
      const [name, url] = positionals.slice(1);
      const result = await addRegistry(name, url, stateOptions(options));
      writeOutput(options, () => console.log(`Added registry ${result.entry.name}: ${result.entry.url}`));
      return;
    }

    if (subcommand === "use") {
      const name = positionals[1];
      const result = await useRegistry(name, stateOptions(options));
      writeOutput(options, () => console.log(`Using registry ${result.active}.`));
      return;
    }

    if (subcommand === "refresh") {
      const result = await refreshRegistries(stateOptions(options));

      if (options.json) {
        printJson(result);
      } else {
        writeOutput(options, () => printRegistryRefreshResult(result));
      }

      return;
    }

    if (subcommand !== "validate") {
      throw new UsageError("Unknown registry command. Use: packsmith registry list|add|use|refresh|validate.");
    }

    const result = await validateRegistry({
      ...stateOptions(options),
      qualityGate: options.qualityGate,
      validatePack,
      doctorPack
    });

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printRegistryValidationResult(result));
    }

    if (!result.valid) {
      throw new Error(result.issues.join(" "));
    }

    return;
  }

  if (command === "policy") {
    if (primary !== "validate") {
      throw new UsageError("Unknown policy command. Use: packsmith policy validate <policy-file>.");
    }

    const policyPath = positionals[1];

    if (!policyPath) {
      throw new UsageError("Missing <policy-file> argument for policy validate.");
    }

    const result = await validatePolicy(policyPath);

    if (options.json) {
      printJson(result);
    } else {
      writeOutput(options, () => printPolicyValidationResult(result));
    }

    if (!result.valid) {
      // Invalid policies surface as a runtime error so the issues reach stderr
      // and CI can distinguish them from a clean run.
      throw new Error(result.issues.join(" "));
    }

    return;
  }

  if (command === "audit") {
    const result = await auditInstalledPacks(stateOptions(options));

    // Build the canonical envelope: { schemaVersion:1, ok:true, stateDir, policy, results }
    // Internal results structure is preserved as-is so existing consumers are not broken.
    const envelope = {
      schemaVersion: 1,
      ok: true,
      stateDir: result.stateDir,
      policy: result.policy,
      results: result.results
    };

    if (options.json) {
      printJson(envelope);
    } else {
      writeOutput(options, () => printAuditResult(result));
    }

    // --ci gate: non-ok audit items cause exit code 1, but JSON envelope is still
    // output so CI can parse it regardless.  The --ci flag only affects the exit code,
    // not the stdout format (stdout must remain pure JSON when --json is set).
    if (options.ci && result.results.some((item) => item.status !== "ok")) {
      process.exitCode = 1;
    }

    return;
  }

  throw new UsageError(`Unknown command: ${command}. Run packsmith --help for available commands.`);
}

main().catch((error) => {
  const isUsage = error instanceof UsageError;
  const isPacksmith = error instanceof PacksmithError;

  if (currentOptions?.json) {
    // Error path already has the canonical envelope { schemaVersion:1, ok:false, error: {...} }
    printJson({
      schemaVersion: 1,
      ok: false,
      error: {
        code: isUsage ? "usage_error" : isPacksmith ? error.code : "runtime_error",
        message: error.message,
        exitCode: isUsage ? error.exitCode : 1,
        ...(error.stack && !isUsage && !isPacksmith ? { stack: error.stack } : {})
      }
    });
    process.exitCode = isUsage ? error.exitCode : 1;
    return;
  }

  if (isUsage) {
    console.error(`Usage error: ${error.message}`);
    process.exitCode = error.exitCode;
    return;
  }

  if (isPacksmith) {
    // ERR-* template: conclusion symbol + reason + fix command (design-input §4).
    // Never a stack trace: this screen is the product's trust moment.
    for (const line of renderPacksmithError(error)) {
      console.error(line);
    }
    process.exitCode = error.exitCode;
    return;
  }

  // Unexpected error: one plain line to stderr, the stack goes to the debug log
  // file only (PACKSMITH_LOG_LEVEL=debug), never to the user's terminal (§4).
  console.error(`Error: ${error.message}`);
  getLogger()?.debug(`Unexpected error: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
