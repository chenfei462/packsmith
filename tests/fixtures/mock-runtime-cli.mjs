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
//   MOCK_SKILL_AUDIT — when "1", the mock emulates `debug prompt-input`
//                      (no model): it prints a synthetic
//                      <skills_instructions> block listing the skills named
//                      in MOCK_AUDIT_SKILLS (comma-separated canonical
//                      SKILL.md paths), minus any disabled by a
//                      `skills.config=[… enabled=false]` override passed
//                      through `-c`.

import { readFile, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);

if (argv.includes("--version")) {
  console.log(process.env.MOCK_VERSION ?? "mock-runtime 1.0.0");
  process.exit(0);
}

// Emulate the no-model skill audit when the invocation is a prompt-input
// call (or MOCK_SKILL_AUDIT is set). Disabled paths come from any
// `-c skills.config=...enabled=false...` override in argv.
if (argv.includes("debug") && argv.includes("prompt-input")) {
  // The target skill locator is synthesized from the audit's cwd (the
  // isolated workspace) plus MOCK_AUDIT_SKILL_NAME, mirroring how Codex
  // reports the workspace-local skill. Extra (global) skills come from
  // MOCK_AUDIT_SKILLS and must be disabled by a scoping override.
  const cwd = process.cwd().replace(/\\/g, "/");
  const targetName = process.env.MOCK_AUDIT_SKILL_NAME ?? "review-pr";
  const skills = [`${cwd}/.agents/skills/${targetName}/SKILL.md`];

  for (const entry of (process.env.MOCK_AUDIT_SKILLS ?? "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      skills.push(trimmed.replace(/\\/g, "/"));
    }
  }

  const disabled = new Set();

  // MOCK_AUDIT_IGNORE_SCOPE=1 emulates a runtime that ignores the scope
  // override entirely (used to prove the caller treats a leaking global
  // skill as a hard failure, never a silent pass).
  if (process.env.MOCK_AUDIT_IGNORE_SCOPE !== "1") {
    for (let index = 0; index < argv.length; index += 1) {
      if (argv[index] === "-c" && typeof argv[index + 1] === "string") {
        const configValue = argv[index + 1];
        for (const match of configValue.matchAll(/path=["']([^"']+)["']\s*,\s*enabled\s*=\s*false/g)) {
          disabled.add(match[1].replace(/\\+/g, "/"));
        }
      }
    }
  }

  const lines = skills
    .filter((entry) => !disabled.has(entry.replace(/\\+/g, "/")))
    .map((entry, idx) => `- skill${idx}: synthetic (file: ${entry})`);

  const block = `<skills_instructions>\n### Available skills\n${lines.join("\n")}\n</skills_instructions>`;
  console.log(JSON.stringify([{ type: "message", role: "developer", content: [{ type: "input_text", text: block }] }]));
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
  for (const key of [
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "CODEX_APP_TOOLS_PIPE_PATH",
    "HOME",
    "USERPROFILE",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "TMP",
    "TEMP",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_STATE_HOME",
    "XDG_DATA_HOME",
    "GIT_DIR",
    "git_config_global",
    "PATH"
  ]) {
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
