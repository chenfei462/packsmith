import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { getPublishedPackageStatus } from "./npm-helpers.mjs";
import { loadVerificationSnapshot } from "./verification-status.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function run(label, args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    cwd: repoRoot,
    env: process.env
  });

  process.stdout.write(`\n== ${label} ==\n`);
  process.stdout.write(stdout);

  if (stderr) {
    process.stderr.write(stderr);
  }

  return { stdout };
}

async function main() {
  const smoke = await run("smoke:example", [path.join(repoRoot, "scripts", "smoke.mjs")]);
  const examples = await run("examples:check", [path.join(repoRoot, "scripts", "examples-check.mjs")]);
  const publishedStatus = await getPublishedPackageStatus("@chenfei462/packsmith", { cwd: repoRoot });
  const verification = await loadVerificationSnapshot(repoRoot);
  await run("release:check", [path.join(repoRoot, "scripts", "release-check.mjs")]);

  const exampleCountMatch = examples.stdout.match(/Examples check: OK \((\d+) example pack\(s\)\)/);
  const exampleCount = exampleCountMatch?.[1] ?? "unknown";

  process.stdout.write("\nPacksmith evaluation summary\n");
  process.stdout.write(`- source CLI path: verified\n`);
  process.stdout.write(`- codex bridge artifact: verified\n`);
  process.stdout.write(`- packaged CLI entrypoint: verified\n`);
  process.stdout.write(`- example packs verified: ${exampleCount}\n`);
  process.stdout.write(`- npm package published: ${publishedStatus.published ? "true" : "false"}\n`);
  process.stdout.write(`- verification snapshot: ${path.join(repoRoot, "docs", "verification.md")}\n`);
  process.stdout.write(`- verification snapshot pack files: ${verification.publishFootprint.entryCount}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
