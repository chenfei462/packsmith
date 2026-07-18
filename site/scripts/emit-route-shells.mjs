import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

function validatePackIds(packIds) {
  if (!Array.isArray(packIds)) {
    throw new TypeError("packIds must be an array");
  }

  if (packIds.length === 0) {
    throw new TypeError("packIds must contain at least one pack ID");
  }

  const seenPackIds = new Set();

  return packIds.map((packId, index) => {
    if (
      typeof packId !== "string" ||
      !CATALOG_SLUG_PATTERN.test(packId) ||
      WINDOWS_RESERVED_NAME_PATTERN.test(packId)
    ) {
      throw new TypeError(`Invalid pack ID at index ${index}: ${JSON.stringify(packId)}`);
    }

    if (seenPackIds.has(packId)) {
      throw new TypeError(`Duplicate pack ID at index ${index}: ${JSON.stringify(packId)}`);
    }

    seenPackIds.add(packId);
    return packId;
  });
}

export async function emitRouteShells({ distDir, packIds }) {
  const validatedPackIds = validatePackIds(packIds);
  const indexBytes = await readFile(path.join(distDir, "index.html"));
  const shellPaths = [
    path.join(distDir, "registry", "index.html"),
    path.join(distDir, "docs", "index.html"),
    ...validatedPackIds.map((packId) =>
      path.join(distDir, "registry", packId, "index.html")
    ),
    path.join(distDir, "404.html")
  ];

  for (const shellPath of shellPaths) {
    await mkdir(path.dirname(shellPath), { recursive: true });
    await writeFile(shellPath, indexBytes);
  }
}

function packIdsFromRepositoryData(repositoryData) {
  if (
    repositoryData === null ||
    typeof repositoryData !== "object" ||
    Array.isArray(repositoryData) ||
    !Array.isArray(repositoryData.packs)
  ) {
    throw new TypeError("repository-data.json must contain a packs array");
  }

  return repositoryData.packs.map((pack, index) => {
    if (pack === null || typeof pack !== "object" || Array.isArray(pack)) {
      throw new TypeError(`repository-data.json packs[${index}] must be an object`);
    }

    return pack.id;
  });
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const siteDir = path.resolve(path.dirname(scriptPath), "..");
  const repositoryDataPath = path.join(
    siteDir,
    "src",
    "generated",
    "repository-data.json"
  );
  const repositoryData = JSON.parse(await readFile(repositoryDataPath, "utf8"));

  await emitRouteShells({
    distDir: path.join(siteDir, "dist"),
    packIds: packIdsFromRepositoryData(repositoryData)
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
