import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { pathExists } from "../src/lib/fs-utils.mjs";

const execFileAsync = promisify(execFile);

export async function resolveNpmCliPath(nodeExecPath = process.execPath) {
  const nodeDir = path.dirname(nodeExecPath);
  const candidates = [
    path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(process.env.USERPROFILE ?? "", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(process.env.APPDATA ?? "", "npm", "node_modules", "npm", "bin", "npm-cli.js")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(`Could not resolve npm-cli.js from ${nodeExecPath}.`);
}

export async function runNpmCommand(args, options = {}) {
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  const npmCliPath = options.npmCliPath ?? (await resolveNpmCliPath(nodeExecPath));

  return execFileAsync(nodeExecPath, [npmCliPath, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env
    }
  });
}

export async function getPublishedPackageStatus(packageName, options = {}) {
  try {
    const { stdout } = await runNpmCommand(["view", packageName, "version"], options);

    return {
      published: stdout.trim().length > 0,
      version: stdout.trim() || null
    };
  } catch (error) {
    const stderr = error.stderr ?? "";
    const stdout = error.stdout ?? "";
    const output = `${stdout}\n${stderr}`;

    if (/404|not found|could not be found/i.test(output)) {
      return {
        published: false,
        version: null
      };
    }

    throw error;
  }
}

export async function inspectPackedRepo(repoRoot, options = {}) {
  const { stdout } = await runNpmCommand(["pack", "--json", "--dry-run"], {
    ...options,
    cwd: repoRoot
  });
  const parsed = JSON.parse(stdout);
  const result = parsed[0] ?? { files: [] };

  return {
    name: result.name,
    version: result.version,
    id: result.id,
    filename: result.filename,
    size: result.size ?? 0,
    unpackedSize: result.unpackedSize ?? 0,
    shasum: result.shasum ?? null,
    integrity: result.integrity ?? null,
    entryCount: result.entryCount ?? (Array.isArray(result.files) ? result.files.length : 0),
    files: Array.isArray(result.files) ? result.files.map((entry) => entry.path) : []
  };
}

export async function createPacksmithTarball(repoRoot, outputDir, options = {}) {
  const { stdout } = await runNpmCommand(["pack", "--json", "--pack-destination", outputDir], {
    ...options,
    cwd: repoRoot
  });
  const parsed = JSON.parse(stdout);
  const result = parsed[0];

  if (!result?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  return {
    ...result,
    tarballPath: path.join(outputDir, result.filename)
  };
}

export async function resolveInstalledPacksmithBin(prefixDir) {
  const candidates =
    process.platform === "win32"
      ? [path.join(prefixDir, "packsmith.cmd"), path.join(prefixDir, "bin", "packsmith.cmd")]
      : [path.join(prefixDir, "bin", "packsmith")];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find installed packsmith binary under ${prefixDir}.`);
}

export async function installPacksmithTarball(tarballPath, prefixDir, options = {}) {
  await runNpmCommand(["install", "-g", tarballPath, "--prefix", prefixDir], {
    ...options,
    cwd: options.cwd ?? path.dirname(prefixDir)
  });

  return {
    binPath: await resolveInstalledPacksmithBin(prefixDir)
  };
}

export async function runInstalledPacksmith(binPath, args, options = {}) {
  const env = {
    ...process.env,
    ...options.env
  };

  if (process.platform === "win32") {
    return execFileAsync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", binPath, ...args], {
      cwd: options.cwd,
      env
    });
  }

  return execFileAsync(binPath, args, {
    cwd: options.cwd,
    env
  });
}
