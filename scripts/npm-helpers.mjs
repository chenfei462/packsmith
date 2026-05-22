import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { copyFileOrDirectory, ensureDir, pathExists, readJson, removePath, writeJson, writeText } from "../src/lib/fs-utils.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function normalizePackageFilename(packageName) {
  return packageName.includes("/") ? packageName.slice(packageName.lastIndexOf("/") + 1) : packageName;
}

async function resolveNpmCliPath() {
  const candidates = [];

  try {
    const npmPackageJsonPath = require.resolve("npm/package.json");
    candidates.push(path.join(path.dirname(npmPackageJsonPath), "bin", "npm-cli.js"));
  } catch {
    // No bundled npm package in this environment.
  }

  const execDir = path.dirname(process.execPath);
  candidates.push(path.join(execDir, "node_modules", "npm", "bin", "npm-cli.js"));
  candidates.push(path.join(execDir, "..", "node_modules", "npm", "bin", "npm-cli.js"));

  for (const candidate of candidates) {
    if (candidate && (await pathExists(candidate))) {
      return candidate;
    }
  }

  return null;
}

async function runOfficialNpmCommand(args, options = {}) {
  const npmCliPath = await resolveNpmCliPath();

  if (!npmCliPath) {
    return null;
  }

  return execFileAsync(process.execPath, [npmCliPath, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env
    }
  });
}

async function listFilesRecursive(dirPath, prefix = "") {
  const entries = (await readdir(dirPath, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? toPosixPath(path.posix.join(prefix, entry.name)) : toPosixPath(entry.name);
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath, relativePath)));
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

async function addSelectedPath(selectedFiles, repoRoot, relativePath) {
  const normalizedRelativePath = toPosixPath(relativePath);
  const absolutePath = path.join(repoRoot, normalizedRelativePath);

  if (!(await pathExists(absolutePath))) {
    return;
  }

  const details = await stat(absolutePath);

  if (details.isDirectory()) {
    const nestedFiles = await listFilesRecursive(absolutePath, normalizedRelativePath);

    for (const nestedFile of nestedFiles) {
      selectedFiles.add(nestedFile);
    }

    return;
  }

  selectedFiles.add(normalizedRelativePath);
}

async function collectPackFiles(repoRoot, packageJson) {
  const selectedFiles = new Set();

  selectedFiles.add("package.json");

  if (await pathExists(path.join(repoRoot, "README.md"))) {
    selectedFiles.add("README.md");
  }

  if (await pathExists(path.join(repoRoot, "LICENSE"))) {
    selectedFiles.add("LICENSE");
  }

  if (Array.isArray(packageJson.files) && packageJson.files.length > 0) {
    for (const entry of packageJson.files) {
      await addSelectedPath(selectedFiles, repoRoot, entry);
    }
  } else {
    const allFiles = await listFilesRecursive(repoRoot);

    for (const filePath of allFiles) {
      if (
        filePath === ".npmignore" ||
        filePath.startsWith(".git/") ||
        filePath.startsWith(".github/") ||
        filePath.startsWith("docs/") ||
        filePath.startsWith("examples/") ||
        filePath.startsWith("scripts/") ||
        filePath.startsWith("tests/") ||
        filePath.startsWith("temp-") ||
        filePath.startsWith("node_modules/")
      ) {
        continue;
      }

      selectedFiles.add(filePath);
    }
  }

  return [...selectedFiles].sort((left, right) => left.localeCompare(right));
}

async function readPackageJson(repoRoot) {
  return readJson(path.join(repoRoot, "package.json"));
}

async function hashPackFiles(repoRoot, files) {
  const sha1 = crypto.createHash("sha1");
  const sha512 = crypto.createHash("sha512");
  let totalSize = 0;

  for (const filePath of files) {
    const bytes = await readFile(path.join(repoRoot, filePath));
    totalSize += bytes.byteLength;
    sha1.update(filePath);
    sha1.update("\0");
    sha1.update(bytes);
    sha512.update(filePath);
    sha512.update("\0");
    sha512.update(bytes);
  }

  return {
    totalSize,
    shasum: sha1.digest("hex"),
    integrity: `sha512-${sha512.digest("base64")}`
  };
}

function buildPackMetadata(packageJson, files) {
  return {
    name: packageJson.name,
    version: packageJson.version,
    id: `${packageJson.name}@${packageJson.version}`,
    filename: `${normalizePackageFilename(packageJson.name)}-${packageJson.version}.tgz`,
    entryCount: files.length,
    files
  };
}

async function buildCustomPackArchive(repoRoot, outputDir) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const absoluteOutputDir = path.resolve(outputDir);
  const packageJson = await readPackageJson(absoluteRepoRoot);
  const files = await collectPackFiles(absoluteRepoRoot, packageJson);
  const metadata = buildPackMetadata(packageJson, files);
  const fingerprint = await hashPackFiles(absoluteRepoRoot, files);
  const tarballPath = path.join(absoluteOutputDir, metadata.filename);
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-pack-"));
  const packageDir = path.join(stagingRoot, "package");

  await ensureDir(absoluteOutputDir);
  await ensureDir(packageDir);

  try {
    for (const filePath of files) {
      const sourcePath = path.join(absoluteRepoRoot, filePath);
      const targetPath = path.join(packageDir, filePath);
      await copyFileOrDirectory(sourcePath, targetPath);
    }

    const archivePaths = files.map((filePath) => toPosixPath(path.posix.join("package", filePath)));
    await execFileAsync("tar", ["-czf", tarballPath, "-C", stagingRoot, ...archivePaths]);

    return {
      ...metadata,
      size: fingerprint.totalSize,
      unpackedSize: fingerprint.totalSize,
      shasum: fingerprint.shasum,
      integrity: fingerprint.integrity,
      tarballPath
    };
  } finally {
    await removePath(stagingRoot);
  }
}

async function parseOfficialPackResult(stdout) {
  const parsed = JSON.parse(stdout);
  const result = parsed[0];

  if (!result) {
    throw new Error("npm pack did not return a result.");
  }

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

export async function getPublishedPackageStatus(packageName) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return {
        published: false,
        version: null
      };
    }

    const registryData = await response.json();
    const latestVersion = registryData?.["dist-tags"]?.latest ?? registryData?.version ?? null;

    return {
      published: typeof latestVersion === "string" && latestVersion.length > 0,
      version: typeof latestVersion === "string" && latestVersion.length > 0 ? latestVersion : null
    };
  } catch {
    return {
      published: false,
      version: null
    };
  }
}

export async function inspectPackedRepo(repoRoot, options = {}) {
  if (options.deterministic) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-inspect-"));

    try {
      const result = await buildCustomPackArchive(repoRoot, tempRoot);

      return {
        name: result.name,
        version: result.version,
        id: result.id,
        filename: result.filename,
        size: result.size,
        unpackedSize: result.unpackedSize,
        shasum: result.shasum,
        integrity: result.integrity,
        entryCount: result.entryCount,
        files: result.files
      };
    } finally {
      await removePath(tempRoot);
    }
  }

  const official = await runOfficialNpmCommand(["pack", "--json", "--dry-run"], {
    ...options,
    cwd: repoRoot
  });

  if (official) {
    return parseOfficialPackResult(official.stdout);
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-inspect-"));

  try {
    const result = await buildCustomPackArchive(repoRoot, tempRoot);

    return {
      name: result.name,
      version: result.version,
      id: result.id,
      filename: result.filename,
      size: result.size,
      unpackedSize: result.unpackedSize,
      shasum: result.shasum,
      integrity: result.integrity,
      entryCount: result.entryCount,
      files: result.files
    };
  } finally {
    await removePath(tempRoot);
  }
}

export async function createPacksmithTarball(repoRoot, outputDir, options = {}) {
  const official = await runOfficialNpmCommand(["pack", "--json", "--pack-destination", outputDir], {
    ...options,
    cwd: repoRoot
  });

  if (official) {
    const result = await parseOfficialPackResult(official.stdout);

    return {
      ...result,
      tarballPath: path.join(path.resolve(outputDir), result.filename)
    };
  }

  return buildCustomPackArchive(repoRoot, outputDir);
}

export async function resolveInstalledPacksmithBin(prefixDir) {
  const candidates =
    process.platform === "win32"
      ? [path.join(prefixDir, "bin", "packsmith.mjs"), path.join(prefixDir, "packsmith.mjs"), path.join(prefixDir, "packsmith.cmd"), path.join(prefixDir, "bin", "packsmith.cmd")]
      : [path.join(prefixDir, "bin", "packsmith.mjs"), path.join(prefixDir, "bin", "packsmith")];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find installed packsmith binary under ${prefixDir}.`);
}

async function extractTarball(tarballPath, destinationDir) {
  await ensureDir(destinationDir);
  await execFileAsync("tar", ["-xzf", tarballPath, "-C", destinationDir]);
}

async function findPackedEntryDir(extractDir) {
  const entries = (await readdir(extractDir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(extractDir, entry.name, "package.json");

    if (await pathExists(manifestPath)) {
      return path.join(extractDir, entry.name);
    }
  }

  throw new Error("Could not locate extracted package directory.");
}

function buildPackageRoot(prefixDir, packageName) {
  const segments = packageName.startsWith("@") ? packageName.split("/") : [packageName];
  return path.join(prefixDir, "node_modules", ...segments);
}

export async function installPacksmithTarball(tarballPath, prefixDir) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-install-"));
  const extractDir = path.join(tempRoot, "extract");

  try {
    await extractTarball(tarballPath, extractDir);
    const packedEntryDir = await findPackedEntryDir(extractDir);
    const manifest = await readJson(path.join(packedEntryDir, "package.json"));
    const packageRoot = buildPackageRoot(prefixDir, manifest.name);
    const cliSource = path.join(packageRoot, "src", "cli.mjs");
    const launcherPath = path.join(prefixDir, "bin", "packsmith.mjs");

    await removePath(packageRoot);
    await copyFileOrDirectory(packedEntryDir, packageRoot);

    const rootWrapper = path.join(prefixDir, "packsmith.cmd");
    const binDir = path.join(prefixDir, "bin");
    const binWrapper = path.join(binDir, "packsmith.cmd");
    const shellWrapper = path.join(binDir, "packsmith");
    const launcherContent = `const cli = await import(${JSON.stringify(pathToFileURL(cliSource).href)});

cli.runCli(process.argv.slice(2)).catch(cli.reportCliError);
`;
    const windowsWrapper = `@ECHO OFF
node "${cliSource}" %*
`;

    await ensureDir(prefixDir);
    await ensureDir(binDir);
    await writeText(launcherPath, launcherContent);
    await writeText(rootWrapper, windowsWrapper);
    await writeText(binWrapper, windowsWrapper);

    if (process.platform !== "win32") {
      await writeText(
        shellWrapper,
        `#!/usr/bin/env sh
exec node "${launcherPath}" "$@"
`
      );
      await chmod(shellWrapper, 0o755);
      await chmod(launcherPath, 0o755);
    }

    return {
      binPath: await resolveInstalledPacksmithBin(prefixDir)
    };
  } finally {
    await removePath(tempRoot);
  }
}

export async function runInstalledPacksmith(binPath, args, options = {}) {
  const env = {
    ...process.env,
    ...options.env
  };

  if (binPath.endsWith(".mjs") || binPath.endsWith(".cjs")) {
    return execFileAsync(process.execPath, [binPath, ...args], {
      cwd: options.cwd,
      env
    });
  }

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
