import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile, open } from "node:fs/promises";
import { openSync, fsyncSync, closeSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_JSON_SIZE = 5 * 1024 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor"]);

function filterDangerousKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(filterDangerousKeys);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    result[key] = filterDangerousKeys(value);
  }
  return result;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  if (content.length > MAX_JSON_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_JSON_SIZE} bytes: ${content.length} bytes read.`);
  }
  const parsed = JSON.parse(content);
  return filterDangerousKeys(parsed);
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function removePath(filePath) {
  await rm(filePath, { recursive: true, force: true });
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

export async function listDirectoryFiles(dirPath, rootDir = dirPath) {
  const files = [];
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listDirectoryFiles(entryPath, rootDir)));
    } else {
      files.push(path.relative(rootDir, entryPath));
    }
  }

  return files.sort();
}

export async function copyDirectory(sourceDir, targetDir) {
  await ensureDir(path.dirname(targetDir));
  
  // Check for and reject symbolic links in the source directory tree
  // Synchronized with assertNoSymlinks in pack.mjs
  const checkSourceForLinks = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic link not allowed in source directory: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        await checkSourceForLinks(entryPath);
      }
    }
  };
  
  // Use the same assertNoSymlinks check for consistency
  await assertNoSymlinks(sourceDir);
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

// Add assertNoSymlinks to fs-utils.mjs for consistency with pack.mjs
async function assertNoSymlinks(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic link not allowed in source directory: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath);
    }
  }
}

export async function copyFileOrDirectory(sourcePath, targetPath) {
  await ensureDir(path.dirname(targetPath));
  await cp(sourcePath, targetPath, { recursive: true, force: true });
}

export async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    // Try to fsync for durability; if not permitted (e.g., Windows), continue anyway
    const dirFd = fsPromises.open(path.dirname(filePath), "r").catch(() => null);
    if (dirFd) {
      const fd = await dirFd;
      try {
        await fd.sync();
      } catch {
        // fsync may not be permitted on some filesystems (e.g., Windows NTFS)
      } finally {
        await fd.close();
      }
    }
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

// Reentrancy registry (#4): update/sync hold the state lock while calling
// installPack, which acquires the same lock — same-process nesting must not
// deadlock. Keyed by resolved lock path, tracking the open fd and depth.
const heldStateLocks = new Map();

export async function withStateLock(stateDir, fn) {
  await ensureDir(stateDir);
  const lockPath = path.join(stateDir, ".packsmith.lock");
  const lockKey = path.resolve(lockPath);
  const maxRetries = 50;
  const retryDelayMs = 100;
  let fd;

  const held = heldStateLocks.get(lockKey);
  if (held) {
    held.depth += 1;
    try {
      return await fn();
    } finally {
      held.depth -= 1;
      if (held.depth === 0) {
        heldStateLocks.delete(lockKey);
        await rm(lockPath, { force: true });
        try {
          await held.fd.close();
        } catch {
          // The lock file is already removed; closing a closed fd is harmless.
        }
      }
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // "wx" creates the file exclusively; write the owning pid in the same
      // open so a competitor can never observe an empty lock file (which would
      // otherwise look stale and get deleted out from under the holder).
      fd = await open(lockPath, "wx");
      await fd.writeFile(JSON.stringify({ pid: process.pid }), "utf8");
      await fd.sync().catch(() => {});
      break;
    } catch (error) {
      try {
        await fd?.close();
      } catch {
        // The lock was never usable; nothing to release.
      }
      fd = undefined;

      if (error.code === "EEXIST") {
        let holderPid = null;
        let readable = false;

        try {
          const content = await readFile(lockPath, "utf8");
          const parsed = JSON.parse(content);
          readable = true;
          if (typeof parsed?.pid === "number") {
            holderPid = parsed.pid;
          }
        } catch {
          readable = false;
        }

        if (readable && holderPid !== null && isProcessAlive(holderPid)) {
          // A live holder owns this lock; wait for it to finish.
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }

        if (!readable) {
          // Empty/unreadable lock file. It is either mid-creation by a process
          // that has not written its pid yet, or genuine debris. Only reclaim
          // it after it has been unreadable for longer than a full retry cycle,
          // so a slow creator is not robbed of its lock.
          try {
            const { mtimeMs } = await stat(lockPath);
            if (Date.now() - mtimeMs < retryDelayMs * 2) {
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              continue;
            }
          } catch {
            // The file vanished between attempts; just retry the open.
            continue;
          }
        }

        // Readable with a dead owner, or unreadable and old: safe to reclaim.
        await rm(lockPath, { force: true }).catch(() => {});
        continue;
      }

      throw error;
    }
  }

  if (!fd) {
    throw new Error(`Could not acquire state lock after ${maxRetries} attempts`);
  }

  heldStateLocks.set(lockKey, { fd, depth: 1 });

  try {
    return await fn();
  } finally {
    heldStateLocks.delete(lockKey);
    await rm(lockPath, { force: true });
    try {
      await fd.close();
    } catch {
      // The lock file is already removed; closing a closed fd is harmless.
    }
  }
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, "utf8");
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function containsAdsColon(value) {
  return typeof value === "string" && value.includes(":");
}

export { containsAdsColon };
