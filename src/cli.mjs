#!/usr/bin/env node

import { buildPack, initPack, inspectInstalledBundles, inspectInstallTargets, inspectPack, installBundle, uninstallBundle, validatePack } from "./lib/pack.mjs";

function printHelp() {
  console.log(`Packsmith

Usage:
  packsmith init <pack-dir>
  packsmith validate <pack-dir> [--strict]
  packsmith inspect <pack-dir> [--json]
  packsmith list --target claude-code --scope <project|user> [--json]
  packsmith doctor --target claude-code --scope <project|user> [--json]
  packsmith build <pack-dir> [--out dist]
  packsmith install <pack-or-built-dir> --target <name> --dest <dir>
  packsmith install <pack-or-built-dir> --target claude-code --scope <project|user>
  packsmith uninstall <pack-name> --target claude-code --scope <project|user>

Examples:
  node src/cli.mjs init my-pack
  node src/cli.mjs validate examples/research-launchpad
  node src/cli.mjs inspect examples/research-launchpad
  node src/cli.mjs list --target claude-code --scope user
  node src/cli.mjs doctor --target claude-code --scope user
  node src/cli.mjs build examples/research-launchpad
  node src/cli.mjs install examples/research-launchpad --target claude-code --scope user
  node src/cli.mjs uninstall research-launchpad --target claude-code --scope user
`);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function parseBuildArgs(args) {
  let outDir = "dist";

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out") {
      outDir = args[index + 1] ?? outDir;
      index += 1;
    }
  }

  return { outDir };
}

function parseValidateArgs(args) {
  return {
    strict: args.includes("--strict")
  };
}

function parseInspectArgs(args) {
  return {
    asJson: args.includes("--json")
  };
}

function parseListArgs(args) {
  let target;
  let scope;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--target") {
      target = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--scope") {
      scope = args[index + 1];
      index += 1;
    }
  }

  return {
    target,
    scope,
    asJson: args.includes("--json")
  };
}

function parseDoctorArgs(args) {
  return parseListArgs(args);
}

function parseInstallArgs(args) {
  let target;
  let dest;
  let scope;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--target") {
      target = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--dest") {
      dest = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--scope") {
      scope = args[index + 1];
      index += 1;
    }
  }

  return { target, dest, scope };
}

function parseUninstallArgs(args) {
  let target;
  let scope;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--target") {
      target = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--scope") {
      scope = args[index + 1];
      index += 1;
    }
  }

  return { target, scope };
}

function formatDiagnostics(diagnostics) {
  if (diagnostics.length === 0) {
    return "- none";
  }

  return diagnostics
    .map((diagnostic) => `- [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`)
    .join("\n");
}

function formatDuplicateGroups(groups) {
  if (groups.length === 0) {
    return "- none";
  }

  return groups
    .map((group) => `- ${group.assets.join(", ")} (${formatNumber(group.repeatedChars)} repeated chars)`)
    .join("\n");
}

function formatInspectResult(result) {
  const skills = result.skills
    .map(
      (skill) =>
        `- ${skill.id}: ${formatNumber(skill.contextChars)} chars, ${formatNumber(skill.bytes)} bytes, ${formatNumber(skill.fileCount)} file(s)`
    )
    .join("\n");
  const prompts =
    result.prompts.length === 0
      ? "- none"
      : result.prompts
          .map((prompt) => `- ${prompt.id}: ${formatNumber(prompt.contextChars)} chars, ${formatNumber(prompt.bytes)} bytes`)
          .join("\n");

  return `Packsmith Inspect
Pack: ${result.name}@${result.version}
Path: ${result.packDir}
Targets: ${result.targets.join(", ")}
Assets: ${result.skillCount} skill(s), ${result.promptCount} prompt(s)
Estimated context: ${formatNumber(result.estimatedContextChars)} chars

Skills:
${skills}

Prompts:
${prompts}

Diagnostics:
${formatDiagnostics(result.diagnostics)}

Duplicate content:
${formatDuplicateGroups(result.duplicateGroups)}
`;
}

function formatInstalledBundles(result) {
  const items =
    result.installed.length === 0
      ? "- none"
      : result.installed
          .map(
            (bundle) =>
              `- ${bundle.name}@${bundle.version}: ${bundle.skillCount} skill(s), ${bundle.promptCount} prompt(s), skills: ${bundle.skillIds.join(", ") || "none"}, prompts: ${bundle.promptIds.join(", ") || "none"}, integrity: ${bundle.integrity.ok ? "ok" : "broken"}${bundle.integrity.missingSkills.length > 0 ? `, missing skills: ${bundle.integrity.missingSkills.join(", ")}` : ""}${bundle.integrity.missingPrompts.length > 0 ? `, missing prompts: ${bundle.integrity.missingPrompts.join(", ")}` : ""}, metadata ${bundle.metadataDir}`
          )
          .join("\n");

  return `Installed Packsmith bundles
Target: ${result.target}
Scope: ${result.scope}

Bundles:
${items}
`;
}

function formatDoctorResult(result) {
  const bundles =
    result.installed.length === 0
      ? "- none"
      : result.installed
          .map(
            (bundle) =>
              `- ${bundle.name}@${bundle.version}: ${bundle.skillCount} skill(s), ${bundle.promptCount} prompt(s), skills: ${bundle.skillIds.join(", ") || "none"}, prompts: ${bundle.promptIds.join(", ") || "none"}, integrity: ${bundle.integrity.ok ? "ok" : "broken"}${bundle.integrity.missingSkills.length > 0 ? `, missing skills: ${bundle.integrity.missingSkills.join(", ")}` : ""}${bundle.integrity.missingPrompts.length > 0 ? `, missing prompts: ${bundle.integrity.missingPrompts.join(", ")}` : ""}`
          )
          .join("\n");
  const unmanagedSkills = result.unmanagedSkills.length === 0 ? "- none" : result.unmanagedSkills.join(", ");

  return `Packsmith Doctor
Target: ${result.target}
Scope: ${result.scope}
Skills root: ${result.skillsRoot}
Metadata root: ${result.metadataRoot}
Unmanaged skills: ${unmanagedSkills}

Installed bundles:
${bundles}
`;
}

async function main() {
  const [, , command, packDir, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!packDir && command !== "list") {
    throw new Error("Missing <pack-dir> argument.");
  }

  if (command === "init") {
    const result = await initPack(packDir);
    console.log(`Initialized pack "${result.manifest.name}" in ${result.packDir}.`);
    return;
  }

  if (command === "validate") {
    const { strict } = parseValidateArgs(rest);
    const result = await validatePack(packDir, { strict });
    const mode = strict ? "strictly validated" : "validated";
    console.log(`${mode[0].toUpperCase()}${mode.slice(1)} pack "${result.manifest.name}" with ${result.skillCount} skill(s) and ${result.promptCount} prompt(s).`);
    return;
  }

  if (command === "inspect") {
    const { asJson } = parseInspectArgs(rest);
    const result = await inspectPack(packDir);
    console.log(asJson ? JSON.stringify(result, null, 2) : formatInspectResult(result));
    return;
  }

  if (command === "list") {
    const { target, scope, asJson } = parseListArgs([packDir, ...rest]);
    const result = await inspectInstalledBundles({ target, scope });
    console.log(asJson ? JSON.stringify(result, null, 2) : formatInstalledBundles(result));
    return;
  }

  if (command === "doctor") {
    const { target, scope, asJson } = parseDoctorArgs([packDir, ...rest]);
    const result = await inspectInstallTargets({ target, scope });
    console.log(asJson ? JSON.stringify(result, null, 2) : formatDoctorResult(result));
    return;
  }

  if (command === "build") {
    const { outDir } = parseBuildArgs(rest);
    const result = await buildPack(packDir, outDir);
    console.log(`Built "${result.manifest.name}" for ${result.targetsBuilt.join(", ")} in ${result.outputRoot}.`);
    return;
  }

  if (command === "install") {
    const { target, dest, scope } = parseInstallArgs(rest);
    const result = await installBundle(packDir, { target, dest, scope });
    const scopeLabel = scope ? ` using ${result.scope} scope` : "";
    console.log(`Installed "${result.manifest.name}" target "${result.target}"${scopeLabel} into ${result.installDir}.`);
    return;
  }

  if (command === "uninstall") {
    const { target, scope } = parseUninstallArgs(rest);
    const result = await uninstallBundle(packDir, { target, scope });
    console.log(`Uninstalled "${result.packName}" target "${result.target}" using ${result.scope} scope from ${result.uninstallDir}.`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
