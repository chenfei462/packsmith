#!/usr/bin/env node

/**
 * generate-examples.mjs - AI-powered example and tutorial generation for packs.
 *
 * For each pack, generates:
 *   1. Real-world usage scenario
 *   2. Before/After comparison
 *   3. Quick tutorial
 *
 * Usage:
 *   node scripts/generate-examples.mjs
 *   node scripts/generate-examples.mjs --pack <id>
 *   node scripts/generate-examples.mjs --dry-run
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const examplesDir = resolve(root, "docs/examples");

mkdirSync(examplesDir, { recursive: true });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function readOptionValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Error: ${name} requires a value.`);
    process.exit(1);
  }

  return value;
}

function safeSlug(value, label) {
  const slug = String(value ?? "");
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error(`Invalid ${label}: ${slug}`);
  }
  return slug;
}

const specificPack = readOptionValue("--pack");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(resolve(root, "registry/catalog.json"), "utf8"));
const packs = specificPack ? catalog.packs.filter((pack) => pack.id === specificPack) : catalog.packs;

if (specificPack && packs.length === 0) {
  console.error(`Pack "${specificPack}" not found in catalog.`);
  process.exit(1);
}

function loadSkillContent(packId) {
  const skillDir = resolve(root, `official-packs/${packId}/skills`);

  if (!existsSync(skillDir)) {
    return "";
  }

  try {
    for (const dir of readdirSync(skillDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) {
        continue;
      }

      const skillPath = resolve(skillDir, dir.name, "SKILL.md");
      if (existsSync(skillPath)) {
        return readFileSync(skillPath, "utf8");
      }
    }
  } catch {
    return "";
  }

  return "";
}

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function generateExample(pack) {
  const packId = safeSlug(pack.id, "pack id");
  const skillContext = loadSkillContent(pack.id);
  const prompt = `Generate a practical usage example document for the Packsmith pack "${packId}".

Pack info:
- Name: ${pack.name}
- Description: ${pack.description}
- Category: ${pack.category}
- Tags: ${pack.tags.join(", ")}

Generate a markdown document with these sections:

## Real-World Scenario
A concrete, relatable situation where a developer would use this pack. Be specific, name a technology, describe the codebase state, explain why this pack helps. (3-4 sentences)

## Before & After

### Before (without ${pack.name})
Show what the developer experience looks like without this pack, the manual steps, the things they'd miss, the time wasted. Use a realistic code snippet or terminal output. (Keep it short, ~10 lines)

### After (with ${pack.name})
Show the same scenario with the pack installed, the AI agent automatically applies the skill. Show the improved output. (Keep it short, ~15 lines)

## Quick Tutorial

A 4-step walkthrough:
1. Install the pack
2. Trigger the skill (what to say/do)
3. What happens (the workflow)
4. Review the output

Each step should have a one-line command or instruction plus brief explanation.

## When to Use This Pack

3-4 bullet points describing ideal trigger situations.

---

Requirements:
- Be concrete and realistic (use real technology names, realistic file paths)
- Code examples should look like real code, not lorem ipsum
- The before/after should clearly show the value of the pack
- Keep total length under 3000 characters
- Return only the markdown content, no code fences wrapping the whole thing`;

  const contextualPrompt = skillContext ? `${prompt}\n\nPack skill context:\n${skillContext}\n` : prompt;
  return callClaude(contextualPrompt);
}

async function main() {
  console.log("AI Example Generator");
  console.log(`Packs: ${packs.length}`);
  console.log(`Dry run: ${dryRun}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (const pack of packs) {
    const packId = safeSlug(pack.id, "pack id");
    const examplePath = resolve(examplesDir, `${packId}.md`);

    if (!specificPack && existsSync(examplePath)) {
      results.skipped.push(packId);
      continue;
    }

    console.log(`Generating example: ${packId}`);

    if (dryRun) {
      console.log(`Would generate docs/examples/${packId}.md`);
      results.success.push(packId);
      continue;
    }

    try {
      const content = await generateExample(pack);
      const fullContent = [
        `# ${pack.name} - Usage Example`,
        "",
        `> Pack: \`${pack.id}\` | Category: ${pack.category} | Install: \`packsmith install ${pack.id}\``,
        "",
        content.trim(),
        "",
        "---",
        `*Example generated for [${pack.name}](../../official-packs/${pack.id}/). Install with \`packsmith install ${pack.id}\`.*`,
        ""
      ].join("\n");

      writeFileSync(examplePath, fullContent, "utf8");
      results.success.push(packId);
      console.log(`Written: docs/examples/${pack.id}.md`);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed: ${error.message}`);
      results.failed.push({ id: packId, error: error.message });
    }
  }

  const allExamples = [...results.success, ...results.skipped].sort();
  const indexContent = [
    "# Pack Usage Examples",
    "",
    `> ${allExamples.length} examples available | Generated with AI, reviewed by humans`,
    "",
    "## Browse by Category",
    "",
    ...["code-quality", "repository-understanding", "product-launch", "documentation", "agent-workflow"]
      .map((category) => {
        const categoryPacks = catalog.packs.filter((pack) => pack.category === category && allExamples.includes(pack.id));

        if (categoryPacks.length === 0) {
          return "";
        }

        return [
          `### ${category
            .split("-")
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" ")}`,
          "",
          ...categoryPacks.map((pack) => `- [${pack.name}](./${pack.id}.md) - ${pack.description}`),
          ""
        ].join("\n");
      })
      .filter(Boolean),
    "---",
    "",
    "## How Examples Are Generated",
    "",
    "Each example includes:",
    "- Real-world scenario",
    "- Before/After comparison",
    "- Quick tutorial",
    "- When to use",
    "",
    "Examples are AI-generated and human-reviewed. Submit corrections via PR.",
    ""
  ].join("\n");

  writeFileSync(resolve(examplesDir, "index.md"), indexContent, "utf8");

  console.log("\nGeneration Summary");
  console.log(`Generated: ${results.success.length}`);
  console.log(`Skipped (existing): ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `generated_count=${results.success.length}`,
        `has_changes=${results.success.length > 0 ? "true" : "false"}`,
        ""
      ].join("\n"),
      { flag: "a" }
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
