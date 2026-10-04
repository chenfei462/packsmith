import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp } from "node:fs/promises";

import { cursorAdapter } from "../../src/runtimes/cursor.mjs";
import { geminiCliAdapter } from "../../src/runtimes/gemini-cli.mjs";
import { opencodeAdapter } from "../../src/runtimes/opencode.mjs";

/**
 * Static-only runtime adapters (v0.2 Milestone 6, plan §15): Cursor, Gemini
 * CLI and OpenCode receive detect/version/capabilities and static
 * compatibility metadata only — live trigger runs report `unsupported`,
 * which is an execution state distinct from every binary metric.
 */

const STATIC_ADAPTERS = [
  ["cursor", cursorAdapter],
  ["gemini-cli", geminiCliAdapter],
  ["opencode", opencodeAdapter]
];

for (const [id, adapter] of STATIC_ADAPTERS) {
  test(`${id} exposes the full adapter contract with static-only scope`, () => {
    assert.equal(adapter.id, id);
    for (const method of ["detect", "version", "capabilities", "prepareWorkspace", "runTriggerCase", "parseTrace"]) {
      assert.equal(typeof adapter[method], "function", `${id}.${method} must exist`);
    }

    const capabilities = adapter.capabilities();
    assert.equal(capabilities.staticCompatibility, true);
    assert.equal(capabilities.liveTriggerRunner, false);
  });

  test(`${id} reports unsupported (not infra, not not_triggered) for live runs`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "packsmith-static-runtime-"));
    const context = {
      workspaceDir: path.join(root, "ws"),
      traceDir: path.join(root, "runs"),
      homeDir: path.join(root, "home"),
      runtimeStateDir: path.join(root, "state"),
      tempDir: path.join(root, "tmp"),
      timeoutMs: 1000
    };

    const result = await adapter.runTriggerCase({ skill: "review-pr", prompt: "p", context });

    assert.equal(result.status, "unsupported");
    assert.equal(result.runtime, id);
    assert.ok(result.evidence.some((entry) => entry.kind === "unsupported"));
  });

  test(`${id} parseTrace reports unsupported rather than guessing`, () => {
    const parsed = adapter.parseTrace("{}", { skillName: "review-pr" });
    assert.equal(parsed.status, "unsupported");
  });
}
