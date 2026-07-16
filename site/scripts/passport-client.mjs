import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultCacheRoot = path.join(repoRoot, "site", ".cache", "passport");
const packIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadPassport(packId, options = {}) {
  if (typeof packId !== "string" || !packIdPattern.test(packId)) {
    throw new Error(`Invalid Pack ID: ${packId}`);
  }

  const cacheRoot = options.cacheRoot ?? defaultCacheRoot;
  const runRoot = path.join(cacheRoot, `run-${randomUUID()}`);
  const homeDir = path.join(runRoot, "home");
  const stateDir = path.join(runRoot, "state");
  const projectDir = path.join(runRoot, "project");
  let ownsRunRoot = false;

  await mkdir(cacheRoot, { recursive: true });

  try {
    await mkdir(runRoot);
    ownsRunRoot = true;
    await Promise.all([
      mkdir(homeDir),
      mkdir(stateDir),
      mkdir(projectDir)
    ]);

    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(repoRoot, "src", "cli.mjs"), "passport", packId, "--json"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir,
          NO_COLOR: "1"
        },
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      }
    );

    return JSON.parse(stdout);
  } finally {
    if (ownsRunRoot) {
      await rm(runRoot, { recursive: true, force: true });
    }
  }
}
