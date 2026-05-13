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
  checks.push({ code, ok: condition, message });

  if (!condition) {
    errors.push(message);
  }
}

function hasTrustedPublishingWorkflow(workflows) {
  return workflows.some(({ content }) => {
    const normalized = content.toLowerCase();

    return (
      normalized.includes("id-token: write") &&
      normalized.includes("actions/setup-node") &&
      normalized.includes("registry-url: https://registry.npmjs.org") &&
      normalized.includes("npm publish --provenance") &&
      normalized.includes("npm run eval") &&
      normalized.includes("actions/upload-artifact@v4") &&
      normalized.includes("verification-snapshot")
    );
  });
}

function hasTopSignalLine(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("actions/workflows/ci.yml/badge.svg") &&
      normalized.includes("actions/workflows/publish.yml/badge.svg") &&
      normalized.includes("node >=20") &&
      normalized.includes("zero runtime deps") &&
      normalized.includes("targets: claude-code + codex") &&
      normalized.includes("./docs/verification.md") &&
      normalized.includes("./docs/assets/packsmith-verification-card.svg")
  );
}

function hasReadmeVerificationSummary(readme, snapshot) {
  const expected = renderReadmeVerificationBlock(snapshot);
  return readme.includes(expected);
}

function hasBilingualReadmeAnchors(readme) {
  const normalized = readme.toLowerCase();
  return normalized.includes("[中文](#中文)") && normalized.includes("## english") && normalized.includes("## 中文");
}

function hasBilingualReadmeQuickstart(readme) {
  const normalized = readme.toLowerCase();

  return normalized.includes("### first run") && normalized.includes("### 快速上手") && normalized.includes("npm run eval");
}

function hasBilingualReadmeExampleShowcase(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("### example packs") &&
    normalized.includes("### 示例 packs") &&
    normalized.includes("research-launchpad") &&
    normalized.includes("incident-triage") &&
    normalized.includes("maintainer-handoff")
  );
}

function hasBilingualReadmeManualCopyComparison(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("### why not copy folders by hand") &&
    normalized.includes("### 为什么不要手动复制文件夹") &&
    normalized.includes("track installs") &&
    normalized.includes("detect drift") &&
    normalized.includes("strict validation") &&
    normalized.includes("安装记录") &&
    normalized.includes("检测漂移") &&
    normalized.includes("严格校验")
  );
}

function hasBilingualReadmeCurrentLimits(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("### current limits") &&
    normalized.includes("### 当前边界") &&
    normalized.includes("claude-code") &&
    normalized.includes("codex") &&
    normalized.includes("--dest") &&
    normalized.includes("remote pack") &&
    normalized.includes("显式 `--dest`") &&
    normalized.includes("远程 pack")
  );
}

function hasBilingualReadmeSupportMatrix(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("### target support matrix") &&
    normalized.includes("### 目标支持矩阵") &&
    normalized.includes("install --scope") &&
    normalized.includes("list / doctor / uninstall") &&
    normalized.includes("install --dest") &&
    normalized.includes("claude-code") &&
    normalized.includes("codex") &&
    normalized.includes("显式 `--dest`")
  );
}

function hasBilingualReadmePublishFootprint(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("### publish footprint") &&
    normalized.includes("### 发布体积") &&
    normalized.includes("npm pack --dry-run")
  );
}

function hasReadmeDemandResearchLinks(readme) {
  const normalized = readme.toLowerCase();

  return (
    normalized.includes("4,526") &&
    normalized.includes("133k") &&
    normalized.includes("may 13, 2026") &&
    normalized.includes("[github demand research](./docs/github-demand-2026-05.md) for source links and issue context.") &&
    normalized.includes("[github 需求研究](./docs/github-demand-2026-05.md)")
  );
}

function hasNoReadmeMojibake(readme) {
  return !(
    readme.includes("[涓枃](#涓枃)") ||
    readme.includes("褰撳墠楠岃瘉") ||
    readme.includes("### 蹇€熶笂鎵") ||
    readme.includes("### 绀轰緥 packs") ||
    readme.includes("### 褰撳墠杈圭晫")
  );
}

function hasUnpublishedStatusBlock(readme, packageName) {
  const normalized = readme.toLowerCase();

  return normalized.includes(packageName.toLowerCase()) && normalized.includes("not published yet");
}

function treatsGlobalInstallAsFuture(readme, packageName) {
  const normalized = readme.toLowerCase();
  const globalInstall = `npm install -g ${packageName.toLowerCase()}`;

  return normalized.includes(globalInstall) && normalized.includes("once the scoped package is published");
}

export async function verifyReleaseReadiness(repoRoot) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const packageJsonPath = path.join(absoluteRepoRoot, "package.json");
  const workflowDir = path.join(absoluteRepoRoot, ".github", "workflows");
  const packageJson = await readJson(packageJsonPath);
  const readmeContent = await readFile(path.join(absoluteRepoRoot, "README.md"), "utf8");
  const workflows = await readWorkflowFiles(workflowDir);
  const packInspection = await inspectPackedRepo(absoluteRepoRoot);
  const publishedStatus = await getPublishedPackageStatus(packageJson.name, { cwd: absoluteRepoRoot });
  const expectedSnapshot = await buildVerificationSnapshot(absoluteRepoRoot);
  const verificationJsonPath = path.join(absoluteRepoRoot, "docs", "verification.json");
  const verificationMarkdownPath = path.join(absoluteRepoRoot, "docs", "verification.md");
  const verificationCardPath = path.join(absoluteRepoRoot, "docs", "assets", "packsmith-verification-card.svg");
  const demoTerminalCardPath = path.join(absoluteRepoRoot, "docs", "assets", "packsmith-demo-terminal.svg");
  const checks = [];
  const errors = [];
  const requiredFiles = new Set(packageJson.files ?? []);
  const unexpectedPackFiles = packInspection.files.filter((filePath) => {
    return !(filePath === "LICENSE" || filePath === "README.md" || filePath === "package.json" || filePath.startsWith("src/"));
  });
  const verificationJson = (await pathExists(verificationJsonPath)) ? await readJson(verificationJsonPath) : null;
  const verificationMarkdown = (await pathExists(verificationMarkdownPath)) ? await readFile(verificationMarkdownPath, "utf8") : null;
  const verificationCard = (await pathExists(verificationCardPath)) ? await readFile(verificationCardPath, "utf8") : null;
  const demoTerminalCard = (await pathExists(demoTerminalCardPath)) ? await readFile(demoTerminalCardPath, "utf8") : null;

  check(typeof packageJson.name === "string" && packageJson.name.startsWith("@"), "scoped-package-name", "Package name must be scoped for publishability and differentiation.", checks, errors);
  check(packageJson.publishConfig?.access === "public", "public-publish-config", "package.json must set publishConfig.access to public.", checks, errors);
  check(packageJson.repository?.url?.includes("github.com"), "repository-url", "package.json must include a GitHub repository URL.", checks, errors);
  check(packageJson.homepage?.includes("#readme"), "homepage-readme", "package.json homepage should point to the README.", checks, errors);
  check(packageJson.bugs?.url?.includes("/issues"), "bugs-url", "package.json bugs.url should point to GitHub issues.", checks, errors);
  check(requiredFiles.has("src") && requiredFiles.has("README.md") && requiredFiles.has("LICENSE"), "publish-files-whitelist", "package.json files must whitelist src, README.md, and LICENSE.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "README.md")), "readme-present", "README.md must exist at the repo root.", checks, errors);
  check(hasTopSignalLine(readmeContent), "readme-top-signals", "README.md should expose CI, publish, Node, dependency, and runtime support signals near the top.", checks, errors);
  check(hasReadmeVerificationSummary(readmeContent, expectedSnapshot), "readme-verification-summary", "README.md should expose a current verification summary that matches the generated snapshot.", checks, errors);
  check(hasBilingualReadmeAnchors(readmeContent), "bilingual-readme", "README.md should keep bilingual English/中文 anchors and sections.", checks, errors);
  check(hasBilingualReadmeQuickstart(readmeContent), "bilingual-readme-quickstart", "README.md should include bilingual first-run quickstart sections and the `npm run eval` command.", checks, errors);
  check(hasBilingualReadmeExampleShowcase(readmeContent), "bilingual-readme-example-packs", "README.md should include bilingual example-pack showcase sections mentioning research-launchpad, incident-triage, and maintainer-handoff.", checks, errors);
  check(hasBilingualReadmeManualCopyComparison(readmeContent), "bilingual-readme-manual-copy-comparison", "README.md should include a bilingual comparison section explaining why not to keep copying folders by hand.", checks, errors);
  check(hasBilingualReadmeCurrentLimits(readmeContent), "bilingual-readme-current-limits", "README.md should include a bilingual current-limits section that states the present runtime and distribution boundaries.", checks, errors);
  check(hasBilingualReadmeSupportMatrix(readmeContent), "bilingual-readme-support-matrix", "README.md should include a bilingual target support matrix that makes runtime capability differences obvious.", checks, errors);
  check(hasBilingualReadmePublishFootprint(readmeContent), "bilingual-readme-publish-footprint", "README.md should include a bilingual publish-footprint section backed by npm pack dry-run evidence.", checks, errors);
  check(hasReadmeDemandResearchLinks(readmeContent), "readme-demand-research-links", "README.md should attach market-demand number claims to the in-repo demand research document with dates and source-link context.", checks, errors);
  check(hasNoReadmeMojibake(readmeContent), "readme-no-mojibake", "README.md should not contain mojibake in bilingual trust-critical sections.", checks, errors);
  check(packInspection.entryCount === 6, "npm-pack-footprint-entry-count", `npm pack --dry-run should currently produce 6 published files. Found ${packInspection.entryCount}.`, checks, errors);
  check(packInspection.size > 0, "npm-pack-footprint-size", `npm pack --dry-run should report a non-zero tarball size. Found ${packInspection.size}.`, checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "LICENSE")), "license-present", "LICENSE must exist at the repo root.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "CODE_OF_CONDUCT.md")), "code-of-conduct-present", "CODE_OF_CONDUCT.md should exist at the repo root to set contributor expectations.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "SECURITY.md")), "security-policy-present", "SECURITY.md should exist at the repo root to document responsible disclosure.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, ".npmignore")), "npmignore-present", ".npmignore should exist to keep publishes intentional.", checks, errors);
  check(unexpectedPackFiles.length === 0, "npm-pack-contents", `npm pack --dry-run should not publish unexpected files. Found: ${unexpectedPackFiles.join(", ") || "none"}.`, checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "docs", "assets", "packsmith-hero.svg")), "hero-asset-present", "docs/assets/packsmith-hero.svg should exist so the README hero does not break.", checks, errors);
  check(await pathExists(path.join(absoluteRepoRoot, "docs", "runtime-assumptions.md")), "runtime-assumptions-present", "docs/runtime-assumptions.md should exist to document runtime contracts and evidence.", checks, errors);
  check(await pathExists(verificationJsonPath), "verification-json-present", "docs/verification.json should exist as a machine-readable verification snapshot.", checks, errors);
  check(await pathExists(verificationMarkdownPath), "verification-markdown-present", "docs/verification.md should exist as a human-readable verification snapshot.", checks, errors);
  check(await pathExists(verificationCardPath), "verification-card-present", "docs/assets/packsmith-verification-card.svg should exist as a machine-generated README evidence card.", checks, errors);
  check(await pathExists(demoTerminalCardPath), "demo-terminal-card-present", "docs/assets/packsmith-demo-terminal.svg should exist as a machine-generated CLI evidence card.", checks, errors);
  check(JSON.stringify(verificationJson) === JSON.stringify(expectedSnapshot), "verification-json-fresh", "docs/verification.json should match the current repository and npm registry state.", checks, errors);
  check(
    verificationMarkdown === renderVerificationMarkdown(expectedSnapshot),
    "verification-markdown-fresh",
    "docs/verification.md should reflect the current verification snapshot.",
    checks,
    errors
  );
  check(
    verificationCard === renderVerificationCard(expectedSnapshot),
    "verification-card-fresh",
    "docs/assets/packsmith-verification-card.svg should reflect the current verification snapshot.",
    checks,
    errors
  );
  check(
    demoTerminalCard === renderDemoTerminalCard(expectedSnapshot),
    "demo-terminal-card-fresh",
    "docs/assets/packsmith-demo-terminal.svg should reflect the current machine-generated CLI evidence.",
    checks,
    errors
  );
  check(hasTrustedPublishingWorkflow(workflows), "trusted-publish-workflow", "A GitHub Actions workflow must use npm trusted publishing, run `npm run eval`, upload the verification snapshot artifact, and publish with provenance.", checks, errors);

  if (!publishedStatus.published) {
    check(hasUnpublishedStatusBlock(readmeContent, packageJson.name), "npm-unpublished-status-block", `README.md must explicitly state that ${packageJson.name} is not published yet.`, checks, errors);
    check(treatsGlobalInstallAsFuture(readmeContent, packageJson.name), "npm-global-install-future-only", `README.md must present \`npm install -g ${packageJson.name}\` as a future path until the package is published.`, checks, errors);
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
