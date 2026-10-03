#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const checks = [
  { label: "help resolves from npm", args: ["--help"] },
  { label: "search reads packaged registry", args: ["search", "review"] },
  { label: "show explains bundled pack", args: ["show", "senior-code-reviewer"] },
  { label: "preview builds Codex install plan", args: ["preview", "senior-code-reviewer", "--target", "codex"] },
  { label: "passport prints trust summary", args: ["passport", "senior-code-reviewer"] }
];

export function npxExecutable(platform = process.platform) {
  return platform === "win32" ? "npx.cmd" : "npx";
}

export async function packageSpecifier(packagePath = path.join(repoRoot, "package.json")) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  return `${packageJson.name}@${packageJson.version}`;
}

export function postPublishEnv(cacheDir, env = process.env) {
  const cleanEnv = Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== "npm_config_cache"));

  return {
    ...cleanEnv,
    npm_config_cache: cacheDir,
    NO_COLOR: "1"
  };
}

function printCommand(packageName, args) {
  return `npx --yes ${packageName} ${args.join(" ")}`;
}

async function runCheck(check, packageName, env) {
  const commandArgs = ["--yes", packageName, ...check.args];
  const result = await execFileAsync(npxExecutable(), commandArgs, {
    env,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 6
  });

  console.log(`[PASS] ${check.label}`);
  console.log(`       ${printCommand(packageName, check.args)}`);
  return result;
}

async function main() {
  console.log("Packsmith Post-Publish Verification");
  console.log("Requires @packsmith/cli to be publicly published on npm.");
  console.log("");
  const packageName = await packageSpecifier();
  const npmCache = await mkdtemp(path.join(os.tmpdir(), "packsmith-postpublish-npm-cache-"));
  const env = postPublishEnv(npmCache);

  for (const check of checks) {
    try {
      await runCheck(check, packageName, env);
    } catch (error) {
      console.log(`[FAIL] ${check.label}`);
      console.log(`       ${printCommand(packageName, check.args)}`);
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
      if (output) {
        console.log(output);
      } else if (error.message) {
        console.log(error.message);
      }
      process.exitCode = Number.isInteger(error.code) ? error.code : 1;
      return;
    }
  }

  console.log("");
  console.log("Post-publish verification passed.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
