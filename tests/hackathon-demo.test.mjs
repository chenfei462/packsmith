import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function createIsolatedEnv(prefix) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    tempRoot,
    env: {
      ...process.env,
      PACKSMITH_HOME: path.join(tempRoot, "state"),
      PACKSMITH_TEST_HOME: path.join(tempRoot, "home"),
      npm_config_cache: path.join(tempRoot, "npm-cache"),
      NO_COLOR: "1"
    }
  };
}

function leadingSpaces(line) {
  return line.match(/^\s*/)[0].length;
}

function workflowStepBlock(workflowText, stepName) {
  const lines = workflowText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);

  if (startIndex === -1) {
    return "";
  }

  const stepIndent = lines[startIndex].match(/^(\s*)-/)[1];
  const nextStepIndex = lines.findIndex(
    (line, index) => index > startIndex && line.startsWith(`${stepIndent}- name:`)
  );
  const endIndex = nextStepIndex === -1 ? lines.length : nextStepIndex;

  return lines.slice(startIndex, endIndex).join("\n");
}

function workflowListItems(block, key) {
  const lines = block.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.trim() === `${key}: |`);

  if (keyIndex === -1) {
    return [];
  }

  const keyIndent = leadingSpaces(lines[keyIndex]);
  const items = [];

  for (const line of lines.slice(keyIndex + 1)) {
    if (line.trim() === "") {
      continue;
    }

    if (leadingSpaces(line) <= keyIndent) {
      break;
    }

    items.push(line.trim());
  }

  return items;
}

function workflowStepListIncludes(workflowText, stepName, key, expectedItem) {
  return workflowListItems(workflowStepBlock(workflowText, stepName), key).includes(expectedItem);
}

test("package metadata exposes the hackathon demo script", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));

  assert.equal(packageJson.scripts["demo:hackathon"], "node scripts/hackathon-demo.mjs");
  assert.equal(packageJson.scripts.demo, "npm run demo:hackathon");
  assert.equal(packageJson.scripts["verify:hackathon"], "node scripts/verify-hackathon.mjs");
  assert.equal(packageJson.scripts["verify:hackathon:quick"], "node scripts/verify-hackathon.mjs --quick --skip-network");
  assert.equal(packageJson.scripts["verify:hackathon:ci"], "node scripts/verify-hackathon.mjs");
  assert.ok(packageJson.files.includes("scripts/hackathon-demo.mjs"));
  assert.ok(packageJson.files.includes("scripts/verify-hackathon.mjs"));
});

test("post-publish verification script is packaged and documented", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  const scriptPath = path.join(repoRoot, "scripts", "post-publish-verify.mjs");
  const releaseEvidence = await readFile(path.join(repoRoot, "docs", "release-evidence.md"), "utf8");
  const postPublishModule = await import(pathToFileURL(scriptPath).href);

  assert.equal(packageJson.scripts["verify:postpublish"], "node scripts/post-publish-verify.mjs");
  assert.ok(packageJson.files.includes("scripts/post-publish-verify.mjs"));
  await execFileAsync(process.execPath, ["--check", scriptPath]);
  assert.equal(postPublishModule.npxExecutable("win32"), "npx.cmd");
  assert.equal(postPublishModule.npxExecutable("linux"), "npx");
  assert.equal(await postPublishModule.packageSpecifier(), `${packageJson.name}@${packageJson.version}`);
  assert.deepEqual(postPublishModule.postPublishEnv("C:\\tmp\\packsmith-cache", { PATH: "bin" }), {
    PATH: "bin",
    npm_config_cache: "C:\\tmp\\packsmith-cache",
    NO_COLOR: "1"
  });
  assert.deepEqual(postPublishModule.postPublishEnv("C:\\tmp\\packsmith-cache", { NPM_CONFIG_CACHE: "caller-cache" }), {
    npm_config_cache: "C:\\tmp\\packsmith-cache",
    NO_COLOR: "1"
  });
  assert.deepEqual(
    postPublishModule.postPublishEnv("C:\\tmp\\packsmith-cache", {
      npm_config_cache: "lower-cache",
      NPM_CONFIG_CACHE: "upper-cache",
      Path: "bin"
    }),
    {
      Path: "bin",
      npm_config_cache: "C:\\tmp\\packsmith-cache",
      NO_COLOR: "1"
    }
  );
  assert.match(releaseEvidence, /npm run verify:postpublish/);
});

test("release source of truth aligns workflow docs and notes", async () => {
  const [releaseWorkflow, releaseChecklist, releaseNotes, readme, packageJson] = await Promise.all([
    readText(".github/workflows/release.yml"),
    readText("docs/release-checklist.md"),
    readText("RELEASE_NOTES.md"),
    readText("README.md"),
    readJson(path.join(repoRoot, "package.json"))
  ]);

  assert.match(releaseWorkflow, /npm run verify:hackathon:ci/);
  assert.match(releaseWorkflow, /node scripts\/i18n-check\.mjs --ci/);
  assert.match(releaseWorkflow, /npm pack --pack-destination dist/);
  assert.match(releaseWorkflow, /release-checksums\.txt/);
  assert.match(releaseWorkflow, /release-evidence-summary\.md/);
  assert.match(releaseWorkflow, /RELEASE_NOTES\.md/);
  assert.match(releaseWorkflow, /dist\/release-body\.md/);
  assert.match(
    releaseWorkflow,
    /\$\{\{\s*github\.server_url\s*\}\}\/\$\{\{\s*github\.repository\s*\}\}\/actions\/runs\/\$\{\{\s*github\.run_id\s*\}\}/
  );
  assert.match(releaseWorkflow, /dist\/\*\.tgz/);
  assert.match(releaseWorkflow, /dist\/release-checksums\.txt/);
  assert.match(releaseWorkflow, /dist\/release-evidence-summary\.md/);
  assert.equal(
    workflowStepListIncludes(releaseWorkflow, "Upload release evidence artifacts", "path", "dist/release-body.md"),
    true
  );
  assert.match(releaseWorkflow, /body_path: dist\/release-body\.md/);
  assert.equal(
    workflowStepListIncludes(releaseWorkflow, "Create GitHub Release with catalog shards", "files", "dist/release-body.md"),
    true
  );
  assert.match(releaseWorkflow, /dist\/catalog-\*\.json/);
  assert.equal(releaseWorkflow.includes("Publish to GitHub Packages"), false);

  assert.match(releaseChecklist, /primary automated path/i);
  assert.match(releaseChecklist, /push a signed or reviewed `v1\.1\.0` tag|push a `v1\.1\.0` tag/i);
  assert.match(releaseChecklist, /NPM_TOKEN/);
  assert.match(releaseChecklist, /node scripts\/i18n-check\.mjs --ci/);
  assert.match(releaseChecklist, /release-checksums\.txt/);
  assert.match(releaseChecklist, /CI run URL|Actions run URL/i);
  assert.match(releaseChecklist, /manual fallback/i);
  assert.match(releaseChecklist, /Do not claim.*published|do not claim.*publish/i);

  assert.match(releaseNotes, /six agent install plans/i);
  assert.match(releaseNotes, /TRAE/);
  assert.match(releaseNotes, /local TRAE/i);
  assert.equal(releaseNotes.includes("five-target"), false);
  assert.equal(releaseNotes.includes("287 files"), false);
  assert.equal(releaseNotes.includes("d600588f98f78ac4aedd2e43abea380d69fb5ffe"), false);
  assert.equal(releaseNotes.includes("126C84045DDA5003E4CC5908CE8AA80DE593A77410CAAB15811F8B675F05F2AC"), false);
  assert.match(releaseNotes, /npx --yes @packsmith\/cli@1\.1\.0 --help/);
  assert.match(releaseNotes, /npx --yes @packsmith\/cli@1\.1\.0 search review/);

  assert.match(readme, /npx --yes @packsmith\/cli@1\.1\.0 --help/);

  assert.match(packageJson.scripts.prepublishOnly, /npm run verify:hackathon:ci/);
  assert.match(packageJson.scripts.prepublishOnly, /node scripts\/i18n-check\.mjs --ci/);
});

test("release source of truth workflow list helper scopes artifact lists", () => {
  const workflowSnippet = `
jobs:
  release:
    steps:
      - name: Upload release evidence artifacts
        uses: actions/upload-artifact@v4
        with:
          path: |
            dist/*.tgz
            dist/release-evidence-summary.md

      - name: Create GitHub Release with catalog shards
        uses: softprops/action-gh-release@v2
        with:
          body_path: dist/release-body.md
          files: |
            dist/*.tgz
            dist/release-body.md
`;

  assert.equal(
    workflowStepListIncludes(workflowSnippet, "Upload release evidence artifacts", "path", "dist/release-body.md"),
    false
  );
  assert.equal(
    workflowStepListIncludes(workflowSnippet, "Create GitHub Release with catalog shards", "files", "dist/release-body.md"),
    true
  );
});

test("release evidence documents a bounded local pre-release snapshot", async () => {
  const releaseEvidence = await readFile(path.join(repoRoot, "docs", "release-evidence.md"), "utf8");

  assert.equal(releaseEvidence.includes("287 files"), false, "release evidence must not include the stale 287-file count");
  assert.equal(
    releaseEvidence.includes("d600588f98f78ac4aedd2e43abea380d69fb5ffe"),
    false,
    "release evidence must not include the stale npm shasum"
  );
  assert.equal(
    releaseEvidence.includes("126C84045DDA5003E4CC5908CE8AA80DE593A77410CAAB15811F8B675F05F2AC"),
    false,
    "release evidence must not include the stale SHA-256"
  );

  assert.match(releaseEvidence, /package: @packsmith\/cli@1\.1\.0/);
  assert.match(releaseEvidence, /filename: packsmith-cli-1\.1\.0\.tgz/);
  assert.match(releaseEvidence, /entryCount: 294/);
  assert.match(releaseEvidence, /bounded local pre-release snapshot/i);
  assert.match(releaseEvidence, /snapshot metadata, not live package checksum claims/i);
  assert.match(releaseEvidence, /absolute temp destination/i);
  assert.match(releaseEvidence, /sha-256 was obtained/i);
  assert.match(releaseEvidence, /npm whoami: fails with `ENEEDAUTH`/);
  assert.match(releaseEvidence, /npm view @packsmith\/cli version: fails with npm `E404`/);
  assert.match(releaseEvidence, /GitHub CLI: unavailable|GitHub CLI: not installed/);
  assert.match(releaseEvidence, /origin: https:\/\/github\.com\/chenfei462\/packsmith\.git/);
  assert.match(releaseEvidence, /HEAD: 5f62472d821b7a64b29af17dc472f3545875e348/);
  assert.match(releaseEvidence, /not published/i);
  assert.match(releaseEvidence, /docs\/release-evidence\.md` is included in the package file set/);
  assert.match(releaseEvidence, /Re-run `npm\.cmd pack --dry-run --json`/);
  assert.match(releaseEvidence, /Get-FileHash -Algorithm SHA256/);
  assert.equal(
    releaseEvidence.includes("C:\\Users\\hacjr"),
    false,
    "release evidence should not publish a private absolute temp path"
  );
});

test("hackathon demo script parses with node --check", async () => {
  await execFileAsync(process.execPath, ["--check", path.join(repoRoot, "scripts", "hackathon-demo.mjs")]);
});

test("show explains declared and computed install risk", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-show-test-");

  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), "show", "senior-code-reviewer"], {
      cwd: repoRoot,
      env,
      timeout: 30000
    });

    assert.match(stdout, /Declared risk: low/);
    assert.match(stdout, /Computed install risk: medium/);
    assert.match(stdout, /Risk explanation: declared low; elevated to medium because filesystem: required, network: optional/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("passport prints the judge-ready target and trust summary", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-passport-test-");

  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "src", "cli.mjs"), "passport", "senior-code-reviewer"], {
      cwd: repoRoot,
      env,
      timeout: 30000
    });

    assert.match(stdout, /PACKSMITH PASSPORT — senior-code-reviewer/);
    assert.match(stdout, /^\s+Claude Code$/m);
    assert.match(stdout, /^\s+Codex$/m);
    assert.match(stdout, /^\s+GitHub Copilot$/m);
    assert.match(stdout, /^\s+Cursor$/m);
    assert.match(stdout, /^\s+OpenCode$/m);
    assert.match(stdout, /^\s+TRAE$/m);
    assert.match(stdout, /RISK ASSESSMENT\s+⚠ MEDIUM \(upgraded from declared: low\)/);
    assert.match(stdout, /Why: filesystem: required; network: optional/);
    assert.match(stdout, /Permissions: shell optional, filesystem required, network optional, browser none/);
    // PS-2: the redundant preview-only audit field is folded into the footer.
    assert.doesNotMatch(stdout, /Audit\s+preview-only/);
    assert.match(stdout, /Trust before install\. Nothing was written\./);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("hackathon verification script parses with node --check", async () => {
  await execFileAsync(process.execPath, ["--check", path.join(repoRoot, "scripts", "verify-hackathon.mjs")]);
});

test("Trae integration narrative is concrete and honest", async () => {
  const traeDoc = await readFile(path.join(repoRoot, "docs", "trae-integration.md"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const submission = await readFile(path.join(repoRoot, "docs", "hackathon-submission.md"), "utf8");

  assert.match(traeDoc, /Trae workflow packaging layer/);
  assert.match(traeDoc, /create workflows in Trae/i);
  assert.match(traeDoc, /portable, inspectable, and governable/i);
  assert.match(traeDoc, /local TRAE Skill directory support/);
  assert.match(traeDoc, /\.trae\/skills/);
  assert.match(traeDoc, /\.traecli\/skills/);
  assert.match(traeDoc, /~\/\.trae-cn\/skills/);
  assert.match(traeDoc, /does not claim a TRAE marketplace listing, hosted plugin distribution, or official partnership/i);
  assert.match(readme, /Trae workflow packaging layer/);
  assert.match(submission, /Trae workflow packaging layer/);
});

test("investor metrics package documents traction evidence honestly", async () => {
  const metrics = await readFile(path.join(repoRoot, "docs", "investor-metrics.md"), "utf8");
  const submission = await readFile(path.join(repoRoot, "docs", "hackathon-submission.md"), "utf8");
  const designPartnerEvidence = await readFile(path.join(repoRoot, "docs", "design-partner-evidence.md"), "utf8");

  assert.match(metrics, /Current Product Proof/);
  assert.match(metrics, /53 runtime-complete official packs/);
  assert.match(metrics, /30 launch-ready packs/);
  assert.match(metrics, /External Traction To Capture/);
  assert.match(metrics, /Design Partner Targets/);
  assert.match(metrics, /design-partner evidence is not yet captured/i);
  assert.match(metrics, /Do not claim npm downloads until/);
  assert.match(metrics, /design-partner-evidence\.md/);
  assert.match(submission, /Investor metrics/);
  assert.match(submission, /design partner evidence capture kit/i);
  assert.match(designPartnerEvidence, /Design Partner Evidence Capture/);
  assert.match(designPartnerEvidence, /5-10 engineering teams/);
  assert.match(designPartnerEvidence, /Interview Script/);
  assert.match(designPartnerEvidence, /Pilot Evidence Checklist/);
  assert.match(designPartnerEvidence, /Evidence Log Template/);
  assert.match(designPartnerEvidence, /Consent/);
  assert.match(designPartnerEvidence, /Before\/After Workflow/);
  assert.match(designPartnerEvidence, /Do not claim revenue/);
  assert.match(designPartnerEvidence, /Do not publish names without permission/);
  assert.match(designPartnerEvidence, /qualitative evidence/);
});

test("signing design documents future trust without overclaiming", async () => {
  const signingDesign = await readFile(path.join(repoRoot, "docs", "signing-design.md"), "utf8");
  const trustDoc = await readFile(path.join(repoRoot, "docs", "trust-and-audit.md"), "utf8");
  const registryAdapters = await readFile(path.join(repoRoot, "docs", "registry-and-adapters.md"), "utf8");
  const registryGuide = await readFile(path.join(repoRoot, "docs", "registry-submission-guide.md"), "utf8");
  const releaseEvidence = await readFile(path.join(repoRoot, "docs", "release-evidence.md"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const submission = await readFile(path.join(repoRoot, "docs", "hackathon-submission.md"), "utf8");

  assert.match(signingDesign, /Packsmith Signing Design/);
  assert.match(signingDesign, /Not implemented yet/);
  assert.match(signingDesign, /Sigstore\/Cosign signed bundle/);
  assert.match(signingDesign, /SLSA-style provenance/);
  assert.match(signingDesign, /official packs/);
  assert.match(signingDesign, /verified publisher keys/);
  assert.match(signingDesign, /Do not treat `verified` as a cryptographic signature/);
  assert.match(signingDesign, /Registry Metadata Shape/);
  assert.match(signingDesign, /Policy Additions/);
  assert.match(signingDesign, /Release Evidence/);
  assert.match(signingDesign, /Rollout Plan/);
  assert.match(trustDoc, /\[Signing design\]\(\.\/signing-design\.md\)/);
  assert.match(trustDoc, /does not claim signed publishing yet/);
  assert.match(registryAdapters, /\[Signing design\]\(\.\/signing-design\.md\)/);
  assert.match(registryAdapters, /remain future work/);
  assert.match(registryGuide, /\[Signing design\]\(\.\/signing-design\.md\)/);
  assert.match(registryGuide, /still future work/);
  assert.match(releaseEvidence, /Signing evidence/);
  assert.match(releaseEvidence, /does not have signed official-pack bundles yet/);
  assert.match(readme, /\[Signing design\]\(\.\/docs\/signing-design\.md\)/);
  assert.match(readme, /not implemented yet/);
  assert.match(submission, /Signed bundles and verified publisher keys/);
  assert.match(submission, /not claimed as implemented/);
});

test("hackathon verification script runs quick local release checks", async () => {
  const { tempRoot, env } = await createIsolatedEnv("packsmith-verify-test-");

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(repoRoot, "scripts", "verify-hackathon.mjs"), "--quick", "--skip-network"],
      {
        cwd: repoRoot,
        env,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 6
      }
    );

    assert.match(stdout, /Packsmith Hackathon Verification/);
    assert.match(stdout, /\[PASS\] demo script parses/);
    assert.match(stdout, /\[PASS\] hackathon demo test/);
    assert.match(stdout, /\[PASS\] registry quality gate/);
    assert.match(stdout, /\[PASS\] npm pack contains demo surface/);
    assert.match(stdout, /\[SKIP\] npm publication status/);
    assert.match(stdout, /Verification summary: pass/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("hackathon demo runs the hero flow in an isolated temporary home", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-hackathon-demo-test-"));

  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(repoRoot, "scripts", "hackathon-demo.mjs")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PACKSMITH_DEMO_ROOT: tempRoot,
        NO_COLOR: "1"
      },
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 4
    });

    assert.match(stdout, /Packsmith Hackathon Demo/);
    assert.match(stdout, /One workflow\. Six agent install plans\. One isolated install\. Trust before install\./);
    assert.match(stdout, /Workflow Pack -> Six Agent Plans -> Trust Passport/);
    assert.match(stdout, /search review/);
    assert.match(stdout, /targets/);
    assert.match(stdout, /preview senior-code-reviewer --target claude-code/);
    assert.match(stdout, /preview senior-code-reviewer --target codex/);
    assert.match(stdout, /preview senior-code-reviewer --target github-copilot/);
    assert.match(stdout, /preview senior-code-reviewer --target cursor/);
    assert.match(stdout, /preview senior-code-reviewer --target opencode/);
    assert.match(stdout, /preview senior-code-reviewer --target trae/);
    assert.match(stdout, /preview senior-code-reviewer --target trae/);
    assert.match(stdout, /\.copilot[/\\]skills[/\\]senior-code-reviewer/);
    assert.match(stdout, /score senior-code-reviewer/);
    assert.match(stdout, /doctor official-packs[/\\]senior-code-reviewer/);
    assert.match(stdout, /Ask Codex: Use senior-code-reviewer to review my current changes\./);
    assert.match(stdout, /Agent review payoff/);
    assert.match(stdout, /Prepared transcript from the installed workflow/);
    assert.match(stdout, /src[/\\]cli\.mjs/);
    assert.match(stdout, /Missing tests:/);
    assert.match(stdout, /Recommendation:/);
    assert.match(stdout, /Tamper detection: audit --ci caught checksum mismatch/);
    assert.match(stdout, /I changed one installed workflow file\. Packsmith caught it\./);
    assert.match(stdout, /trust gate for agent workflows/);
    assert.match(stdout, /PACKSMITH PASSPORT: senior-code-reviewer/);
    assert.match(stdout, /Claude Code\s+preview-ready/);
    assert.match(stdout, /Codex\s+installed/);
    assert.match(stdout, /GitHub Copilot\s+preview-ready/);
    assert.match(stdout, /Cursor\s+preview-ready/);
    assert.match(stdout, /OpenCode\s+preview-ready/);
    assert.match(stdout, /TRAE\s+preview-ready/);
    assert.match(stdout, /TRAE\s+preview-ready/);
    assert.match(stdout, /Registry metadata verified\s+yes/);
    assert.match(stdout, /Quality Score\s+95\/100/);
    assert.match(stdout, /Permissions\s+shell optional, filesystem required, network optional, browser none/);
    assert.match(stdout, /Install receipt\s+checksum sha256-/);
    assert.match(stdout, /Audit\s+tamper caught/);
    assert.match(stdout, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const installedPackDir = path.join(tempRoot, "home", ".codex", "skills", "senior-code-reviewer");
    await stat(path.join(installedPackDir, "AGENTS.md"));
    const lockfile = await readJson(path.join(tempRoot, "state", "packsmith.lock"));
    const receipt = await readJson(path.join(tempRoot, "state", "receipts", "senior-code-reviewer.codex.json"));

    assert.equal(receipt.target, "codex");
    assert.equal(receipt.installDir, installedPackDir);
    assert.match(receipt.checksum, /^sha256-/);
    assert.equal(lockfile.installed[0].target, "codex");
    assert.equal(lockfile.installed[0].installDir, installedPackDir);

    const tamperPath = path.join(installedPackDir, "tampered-demo.txt");
    assert.equal(await readFile(tamperPath, "utf8"), "demo tamper\n");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
