import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getPublishedPackageStatus, inspectPackedRepo } from "./npm-helpers.mjs";
import { buildVerificationSnapshot, renderDemoTerminalCard, renderReadmeVerificationBlock, renderVerificationCard, renderVerificationMarkdown } from "./verification-status.mjs";

async function pathExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readTextIfExists(filePath) {
  return (await pathExists(filePath)) ? readFile(filePath, "utf8") : null;
}

async function readWorkflowFiles(workflowDir) {
  try {
    const entries = await readdir(workflowDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(workflowDir, entry.name);
      files.push({
        name: entry.name,
        content: await readFile(filePath, "utf8")
      });
    }

    return files;
  } catch {
    return [];
  }
}

function check(condition, code, message, checks, errors) {
  checks.push({ code, ok: Boolean(condition), message });

  if (!condition) {
    errors.push(message);
  }
}

function includesAll(value, needles) {
  const normalized = value.toLowerCase();
  return needles.every((needle) => normalized.includes(needle.toLowerCase()));
}

function hasTrustedPublishingWorkflow(workflows) {
  return workflows.some(({ content }) =>
    includesAll(content, [
      "id-token: write",
      "actions/setup-node",
      "registry-url: https://registry.npmjs.org",
      "npm publish --provenance",
      "npm run eval",
      "actions/upload-artifact@v4",
      "verification-snapshot"
    ])
  );
}

function hasPostPublishVerificationWorkflow(workflows) {
  return workflows.some(
    ({ name, content }) =>
      name === "post-publish-verification.yml" &&
      includesAll(content, [
        "workflow_run:",
        'workflows: ["Publish"]',
        "npm run verification:sync",
        "peter-evans/create-pull-request@v",
        "README.md",
        "docs/verification.json",
        "docs/verification.md"
      ])
  );
}

function hasTopSignalLine(readme) {
  return includesAll(readme, [
    "actions/workflows/ci.yml/badge.svg",
    "actions/workflows/publish.yml/badge.svg",
    "Node >=20",
    "Zero runtime deps",
    "Targets: claude-code + codex",
    "./docs/verification.md",
    "./docs/assets/packsmith-verification-card.svg"
  ]);
}

function hasReadmeVerificationSummary(readme, snapshot) {
  return readme.includes(renderReadmeVerificationBlock(snapshot));
}

function hasReadmeLifecycleEvidence(readme) {
  return includesAll(readme, ["Clean-machine demo", "Install success rate", "upgrade", "version lock", "install source", "drift"]);
}

function hasBilingualReadmeAnchors(readme) {
  const normalized = readme.toLowerCase();
  return normalized.includes("[english](#english)") && normalized.includes("## english") && normalized.includes("## 中文");
}

function hasBilingualReadmeQuickstart(readme) {
  return includesAll(readme, ["### First run", "### 快速上手", "npm run eval"]);
}

function hasBilingualReadmeExampleShowcase(readme) {
  return includesAll(readme, ["### Example packs", "### 示例 packs", "research-launchpad", "incident-triage", "maintainer-handoff"]);
}

function hasBilingualReadmeManualCopyComparison(readme) {
  return includesAll(readme, ["### Why not copy folders by hand", "### 为什么不要手动复制文件夹", "track installs", "detect drift", "strict validation"]);
}

function hasBilingualReadmeCurrentLimits(readme) {
  return includesAll(readme, ["### Current limits", "### 当前边界", "claude-code", "codex", "--dest", "remote pack"]);
}

function hasBilingualReadmeSupportMatrix(readme) {
  return includesAll(readme, ["### Target support matrix", "### 目标支持矩阵", "install --scope", "list / doctor / uninstall", "install --dest"]);
}

function hasBilingualReadmePublishFootprint(readme) {
  return includesAll(readme, ["### Publish footprint", "### 发布体积", "npm pack --dry-run"]);
}

function hasReadmeDemandResearchLinks(readme) {
  return includesAll(readme, ["4,526", "133k", "May 13, 2026", "[GitHub demand research](./docs/github-demand-2026-05.md)"]);
}

function hasNoReadmeMojibake(readme) {
  return !/涓|鐩|绀|锛|€|乣|禲|熶|悓|已锟/.test(readme);
}

function hasUnpublishedStatusBlock(readme, packageName) {
  return includesAll(readme, [packageName, "not published yet"]) || includesAll(readme, [packageName, "Global install: future path until npm publication"]);
}

function treatsGlobalInstallAsFuture(readme, packageName) {
  return includesAll(readme, [`npm install -g ${packageName}`, "Global install: future path until npm publication"]);
}

function treatsGlobalInstallAsPublished(readme, packageName) {
  return includesAll(readme, [`npm install -g ${packageName}`, "Global install: published", "Preferred install: npm install -g"]);
}

function hasPublishedUserInstallPath(readme, packageName) {
  return includesAll(readme, [`npm install -g ${packageName}`, "packsmith --help", "packsmith init demo-pack"]);
}

function hasPostPublishVerificationMatrix(content) {
  return (
    content &&
    includesAll(content, [
      "clean-machine demo",
      "install success rate",
      "global install",
      "tarball install",
      "Claude Code scoped install",
      "Codex --dest install",
      "upgrade",
      "version lock",
      "install source",
      "drift"
    ])
  );
}

function hasLaunchPlaybook(content) {
  return (
    content &&
    includesAll(content, [
      "0.1.x",
      "v0.1.0",
      "node --test tests/pack.test.mjs",
      "node scripts/eval.mjs",
      "npm trusted publishing",
      "post-publish verification refresh",
      "clean-machine demo",
      "install success rate",
      "upgrade",
      "version lock",
      "install source",
      "drift",
      "deprecate"
    ])
  );
}

function hasLaunchKit(content) {
  return (
    content &&
    includesAll(content, [
      "GitHub Release body",
      "npm page positioning",
      "Community announcement",
      "60-90 second demo",
      "Issue seed"
    ])
  );
}

function hasReleaseTemplate(content) {
  return content && includesAll(content, ["changelog:", "categories:"]);
}

function hasChangelogVersionEntry(content, version) {
  return content && includesAll(content, [`## ${version}`, "@chenfei462/packsmith", "GitHub Release"]);
}

export async function verifyReleaseReadiness(repoRoot) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const packageJson = await readJson(path.join(absoluteRepoRoot, "package.json"));
  const readmeContent = await readFile(path.join(absoluteRepoRoot, "README.md"), "utf8");
  const workflows = await readWorkflowFiles(path.join(absoluteRepoRoot, ".github", "workflows"));
  const packInspection = await inspectPackedRepo(absoluteRepoRoot);
  const publishedStatus = await getPublishedPackageStatus(packageJson.name);
  const expectedSnapshot = await buildVerificationSnapshot(absoluteRepoRoot);
  const verificationJsonPath = path.join(absoluteRepoRoot, "docs", "verification.json");
  const verificationMarkdownPath = path.join(absoluteRepoRoot, "docs", "verification.md");
  const verificationCardPath = path.join(absoluteRepoRoot, "docs", "assets", "packsmith-verification-card.svg");
  const demoTerminalCardPath = path.join(absoluteRepoRoot, "docs", "assets", "packsmith-demo-terminal.svg");
  const changelog = await readTextIfExists(path.join(absoluteRepoRoot, "CHANGELOG.md"));
  const releasePlaybook = await readTextIfExists(path.join(absoluteRepoRoot, "docs", "release-playbook.md"));
  const launchKit = await readTextIfExists(path.join(absoluteRepoRoot, "docs", "launch-kit.md"));
  const verificationMatrix = await readTextIfExists(path.join(absoluteRepoRoot, "docs", "post-publish-verification-matrix.md"));
  const releaseTemplate = await readTextIfExists(path.join(absoluteRepoRoot, ".github", "release.yml"));
  const verificationJson = (await pathExists(verificationJsonPath)) ? await readJson(verificationJsonPath) : null;
  const verificationMarkdown = (await pathExists(verificationMarkdownPath)) ? await readFile(verificationMarkdownPath, "utf8") : null;
  const verificationCard = (await pathExists(verificationCardPath)) ? await readFile(verificationCardPath, "utf8") : null;
  const demoTerminalCard = (await pathExists(demoTerminalCardPath)) ? await readFile(demoTerminalCardPath, "utf8") : null;
  const checks = [];
  const errors = [];
  const requiredFiles = new Set(packageJson.files ?? []);
  const unexpectedPackFiles = packInspection.files.filter((filePath) => {
    return !(filePath === "LICENSE" || filePath === "README.md" || filePath === "package.json" || filePath.startsWith("src/"));
  });

  check(typeof packageJson.name === "string" && packageJson.name.startsWith("@"), "scoped-package-name", "Package name must be scoped.", checks, errors);
  check(/^0\.1\.\d+$/.test(packageJson.version), "stable-preview-version", "First public stable release must stay in the 0.1.x line.", checks, errors);
  check(packageJson.publishConfig?.access === "public", "public-publish-config", "package.json must set publishConfig.access to public.", checks, errors);
  check(packageJson.repository?.url?.includes("github.com"), "repository-url", "package.json must include a GitHub repository URL.", checks, errors);
  check(packageJson.homepage?.includes("#readme"), "homepage-readme", "package.json homepage should point to the README.", checks, errors);
  check(packageJson.bugs?.url?.includes("/issues"), "bugs-url", "package.json bugs.url should point to GitHub issues.", checks, errors);
  check(requiredFiles.has("src") && requiredFiles.has("README.md") && requiredFiles.has("LICENSE"), "publish-files-whitelist", "package.json files must whitelist src, README.md, and LICENSE.", checks, errors);
  check(packageJson.scripts?.["verification:sync"] === "node scripts/verification-status.mjs sync", "verification-sync-single-entrypoint", "package.json verification:sync must be the single sync command.", checks, errors);
  check(hasTopSignalLine(readmeContent), "readme-top-signals", "README.md should expose top release signals.", checks, errors);
  check(hasReadmeVerificationSummary(readmeContent, expectedSnapshot), "readme-verification-summary", "README.md should expose a current verification summary that matches the generated snapshot.", checks, errors);
  check(hasReadmeLifecycleEvidence(readmeContent), "readme-lifecycle-evidence", "README.md should document upgrade, version lock, install source, drift detection, clean-machine demo, and install success rate evidence.", checks, errors);
  check(hasBilingualReadmeAnchors(readmeContent), "bilingual-readme", "README.md should keep bilingual English/中文 anchors and sections.", checks, errors);
  check(hasBilingualReadmeQuickstart(readmeContent), "bilingual-readme-quickstart", "README.md should include bilingual first-run quickstart sections and the `npm run eval` command.", checks, errors);
  check(hasBilingualReadmeExampleShowcase(readmeContent), "bilingual-readme-example-packs", "README.md should include bilingual example-pack showcase sections mentioning research-launchpad, incident-triage, and maintainer-handoff.", checks, errors);
  check(hasBilingualReadmeManualCopyComparison(readmeContent), "bilingual-readme-manual-copy-comparison", "README.md should include a bilingual comparison section explaining why not to keep copying folders by hand.", checks, errors);
  check(hasBilingualReadmeCurrentLimits(readmeContent), "bilingual-readme-current-limits", "README.md should include bilingual current limits.", checks, errors);
  check(hasBilingualReadmeSupportMatrix(readmeContent), "bilingual-readme-support-matrix", "README.md should include a bilingual target support matrix.", checks, errors);
  check(hasBilingualReadmePublishFootprint(readmeContent), "bilingual-readme-publish-footprint", "README.md should include a bilingual publish footprint / 发布体积 section backed by npm pack --dry-run evidence.", checks, errors);
  check(hasReadmeDemandResearchLinks(readmeContent), "readme-demand-research-links", "README.md should attach market-demand claims to the in-repo demand research document.", checks, errors);
  check(hasNoReadmeMojibake(readmeContent), "readme-no-mojibake", "README.md should not contain mojibake in trust-critical sections.", checks, errors);
  check(hasPublishedUserInstallPath(readmeContent, packageJson.name), "published-user-install-docs", "README.md must document npm global install, help, and init commands.", checks, errors);
  check(packInspection.entryCount === 6, "npm-pack-footprint-entry-count", `npm pack dry-run should currently produce 6 published files. Found ${packInspection.entryCount}.`, checks, errors);
  check(packInspection.size > 0, "npm-pack-footprint-size", `npm pack dry-run should report a non-zero tarball size. Found ${packInspection.size}.`, checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "LICENSE")), "license-present", "LICENSE must exist at the repo root.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "CODE_OF_CONDUCT.md")), "code-of-conduct-present", "CODE_OF_CONDUCT.md should exist.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "SECURITY.md")), "security-policy-present", "SECURITY.md should exist.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, ".npmignore")), "npmignore-present", ".npmignore should exist.", checks, errors);
  check(unexpectedPackFiles.length === 0, "npm-pack-contents", `npm pack dry-run should not publish unexpected files. Found: ${unexpectedPackFiles.join(", ") || "none"}.`, checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "docs", "assets", "packsmith-hero.svg")), "hero-asset-present", "docs/assets/packsmith-hero.svg should exist.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "docs", "runtime-assumptions.md")), "runtime-assumptions-present", "docs/runtime-assumptions.md should exist.", checks, errors);
  check(JSON.stringify(verificationJson) === JSON.stringify(expectedSnapshot), "verification-json-fresh", "docs/verification.json should match the current repository and npm registry state.", checks, errors);
  check(verificationMarkdown === renderVerificationMarkdown(expectedSnapshot), "verification-markdown-fresh", "docs/verification.md should reflect the current verification snapshot.", checks, errors);
  check(verificationCard === renderVerificationCard(expectedSnapshot), "verification-card-fresh", "docs/assets/packsmith-verification-card.svg should reflect the current verification snapshot.", checks, errors);
  check(demoTerminalCard === renderDemoTerminalCard(expectedSnapshot), "demo-terminal-card-fresh", "docs/assets/packsmith-demo-terminal.svg should reflect current CLI evidence.", checks, errors);
  check(hasTrustedPublishingWorkflow(workflows), "trusted-publish-workflow", "A GitHub Actions workflow must use npm trusted publishing, run npm run eval, upload the verification snapshot artifact, and publish with provenance.", checks, errors);
  check(hasPostPublishVerificationWorkflow(workflows), "post-publish-verification-workflow", "A post-publish workflow must open a verification refresh PR.", checks, errors);
  check(hasChangelogVersionEntry(changelog, packageJson.version), "changelog-version-entry", "CHANGELOG.md must include the package version entry.", checks, errors);
  check(hasLaunchPlaybook(releasePlaybook), "release-playbook-present", "docs/release-playbook.md must document release flow and rollback handling.", checks, errors);
  check(hasLaunchKit(launchKit), "launch-kit-present", "docs/launch-kit.md must include launch copy, demo script, and issue seeds.", checks, errors);
  check(hasPostPublishVerificationMatrix(verificationMatrix), "post-publish-verification-matrix", "docs/post-publish-verification-matrix.md must cover external install verification paths.", checks, errors);
  check(hasReleaseTemplate(releaseTemplate), "release-template-present", ".github/release.yml must provide reusable release-note grouping.", checks, errors);

  if (!publishedStatus.published) {
    check(hasUnpublishedStatusBlock(readmeContent, packageJson.name), "npm-unpublished-status-block", `README.md must explicitly state that ${packageJson.name} is not published yet.`, checks, errors);
    check(treatsGlobalInstallAsFuture(readmeContent, packageJson.name), "npm-global-install-future-only", `README.md must present \`npm install -g ${packageJson.name}\` as future until publication.`, checks, errors);
  } else {
    check(treatsGlobalInstallAsPublished(readmeContent, packageJson.name), "npm-global-install-published", `README.md must present \`npm install -g ${packageJson.name}\` as published after registry publication.`, checks, errors);
  }

  return {
    ok: errors.length === 0,
    checks,
    errors
  };
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");
  const result = await verifyReleaseReadiness(repoRoot);

  if (result.ok) {
    console.log("Release readiness: OK");
    return;
  }

  console.error("Release readiness: FAILED");

  for (const error of result.errors) {
    console.error(`- ${error}`);
  }

  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
