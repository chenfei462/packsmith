import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function fileSize(filePath) {
  const details = await stat(filePath);
  return details.size;
}

export async function countDirectoryFiles(dirPath) {
  let count = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      count += await countDirectoryFiles(entryPath);
    } else {
      count += 1;
    }
  }

  return count;
}

export async function directorySize(dirPath) {
  let total = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else {
      total += await fileSize(entryPath);
    }
  }

  return total;
}

export async function copyDirectory(sourceDir, targetDir) {
  await ensureDir(path.dirname(targetDir));
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

export async function copyFileOrDirectory(sourcePath, targetPath) {
  await ensureDir(path.dirname(targetPath));
  await cp(sourcePath, targetPath, { recursive: true, force: true });
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, "utf8");
}
