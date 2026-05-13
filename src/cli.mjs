#!/usr/bin/env node

import { buildPack, initPack, inspectPack, installBundle, validatePack } from "./lib/pack.mjs";

function printHelp() {
  console.log(`Packsmith

Usage:
  packsmith init <pack-dir>
  packsmith validate <pack-dir>
  packsmith inspect <pack-dir>
  packsmith build <pack-dir> [--out dist]
  packsmith install <built-pack-dir> --target <name> --dest <dir>

Examples:
  node src/cli.mjs init my-pack
  node src/cli.mjs validate examples/research-launchpad
  node src/cli.mjs inspect examples/research-launchpad
  node src/cli.mjs build examples/research-launchpad
`);
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

function parseInstallArgs(args) {
  let target;
  let dest;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--target") {
      target = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--dest") {
      dest = args[index + 1];
      index += 1;
    }
  }

  return { target, dest };
}

async function main() {
  const [, , command, packDir, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!packDir) {
    throw new Error("Missing <pack-dir> argument.");
  }

  if (command === "init") {
    const result = await initPack(packDir);
    console.log(`Initialized pack "${result.manifest.name}" in ${result.packDir}.`);
    return;
  }

  if (command === "validate") {
    const result = await validatePack(packDir);
    console.log(`Validated pack "${result.manifest.name}" with ${result.skillCount} skill(s) and ${result.promptCount} prompt(s).`);
    return;
  }

  if (command === "inspect") {
    const result = await inspectPack(packDir);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "build") {
    const { outDir } = parseBuildArgs(rest);
    const result = await buildPack(packDir, outDir);
    console.log(`Built "${result.manifest.name}" for ${result.targetsBuilt.join(", ")} in ${result.outputRoot}.`);
    return;
  }

  if (command === "install") {
    const { target, dest } = parseInstallArgs(rest);
    const result = await installBundle(packDir, { target, dest });
    console.log(`Installed "${result.manifest.name}" target "${result.target}" into ${result.installDir}.`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
