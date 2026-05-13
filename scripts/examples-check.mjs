import os from "node:os";
import path from "node:path";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildPack, validatePack } from "../src/lib/pack.mjs";
import { pathExists, removePath } from "../src/lib/fs-utils.mjs";

async function findExamplePacks(examplesRoot) {
  const entries = await readdir(examplesRoot, { withFileTypes: true });
  const exampleDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const exampleDir = path.join(examplesRoot, entry.name);
    const manifestPath = path.join(exampleDir, "packsmith.json");

    try {
      await stat(manifestPath);
      exampleDirs.push(exampleDir);
    } catch {
      continue;
    }
  }

  return exampleDirs.sort((left, right) => left.localeCompare(right));
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");
  const examplesRoot = path.resolve(process.env.PACKSMITH_EXAMPLES_ROOT ?? path.join(repoRoot, "examples"));
  const exampleDirs = await findExamplePacks(examplesRoot);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-examples-check-"));

  try {
    for (const exampleDir of exampleDirs) {
      const result = await validatePack(exampleDir, { strict: true });
      console.log(`Validated example "${result.manifest.name}" with ${result.skillCount} skill(s) and ${result.promptCount} prompt(s).`);

      const buildRoot = path.join(tempRoot, result.manifest.name);
      const built = await buildPack(exampleDir, buildRoot);
      console.log(`Built example "${built.manifest.name}" for ${built.targetsBuilt.join(", ")} in temp space.`);

      if (built.targetsBuilt.includes("claude-code")) {
        const claudeBundlePath = path.join(built.outputRoot, "claude-code", "bundle.json");

        if (!(await pathExists(claudeBundlePath))) {
          throw new Error(`Missing Claude Code bundle metadata for "${built.manifest.name}": ${claudeBundlePath}`);
        }

        for (const skill of built.manifest.skills) {
          const builtSkillPath = path.join(built.outputRoot, "claude-code", "skills", skill.id, "SKILL.md");

          if (!(await pathExists(builtSkillPath))) {
            throw new Error(`Missing built Claude Code skill "${skill.id}" for "${built.manifest.name}": ${builtSkillPath}`);
          }
        }

        for (const prompt of built.manifest.prompts ?? []) {
          const promptFileName = path.basename(prompt.path);
          const builtClaudePromptPath = path.join(built.outputRoot, "claude-code", "prompts", promptFileName);

          if (!(await pathExists(builtClaudePromptPath))) {
            throw new Error(`Missing built Claude Code prompt "${prompt.id}" for "${built.manifest.name}": ${builtClaudePromptPath}`);
          }
        }
      }

      if (built.targetsBuilt.includes("codex")) {
        const codexAgentsPath = path.join(built.outputRoot, "codex", "AGENTS.md");
        const codexBundlePath = path.join(built.outputRoot, "codex", "bundle.json");

        if (!(await pathExists(codexAgentsPath))) {
          throw new Error(`Missing Codex bridge file for "${built.manifest.name}": ${codexAgentsPath}`);
        }

        if (!(await pathExists(codexBundlePath))) {
          throw new Error(`Missing Codex bundle metadata for "${built.manifest.name}": ${codexBundlePath}`);
        }

        const codexAgentsContent = await readFile(codexAgentsPath, "utf8");

        if (!codexAgentsContent.includes(built.manifest.name)) {
          throw new Error(`Codex bridge file must mention the pack name "${built.manifest.name}": ${codexAgentsPath}`);
        }

        for (const prompt of built.manifest.prompts ?? []) {
          const promptFileName = path.basename(prompt.path);
          const builtCodexPromptPath = path.join(built.outputRoot, "codex", "prompts", promptFileName);

          if (!(await pathExists(builtCodexPromptPath))) {
            throw new Error(`Missing built Codex prompt "${prompt.id}" for "${built.manifest.name}": ${builtCodexPromptPath}`);
          }
        }
      }

      console.log(`Verified install artifacts for "${built.manifest.name}".`);
    }

    console.log(`Examples check: OK (${exampleDirs.length} example pack(s))`);
  } finally {
    await removePath(tempRoot);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
