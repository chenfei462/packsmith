import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { mkdir, mkdtemp, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

import { fetchBytesWithTimeout, fetchJsonWithTimeout } from "../src/lib/http.mjs";
import { validateRegistry } from "../src/lib/registry.mjs";
import { compareVersion, gcStateCaches } from "../src/lib/pack.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "src", "cli.mjs");
// --import requires a URL, not a Windows path (absolute paths must be file:// URLs).
const loaderPath = new URL("./fixtures/fault-injection-loader.mjs", import.meta.url).href;
const execFileAsync = promisify(execFile);

function runCli(args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = {
    ...process.env,
    NO_COLOR: "1",
    ...options.env
  };
  const nodeArgs = [...(options.loader ? ["--import", loaderPath] : []), cliPath, ...args];

  return execFileAsync(process.execPath, nodeArgs, { cwd, env, timeout: 60_000 });
}

async function writePack(packDir, name) {
  await mkdir(path.join(packDir, "skills", "review"), { recursive: true });
  await mkdir(path.join(packDir, "prompts"), { recursive: true });
  await writeFile(
    path.join(packDir, "packsmith.json"),
    JSON.stringify({
      name,
      description: "Isolated contract-test pack.",
      version: "1.0.0",
      targets: ["codex"],
      permissions: { shell: "none", filesystem: "required", network: "none", browser: "none" },
      skills: [
        {
          id: "review",
          path: "skills/review",
          description: "Review changes when the user asks for risk analysis."
        }
      ],
      prompts: [
        {
          id: "launch",
          path: "prompts/launch.md",
          description: "Prompt for launching a focused review."
        }
      ]
    }),
    "utf8"
  );
  await writeFile(path.join(packDir, "skills", "review", "SKILL.md"), "---\nname: review\n---\nContract skill.\n", "utf8");
  await writeFile(path.join(packDir, "prompts", "launch.md"), "Run the isolated contract test.\n", "utf8");

  return packDir;
}

async function isolation(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    root,
    stateDir: path.join(root, "state"),
    homeDir: path.join(root, "home"),
    env: {
      PACKSMITH_HOME: path.join(root, "state"),
      PACKSMITH_TEST_HOME: path.join(root, "home")
    }
  };
}

function failure(result) {
  return result instanceof Error ? result : undefined;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }

  return files.sort();
}

test("安装中途失败时恢复旧目录", async () => {
  const env = await isolation("packsmith-contract-rollback-");
  const packDir = path.join(env.root, "rollback-pack");
  const installedFile = path.join(env.homeDir, ".codex", "skills", "rollback-pack", "AGENTS.md");

  await writePack(packDir, "rollback-pack");
  await runCli(["install", packDir, "--target", "codex"], { env: env.env });
  const before = await readFile(installedFile, "utf8");
  assert.match(before, /rollback-pack/i);

  await assert.rejects(
    runCli(["install", packDir, "--target", "codex"], {
      env: { ...env.env, PACKSMITH_FAULT_COPY: "1" },
      loader: true
    }),
    /Injected copy failure/
  );

  assert.equal(await readFile(installedFile, "utf8"), before, "旧安装必须在失败后保持原样");
  await stat(path.join(env.stateDir, "receipts", "rollback-pack.codex.json"));
});

test("八路并发安装生成合法且完整的锁文件", async () => {
  const env = await isolation("packsmith-contract-concurrent-");
  const packDirs = await Promise.all(
    Array.from({ length: 8 }, (_, index) => writePack(path.join(env.root, `concurrent-${index}`), `concurrent-${index}`))
  );

  await Promise.all(
    packDirs.map((packDir) => runCli(["install", packDir, "--target", "codex"], { env: env.env }))
  );

  const lockfile = JSON.parse(await readFile(path.join(env.stateDir, "packsmith.lock"), "utf8"));
  assert.equal(lockfile.installed.length, 8);
  assert.deepEqual(lockfile.installed.map((entry) => entry.pack).sort(), packDirs.map((_, index) => `concurrent-${index}`));
});

test("未知旗标以用法错误退出且不安装", async () => {
  const env = await isolation("packsmith-contract-unknown-flag-");

  await assert.rejects(
    runCli(["install", "unknown-flag-pack", "--targt", "codex"], { env: env.env }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Unknown flag --targt/);
      return true;
    }
  );

  await assert.rejects(stat(path.join(env.stateDir, "packsmith.lock")), { code: "ENOENT" });
  await assert.rejects(stat(path.join(env.homeDir, ".codex", "skills", "unknown-flag-pack")), { code: "ENOENT" });
});

test("5xx 与挂起响应在短超时内失败", async (t) => {
  const openSockets = new Set();
  const server = createServer((request, response) => {
    if (request.url === "/server-error") {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("temporarily unavailable");
      return;
    }
  });
  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of openSockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The fetch layer requires HTTPS unless the host is explicitly allow-listed;
  // contract tests talk to a local HTTP server.
  process.env.PACKSMITH_ALLOWED_FETCH_HOSTS = "127.0.0.1,localhost";

  await assert.rejects(
    fetchJsonWithTimeout(`${origin}/server-error`, {
      timeoutMs: 200,
      maxRetries: 0,
      baseDelayMs: 0
    }),
    /HTTP 503/
  );

  const startedAt = Date.now();
  await assert.rejects(
    fetchBytesWithTimeout(`${origin}/hanging`, {
      timeoutMs: 50,
      maxRetries: 0,
      baseDelayMs: 0
    }),
    /timed out after 50ms/
  );
  assert.ok(Date.now() - startedAt < 1_000, "挂起请求必须在秒级快速失败");
});

test("--json 模式失败时输出带版本的结构化信封", async () => {
  const env = await isolation("packsmith-contract-json-envelope-");
  let error;
  try {
    // `show` fails for an unknown pack; `search` legitimately returns an empty
    // result set, so it cannot be used to exercise the failure envelope.
    await runCli(["show", "pack-that-does-not-exist", "--json"], { env: env.env });
  } catch (cause) {
    error = cause;
  }
  assert.ok(error, "不存在的 registry 包必须失败");
  assert.equal(error.code, 1);
  const envelope = JSON.parse(error.stdout);

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "runtime_error");
  assert.match(envelope.error.message, /not found in registry/);
  assert.equal(error.stderr, "");
});

test("registry 过滤 __proto__ 键且不污染对象原型", async () => {
  const env = await isolation("packsmith-contract-proto-");
  const catalogPath = path.join(env.root, "catalog.json");
  const raw = JSON.stringify({
    schemaVersion: 1,
    packs: [{
      id: "proto-pack",
      name: "Proto Pack",
      description: "Catalog pollution probe.",
      version: "1.0.0",
      targets: ["codex"],
      author: "contract-test",
      category: "security",
      tags: [],
      source: "https://example.invalid/proto-pack",
      license: "MIT",
      riskLevel: "low",
      estimatedContextSize: 1,
      usageExample: "packsmith install proto-pack",
      verified: false,
      sourceMeta: { __proto__: { polluted: true }, safe: true }
    }]
  });
  await writeFile(catalogPath, raw, "utf8");

  const result = await validateRegistry({ registry: catalogPath });
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(result.catalog.packs[0].sourceMeta, "__proto__"), false);
  assert.equal(result.catalog.packs[0].sourceMeta.safe, true);
});

test("registry 对类型错乱返回校验问题而不崩溃", async () => {
  const env = await isolation("packsmith-contract-types-");
  const catalogPath = path.join(env.root, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({
      schemaVersion: 1,
      packs: [{
        id: "bad-types",
        name: "Bad Types",
        description: "Deliberately malformed catalog entry.",
        version: "1.0.0",
        targets: "codex",
        tags: {},
        source: 42,
        estimatedContextSize: "large",
        verified: false
      }]
    }),
    "utf8"
  );

  const result = await validateRegistry({ registry: catalogPath });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => /tags/.test(issue)), "tags 类型错乱必须报告");
  assert.ok(result.issues.some((issue) => /targets|at least one target/.test(issue)), "targets 类型错乱必须报告");
  assert.ok(result.issues.some((issue) => /source/.test(issue)), "source 类型错乱必须报告");
  assert.ok(result.issues.some((issue) => /estimatedContextSize/.test(issue)));
});

test("registry 拒绝超大 catalog 且不会耗尽内存", async () => {
  const env = await isolation("packsmith-contract-oversized-");
  const catalogPath = path.join(env.root, "catalog.json");
  await writeFile(
    catalogPath,
    `{"schemaVersion":1,"packs":[],"padding":"${"x".repeat(5 * 1024 * 1024 + 1)}"}`,
    "utf8"
  );

  await assert.rejects(validateRegistry({ registry: catalogPath }), /exceeds maximum size/);
  assert.equal(failure(), undefined);
});

test("compareVersion 遵循 semver 优先级规则（#43）", () => {
  assert.equal(compareVersion("1.2.3", "1.2.3"), 0);
  assert.ok(compareVersion("1.2.3", "1.2.4") < 0);
  assert.ok(compareVersion("2.0", "1.9.9") > 0);
  assert.ok(compareVersion("1.0.0-alpha", "1.0.0") < 0, "prerelease 低于正式版");
  assert.ok(compareVersion("1.0.0-alpha.1", "1.0.0-alpha.beta") < 0, "数字段低于字母段");
  assert.ok(compareVersion("1.0.0-beta", "1.0.0-alpha") > 0);
  assert.equal(compareVersion("1.0.0+b1", "1.0.0+b2"), 0, "build metadata 不参与优先级");
  assert.equal(compareVersion("1.0.0-alpha+b1", "1.0.0-alpha"), 0);
});

test("gcStateCaches 清理过期与超限的缓存目录（#14）", async () => {
  const env = await isolation("packsmith-contract-gc-");
  const buildDir = path.join(env.stateDir, "build-cache");
  const staleDir = path.join(buildDir, "stale-entry");
  const freshDir = path.join(buildDir, "fresh-entry");
  await mkdir(path.join(staleDir, "payload"), { recursive: true });
  await mkdir(path.join(freshDir, "payload"), { recursive: true });
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await utimes(staleDir, eightDaysAgo, eightDaysAgo);

  await gcStateCaches(env.stateDir);

  await assert.rejects(stat(staleDir), undefined, "超过 TTL 的条目必须被清理");
  await stat(freshDir);

  for (let index = 0; index < 66; index += 1) {
    const dir = path.join(buildDir, `cap-${String(index).padStart(3, "0")}`);
    await mkdir(dir, { recursive: true });
    const mtime = new Date(Date.now() - (66 - index) * 1000);
    await utimes(dir, mtime, mtime);
  }

  await gcStateCaches(env.stateDir);

  const remaining = await readdir(buildDir);
  assert.ok(remaining.length <= 64, `缓存应保留至多 64 个条目，实际 ${remaining.length}`);
  assert.equal(remaining.includes("cap-000"), false, "最旧的条目必须先被清理");
  assert.equal(remaining.includes("cap-065"), true, "最新的条目必须保留");
  assert.equal(remaining.includes("fresh-entry"), true);
});

test("GitHub 源安装复用本地缓存，不再重复下载（#14）", async () => {
  const env = await isolation("packsmith-contract-ghcache-");
  const sourceDir = path.join(env.root, "repo-source", "packs", "gh-cache-pack");
  await writePack(sourceDir, "gh-cache-pack");

  const relativeFiles = (await listFiles(sourceDir)).map((file) =>
    path.relative(sourceDir, file).split(path.sep).join("/")
  );
  const rawRoutes = {};
  for (const relativeFile of relativeFiles) {
    rawRoutes[`/raw/${relativeFile}`] = await readFile(path.join(sourceDir, relativeFile), "utf8");
  }

  const server = createServer((req, res) => {
    const pathname = req.url.split("?")[0];

    if (pathname === "/github-api/repos/demo/repo/contents/packs/gh-cache-pack") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          relativeFiles.map((relativeFile) => ({
            name: relativeFile.split("/").pop(),
            path: `packs/gh-cache-pack/${relativeFile}`,
            type: "file",
            download_url: `http://127.0.0.1:${server.address().port}/raw/${relativeFile}`
          }))
        )
      );
      return;
    }

    if (rawRoutes[pathname] !== undefined) {
      res.setHeader("content-type", "text/plain");
      res.end(rawRoutes[pathname]);
      return;
    }

    res.statusCode = 404;
    res.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const catalogPath = path.join(env.root, "catalog.json");
    await writeFile(
      catalogPath,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-05-25T00:00:00.000Z",
        packs: [
          {
            id: "gh-cache-pack",
            name: "GH Cache Pack",
            description: "Pack whose GitHub source must be cached across installs.",
            version: "0.1.0",
            author: "demo",
            category: "code-quality",
            tags: ["cache"],
            targets: ["codex"],
            source: {
              type: "github-archive",
              repo: "demo/repo",
              path: "packs/gh-cache-pack",
              ref: "v1",
              commit: "0123456789abcdef0123456789abcdef01234567",
              apiBaseUrl: `${origin}/github-api`
            },
            license: "MIT",
            riskLevel: "low",
            estimatedContextSize: 1200,
            usageExample: "packsmith install gh-cache-pack",
            verified: false,
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ]
      })
    );

    const envWithAllowlist = {
      ...env.env,
      PACKSMITH_ALLOWED_FETCH_HOSTS: "127.0.0.1,localhost"
    };

    await runCli(["install", "gh-cache-pack", "--registry", catalogPath, "--target", "codex"], {
      env: envWithAllowlist
    });
    await stat(path.join(env.homeDir, ".codex", "skills", "gh-cache-pack", "AGENTS.md"));

    // 关闭下载源后再装一次：缓存必须复用，第二次安装不能有任何网络请求。
    await new Promise((resolve) => server.close(resolve));
    await runCli(["install", "gh-cache-pack", "--registry", catalogPath, "--target", "codex"], {
      env: envWithAllowlist
    });
    await stat(path.join(env.homeDir, ".codex", "skills", "gh-cache-pack", "AGENTS.md"));
  } finally {
    server.close();
  }
});
