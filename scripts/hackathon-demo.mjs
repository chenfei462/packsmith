#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");

function assertInside(parentDir, childDir, label) {
  const relativePath = path.relative(path.resolve(parentDir), path.resolve(childDir));

  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside the demo root.`);
  }
}

async function createDemoRoot() {
  if (!process.env.PACKSMITH_DEMO_ROOT) {
    return mkdtemp(path.join(os.tmpdir(), "packsmith-hackathon-demo-"));
  }

  const demoRoot = path.resolve(process.env.PACKSMITH_DEMO_ROOT);
  await mkdir(demoRoot, { recursive: true });
  return demoRoot;
}

function demoEnv(demoRoot) {
  const homeDir = path.join(demoRoot, "home");
  const stateDir = path.join(demoRoot, "state");

  assertInside(demoRoot, homeDir, "PACKSMITH_TEST_HOME");
  assertInside(demoRoot, stateDir, "PACKSMITH_HOME");

  return {
    homeDir,
    stateDir,
    env: {
      ...process.env,
      PACKSMITH_HOME: stateDir,
      PACKSMITH_TEST_HOME: homeDir,
      NO_COLOR: "1"
    }
  };
}

function printSection(title) {
  console.log("");
  console.log(`== ${title}`);
}

function firstMatch(value, pattern, fallback) {
  const match = value.match(pattern);
  return match?.[1]?.trim() ?? fallback;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function cleanupCommand(demoRoot) {
  if (process.platform === "win32") {
    const escaped = demoRoot.replace(/'/g, "''");
    return `Remove-Item -LiteralPath '${escaped}' -Recurse -Force`;
  }

  return `rm -rf ${JSON.stringify(demoRoot)}`;
}

function previewStatus(preview) {
  return preview?.exitCode === 0 && /Install plan for senior-code-reviewer@0\.1\.0/.test(preview.stdout) ? "preview-ready" : "not proven";
}

function formatPermissions(stdout) {
  return ["shell", "filesystem", "network", "browser"]
    .map((name) => `${name} ${firstMatch(stdout, new RegExp(`- ${name}: (.+)`), "shown")}`)
    .join(", ");
}

function printPassport({ previews, doctor, audit, receipt }) {
  const codexPreview = previews.codex;
  const risk = firstMatch(codexPreview.stdout, /- Risk: (.+)/, "shown");
  const permissions = formatPermissions(codexPreview.stdout);
  const qualityScore = firstMatch(doctor.stdout, /Overall: (\d+\/100)/, "shown");
  const verified = firstMatch(codexPreview.stdout, /- Verified: (yes|no)/, "shown");
  const receiptChecksum = receipt?.checksum?.startsWith("sha256-") ? receipt.checksum : "missing";
  const auditStatus = /checksum mismatch/i.test(`${audit.stdout}\n${audit.stderr}`) ? "tamper caught" : "not proven";
  const codexStatus = receipt?.target === "codex" && receiptChecksum !== "missing" ? "installed" : "not proven";

  console.log("");
  console.log("PACKSMITH PASSPORT: senior-code-reviewer");
  console.log("");
  console.log("Targets:");
  console.log(`Claude Code       ${previewStatus(previews["claude-code"])}`);
  console.log(`Codex             ${codexStatus}`);
  console.log(`GitHub Copilot    ${previewStatus(previews["github-copilot"])}`);
  console.log(`Cursor            ${previewStatus(previews.cursor)}`);
  console.log(`OpenCode          ${previewStatus(previews.opencode)}`);
  console.log(`TRAE              ${previewStatus(previews.trae)}`);
  console.log("");
  console.log("Trust:");
  console.log(`Registry metadata verified ${verified}`);
  console.log(`Risk              ${risk}`);
  console.log(`Permissions       ${permissions}`);
  console.log(`Quality Score     ${qualityScore}`);
  console.log(`Install receipt   checksum ${receiptChecksum}`);
  console.log(`Audit             ${auditStatus}`);
}

function printAgentReviewPayoff() {
  printSection("Agent review payoff");
  console.log("Installed workflow: senior-code-reviewer");
  console.log("User prompt: Use senior-code-reviewer to review my current changes.");
  console.log("");
  console.log("Prepared transcript from the installed workflow:");
  console.log("- Finding: src/cli.mjs treats a value-bearing option as a boolean flag.");
  console.log("- Risk: `--scope project` can be parsed incorrectly, breaking GitHub Copilot project installs.");
  console.log("- Missing tests: add coverage for `--scope project` and for `--scope` without a value.");
  console.log("- Recommendation: keep `--scope` as a valued option and test the project-scope install path.");
  console.log("");
  console.log("Full transcript: docs/demo-transcript.md");
}

async function runCli(args, context, options = {}) {
  const command = `node src/cli.mjs ${args.join(" ")}`;
  printSection(command);

  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: context.env,
      timeout: options.timeout ?? 30000,
      maxBuffer: 1024 * 1024 * 4
    });

    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return { ...result, exitCode: 0 };
  } catch (error) {
    if (!options.expectFailure) {
      throw error;
    }

    process.stdout.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: error.code ?? 1
    };
  }
}

async function prepareIsolatedState(demoRoot, context) {
  await rm(context.homeDir, { recursive: true, force: true });
  await rm(context.stateDir, { recursive: true, force: true });
  await mkdir(context.homeDir, { recursive: true });
  await mkdir(context.stateDir, { recursive: true });

  console.log(`Demo root: ${demoRoot}`);
  console.log(`PACKSMITH_TEST_HOME: ${context.homeDir}`);
  console.log(`PACKSMITH_HOME: ${context.stateDir}`);
}

async function runHackathonDemo() {
  const demoRoot = await createDemoRoot();
  const context = demoEnv(demoRoot);

  console.log("Packsmith Hackathon Demo");
  console.log("One workflow. Six agent install plans. One isolated install. Trust before install.");
  console.log("Workflow Pack -> Six Agent Plans -> Trust Passport");
  await prepareIsolatedState(demoRoot, context);

  await runCli(["search", "review"], context);
  await runCli(["targets"], context);

  const previews = {
    "claude-code": await runCli(["preview", "senior-code-reviewer", "--target", "claude-code"], context),
    codex: await runCli(["preview", "senior-code-reviewer", "--target", "codex"], context),
    "github-copilot": await runCli(["preview", "senior-code-reviewer", "--target", "github-copilot", "--scope", "personal"], context),
    cursor: await runCli(["preview", "senior-code-reviewer", "--target", "cursor"], context),
    opencode: await runCli(["preview", "senior-code-reviewer", "--target", "opencode"], context),
    trae: await runCli(["preview", "senior-code-reviewer", "--target", "trae"], context)
  };

  await runCli(["score", "senior-code-reviewer"], context);
  const doctor = await runCli(["doctor", path.join("official-packs", "senior-code-reviewer")], context);
  await runCli(["install", "senior-code-reviewer", "--target", "codex", "--yes"], context);

  const installedPackDir = path.join(context.homeDir, ".codex", "skills", "senior-code-reviewer");
  const receipt = await readJson(path.join(context.stateDir, "receipts", "senior-code-reviewer.codex.json"));

  printSection("use installed workflow");
  console.log("Ask Codex: Use senior-code-reviewer to review my current changes.");
  console.log(`Installed skill path: ${installedPackDir}`);
  printAgentReviewPayoff();

  const tamperPath = path.join(installedPackDir, "tampered-demo.txt");
  assertInside(context.homeDir, tamperPath, "tamper path");
  await writeFile(tamperPath, "demo tamper\n", "utf8");

  printSection(`tamper installed pack at ${tamperPath}`);
  const audit = await runCli(["audit", "--ci"], context, { expectFailure: true });

  if (audit.exitCode === 0 || !new RegExp("checksum mismatch", "i").test(`${audit.stdout}\n${audit.stderr}`)) {
    throw new Error("Expected audit --ci to catch a checksum mismatch after tampering with the installed pack.");
  }

  console.log("");
  console.log("Tamper detection: audit --ci caught checksum mismatch.");
  console.log("I changed one installed workflow file. Packsmith caught it.");
  console.log("That is why agent workflows need a package manager.");
  console.log("Use this as the final demo beat: Packsmith is not just an installer; it is a trust gate for agent workflows.");
  printPassport({ previews, doctor, audit, receipt });

  console.log(`Temporary demo files remain for inspection: ${demoRoot}`);
  console.log(`Remove them later with: ${cleanupCommand(demoRoot)}`);
}

runHackathonDemo().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
