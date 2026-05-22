import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { ensureDir } from "../src/lib/fs-utils.mjs";
import { createPacksmithTarball, installPacksmithTarball, runInstalledPacksmith } from "./npm-helpers.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

async function runCli(args, options = {}) {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env
    }
  });

  process.stdout.write(result.stdout);

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-smoke-"));
  const workspace = path.join(tempRoot, "workspace");
  const homeDir = path.join(tempRoot, "home");
  const packOutputDir = path.join(tempRoot, "pack-output");
  const npmPrefixDir = path.join(tempRoot, "npm-prefix");
  const packDir = path.join(workspace, "temp-smoke-pack");
  const codexInstallDir = path.join(workspace, "codex-install");
  const env = { HOME: homeDir, USERPROFILE: homeDir };

  await ensureDir(workspace);
  await ensureDir(homeDir);
  await ensureDir(packOutputDir);
  await ensureDir(npmPrefixDir);

  await runCli(["init", packDir], { cwd: workspace, env });
  await runCli(["inspect", packDir, "--json"], { cwd: workspace, env });
  await runCli(["validate", packDir, "--strict"], { cwd: workspace, env });
  await runCli(["build", packDir], { cwd: workspace, env });
  await runCli(["install", packDir, "--target", "codex", "--dest", codexInstallDir], { cwd: workspace, env });
  const codexAgentsPath = path.join(codexInstallDir, "temp-smoke-pack", "AGENTS.md");
  const codexAgentsContent = await readFile(codexAgentsPath, "utf8");
  console.log(`Verified Codex install artifact: ${codexAgentsPath}`);

  await runCli(["install", packDir, "--target", "claude-code", "--scope", "project"], { cwd: workspace, env });
  await runCli(["list", "--target", "claude-code", "--scope", "project"], { cwd: workspace, env });
  await runCli(["doctor", "--target", "claude-code", "--scope", "project"], { cwd: workspace, env });
  await runCli(["uninstall", "temp-smoke-pack", "--target", "claude-code", "--scope", "project"], { cwd: workspace, env });

  if (!/temp-smoke-pack/i.test(codexAgentsContent)) {
    throw new Error(`Expected Codex AGENTS.md to mention temp-smoke-pack: ${codexAgentsPath}`);
  }

  const tarball = await createPacksmithTarball(repoRoot, packOutputDir);
  const { binPath } = await installPacksmithTarball(tarball.tarballPath, npmPrefixDir, { cwd: tempRoot, env });
  const { stdout } = await runInstalledPacksmith(binPath, ["--help"], { cwd: workspace, env });
  process.stdout.write(stdout);

  if (!stdout.startsWith("Packsmith")) {
    throw new Error(`Expected installed packsmith binary to print help header. Bin: ${binPath}`);
  }

  console.log(`Verified packaged CLI entrypoint: ${binPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
