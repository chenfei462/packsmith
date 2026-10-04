#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { establishCodexSkillScope } from "../src/trigger/codex-skill-scope.mjs";
import { resolveLaunchEntry } from "../src/runtimes/base.mjs";

/**
 * Actual-discovery audit for Codex skill scoping (v0.2 Milestone 7 gate).
 *
 * NO MODEL is invoked: this drives `codex debug prompt-input` (a local,
 * model-free prompt render) inside a temp workspace containing ONE skill
 * under test, and verifies that the official `skills.config` path selectors
 * reduce the runtime's available-skill set to exactly that skill — the real
 * user's global `.agents/skills` (reachable through the OS home directory
 * regardless of HOME/USERPROFILE/CODEX_HOME) must not survive scoping.
 *
 * Skips cleanly (exit 0 with a note) when the codex CLI is absent, so the
 * suite stays green on machines without it; exits 1 when codex IS present
 * but scoping fails to isolate — a real regression is never skipped.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve the codex binary to a spawnable command: a PATH entry, or the
 * npm shim resolved to its real node/exe entry (Windows shims cannot be
 * spawned directly). Returns null when codex is absent. */
async function resolveCodexBinary() {
  const candidates = [];

  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "npm", "codex.cmd"));
  }

  candidates.push(process.platform === "win32" ? "codex.cmd" : "codex");

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) {
      continue;
    }

    try {
      const entry = await resolveLaunchEntry({
        workspaceDir: os.tmpdir(),
        binaryPath: candidate
      });
      const probe = spawnSync(entry.command, [...entry.args, "--version"], { encoding: "utf8", timeout: 20000, windowsHide: true });

      if (!probe.error && probe.status === 0) {
        return { binaryPath: candidate, version: String(probe.stdout).trim() };
      }
    } catch {
      // try the next candidate
    }
  }

  return null;
}

const resolved = await resolveCodexBinary();

if (resolved === null) {
  console.log("SMOKE CODEX SKILL SCOPE: SKIP (codex CLI not available on this machine)");
  process.exit(0);
}

const version = resolved.version;

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-codex-scope-"));
const workspaceDir = path.join(tempRoot, "workspace");
const skillName = "wave2-scope-probe";
await mkdir(path.join(workspaceDir, ".agents", "skills", skillName), { recursive: true });
await writeFile(
  path.join(workspaceDir, ".agents", "skills", skillName, "SKILL.md"),
  `---\nname: ${skillName}\ndescription: Scope probe skill for the isolation audit.\n---\n\nBody.\n`,
  "utf8"
);

try {
  const scope = await establishCodexSkillScope({
    workspaceDir,
    skillName,
    binaryPath: resolved.binaryPath,
    env: process.env,
    timeoutMs: 120000
  });

  if (scope.scopedSkills !== 1) {
    console.error(`SMOKE CODEX SKILL SCOPE FAIL: ${scope.scopedSkills} skills remained after scoping (expected 1)`);
    process.exit(1);
  }

  if (scope.availableSkills <= 1) {
    console.log(
      `SMOKE CODEX SKILL SCOPE: NOTE (only ${scope.availableSkills} skill available; scoping verified trivially) [${version}]`
    );
    process.exit(0);
  }

  console.log(
    `SMOKE CODEX SKILL SCOPE: PASS (${version}; ${scope.availableSkills} available -> ${scope.scopedSkills} scoped; global skills excluded, target kept)`
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
void __dirname;
