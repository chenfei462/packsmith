#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const skipNetwork = args.has("--skip-network");
const npmCliPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const results = [];

function printStatus(status, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${label}${suffix}`);
}

async function runStep(label, command, commandArgs, options = {}) {
  try {
    const result = await execFileAsync(command, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        NO_COLOR: "1",
        ...(options.env ?? {})
      },
      timeout: options.timeout ?? 120000,
      maxBuffer: 1024 * 1024 * 8
    });

    results.push({ label, status: "PASS" });
    printStatus("PASS", label);
    return result;
  } catch (error) {
    if (options.allowFailure?.(error)) {
      const detail = options.failureDetail?.(error) ?? "non-blocking";
      results.push({ label, status: "WARN", detail });
      printStatus("WARN", label, detail);
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        code: error.code ?? 1
      };
    }

    results.push({ label, status: "FAIL", detail: error.message });
    printStatus("FAIL", label, error.message);
    throw error;
  }
}

async function assertPackSurface() {
  const { stdout } = await runStep("npm pack dry-run", process.execPath, [npmCliPath, "pack", "--dry-run", "--json"], {
    timeout: 120000
  });
  const [pack] = JSON.parse(stdout);
  const files = new Set(pack.files.map((file) => file.path));
  const requiredFiles = [
    "README.md",
    "docs/assets/packsmith-demo.svg",
    "docs/hackathon-demo.md",
    "registry/catalog.json",
    "scripts/hackathon-demo.mjs",
    "scripts/verify-hackathon.mjs",
    "src/cli.mjs",
    "official-packs/senior-code-reviewer/packsmith.json"
  ];
  const missing = requiredFiles.filter((file) => !files.has(file));

  if (missing.length > 0) {
    throw new Error(`npm pack is missing: ${missing.join(", ")}`);
  }

  if ([...files].some((file) => file.startsWith("tests/") || file.endsWith(".tgz"))) {
    throw new Error("npm pack includes tests or generated tarballs.");
  }

  results.push({ label: "npm pack contains demo surface", status: "PASS" });
  printStatus("PASS", "npm pack contains demo surface", `${pack.entryCount} files`);
}

async function checkPublicationStatus() {
  if (skipNetwork) {
    results.push({ label: "npm publication status", status: "SKIP" });
    printStatus("SKIP", "npm publication status", "--skip-network");
    return;
  }

  await runStep("npm publication status", process.execPath, [npmCliPath, "view", "@packsmith/cli", "version"], {
    timeout: 30000,
    allowFailure: (error) => `${error.stderr ?? ""}${error.stdout ?? ""}`.includes("E404"),
    failureDetail: () => "@packsmith/cli is not published yet"
  });
}

async function main() {
  console.log("Packsmith Hackathon Verification");
  console.log(quick ? "Mode: quick" : "Mode: full");
  console.log("");

  await runStep("demo script parses", process.execPath, ["--check", path.join(repoRoot, "scripts", "hackathon-demo.mjs")], {
    timeout: 30000
  });
  await runStep("verify script parses", process.execPath, ["--check", __filename], {
    timeout: 30000
  });

  if (quick) {
    await runStep("hackathon demo test", process.execPath, ["--test", path.join(repoRoot, "tests", "hackathon-demo.test.mjs")], {
      timeout: 120000
    });
  } else {
    await runStep("full test suite", process.execPath, ["--test"], {
      timeout: 240000
    });
  }

  await runStep("registry quality gate", process.execPath, [path.join(repoRoot, "src", "cli.mjs"), "registry", "validate", "--quality-gate", "85"], {
    timeout: 120000
  });
  await assertPackSurface();
  await checkPublicationStatus();

  const failed = results.filter((result) => result.status === "FAIL");
  console.log("");
  console.log(`Verification summary: ${failed.length === 0 ? "pass" : "fail"}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  process.exitCode = 1;
});
