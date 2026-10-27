#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packaging acceptance for `packsmith doctor` (Wave 1, Codex report P1).
 *
 * Reproduces the real consumer path: npm pack → extract the tarball → run
 * the PACKAGED CLI doctor against a fixture. The knowledge base is a
 * runtime-required asset, so the extraction must contain knowledge-base/
 * and the packaged doctor must work without the source tree.
 *
 * Offline except for nothing: npm pack is local (no registry access), the
 * yaml dependency is copied from the repo's node_modules to stand in for
 * the dependency npm would install. No credentials, no model calls.
 * Repeatable; exits 0/1.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const tarBin = process.platform === "win32" ? "tar.exe" : "tar";

/**
 * Run npm without relying on the npm shim: .cmd shims cannot be spawned
 * directly by spawnSync on Windows (EINVAL), so drive npm through Node with
 * its own npm-cli.js, falling back to the shell shim when the CLI script is
 * not found next to the running Node binary.
 */
function runNpm(args, options = {}) {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

  if (existsSync(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...args], { encoding: "utf8", ...options });
  }

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npmBin, args, { encoding: "utf8", shell: process.platform === "win32", ...options });
}

function fail(step, message) {
  console.error(`SMOKE DOCTOR PACKAGED FAIL [${step}] ${message}`);
  process.exit(1);
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", ...options });
  if (result.error) {
    fail(options.step ?? bin, `cannot spawn ${bin}: ${result.error.message}`);
  }
  return result;
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-doctor-packaged-"));

try {
  // Step 1 — pack the real tarball into the temp directory (--pack-destination
  // keeps the repo root untouched: no workspace packsmith-cli-*.tgz is
  // created or overwritten).
  const packDest = path.join(tempRoot, "packed");
  await mkdir(packDest, { recursive: true });
  const pack = runNpm(["pack", "--json", "--pack-destination", packDest], { cwd: repoRoot });
  if (pack.status !== 0) {
    fail("npm pack", pack.stderr.slice(0, 400));
  }

  let packed;
  try {
    packed = JSON.parse(pack.stdout);
  } catch {
    fail("npm pack", `stdout is not JSON: ${pack.stdout.slice(0, 200)}`);
  }

  const packInfo = Array.isArray(packed) ? packed[0] : packed;
  const tarballPath = path.join(packDest, packInfo.filename);
  if (!existsSync(tarballPath)) {
    fail("npm pack", `${tarballPath} was not created`);
  }

  // Step 2 — extract it. tar runs with cwd = packDest and a relative -f:
  // GNU tar treats a `D:\...` file argument as a remote host (host:path),
  // and both GNU and BSD tar accept a relative name with cwd set.
  const extractDir = path.join(tempRoot, "package");
  const extract = spawnSync(tarBin, ["-xzf", packInfo.filename, "-C", tempRoot], {
    encoding: "utf8",
    cwd: packDest
  });
  if (extract.status !== 0 || extract.error) {
    fail("tar extract", `${extract.error?.message ?? ""} ${extract.stderr?.slice(0, 400)}`);
  }

  // Step 3 — the knowledge base must ship with the package.
  const kbManifest = path.join(extractDir, "knowledge-base", "manifest.json");
  let kbStat;
  try {
    kbStat = await stat(kbManifest);
  } catch {
    kbStat = null;
  }
  if (!kbStat || !kbStat.isFile()) {
    fail("knowledge-base shipped", `${kbManifest} is missing from the packed package`);
  }

  let kbFileCount = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      } else {
        kbFileCount += 1;
      }
    }
  };
  await walk(path.join(extractDir, "knowledge-base"));
  console.log(`SMOKE DOCTOR PACKAGED: knowledge-base ships with ${kbFileCount} files`);

  // Step 4 — stand in for npm installing the yaml dependency.
  const yamlSource = path.join(repoRoot, "node_modules", "yaml");
  try {
    await cp(yamlSource, path.join(extractDir, "node_modules", "yaml"), { recursive: true });
  } catch (error) {
    fail("yaml dependency", `copy ${yamlSource}: ${error.message}`);
  }

  // Step 5 — the packaged doctor must pass a known-good example from
  // inside the extraction, loading the knowledge base relative to itself.
  const doctorOk = run(
    process.execPath,
    [path.join("src", "cli.mjs"), "doctor", path.join("examples", "research-launchpad"), "--format", "json"],
    { cwd: extractDir, step: "packaged doctor (valid example)" }
  );
  if (doctorOk.status !== 0) {
    fail("packaged doctor (valid example)", `exit ${doctorOk.status}: ${doctorOk.stdout.slice(0, 300)} ${doctorOk.stderr.slice(0, 300)}`);
  }

  let okReport;
  try {
    okReport = JSON.parse(doctorOk.stdout);
  } catch {
    fail("packaged doctor (valid example)", `stdout not JSON: ${doctorOk.stdout.slice(0, 200)}`);
  }
  if (okReport.status !== "pass") {
    fail("packaged doctor (valid example)", `status ${okReport.status}: ${doctorOk.stdout.slice(0, 300)}`);
  }

  // Step 6 — the packaged doctor must still detect a broken skill (exit 1).
  const brokenDir = path.join(tempRoot, "broken-skill");
  await mkdir(brokenDir, { recursive: true });
  await writeFile(
    path.join(brokenDir, "SKILL.md"),
    "---\nname: mismatch-here\ndescription: short\n---\n\nBody referencing [gone](references/gone.md).\n",
    "utf8"
  );
  const doctorBroken = run(
    process.execPath,
    [path.join("src", "cli.mjs"), "doctor", brokenDir, "--format", "json"],
    { cwd: extractDir, step: "packaged doctor (broken fixture)" }
  );
  if (doctorBroken.status !== 1) {
    fail("packaged doctor (broken fixture)", `expected exit 1, got ${doctorBroken.status}: ${doctorBroken.stdout.slice(0, 300)}`);
  }
  const brokenReport = JSON.parse(doctorBroken.stdout);
  if (brokenReport.status !== "fail") {
    fail("packaged doctor (broken fixture)", `status ${brokenReport.status}`);
  }

  console.log("SMOKE DOCTOR PACKAGED: PASS (knowledge-base ships; packaged doctor passes example and fails broken fixture)");
} finally {
  // Defensive containment: only ever delete inside the OS temp directory.
  const resolvedTemp = path.resolve(tempRoot);
  if (resolvedTemp.startsWith(path.resolve(os.tmpdir()))) {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.error(`SMOKE DOCTOR PACKAGED WARN: temp root ${resolvedTemp} is outside ${os.tmpdir()}; left in place`);
  }
}
