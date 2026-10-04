#!/usr/bin/env node

// Mock runtime CLI for offline adapter tests and the runtimes smoke.
//
// Driven entirely by environment variables — it never touches a model, the
// network, or any account:
//   MOCK_TRACE      — file whose contents are written to stdout (the trace)
//   MOCK_VERSION    — response to a --version probe (default: mock 1.0.0)
//   MOCK_EXIT_CODE  — process exit code (default 0)
//   MOCK_DELAY_MS   — delay before writing the trace (timeout tests)
//   MOCK_STDIN_OUT  — file to record the exact stdin (prompt) received
//   MOCK_ENV_OUT    — file to record selected environment keys received

import { readFile, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);

if (argv.includes("--version")) {
  console.log(process.env.MOCK_VERSION ?? "mock-runtime 1.0.0");
  process.exit(0);
}

const stdinText = await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    data += chunk;
  });
  process.stdin.on("end", () => resolve(data));
  // A missing stdin must not hang the mock.
  process.stdin.on("error", () => resolve(""));
  setTimeout(() => resolve(data), 5000).unref();
});

if (process.env.MOCK_STDIN_OUT) {
  await writeFile(process.env.MOCK_STDIN_OUT, stdinText, "utf8");
}

if (process.env.MOCK_ENV_OUT) {
  const interesting = {};
  for (const key of ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_APP_TOOLS_PIPE_PATH", "HOME", "USERPROFILE", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "TMP", "TEMP"]) {
    if (process.env[key] !== undefined) {
      interesting[key] = process.env[key];
    }
  }
  await writeFile(process.env.MOCK_ENV_OUT, JSON.stringify(interesting, null, 2), "utf8");
}

if (process.env.MOCK_DELAY_MS) {
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.MOCK_DELAY_MS)));
}

if (process.env.MOCK_TRACE) {
  // Binary-safe: the mock replays the trace bytes verbatim, including any
  // invalid UTF-8 sequences injected by tests.
  process.stdout.write(await readFile(process.env.MOCK_TRACE));
}

process.exit(Number(process.env.MOCK_EXIT_CODE ?? 0));
