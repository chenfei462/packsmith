# Packsmith Noomo-Inspired 3D Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade four-route Packsmith website that adapts Noomo's full-viewport editorial pacing to Packsmith's own forge, Passport, Registry, runtime, and audit story, with a distinct 3D scene and substantial purposeful motion on every route.

**Architecture:** Keep the CLI package dependency-free by placing the React application in an independent `site/` package. A Node build step consumes the real Registry, target adapters, translations, preview plans, and quality results into a validated browser-safe data file; a persistent React Three Fiber canvas then renders route-specific scenes while semantic DOM pages remain authoritative and accessible. Vite builds a static GitHub Pages artifact and emits route shells for `/`, `/registry`, every `/registry/:pack-id`, `/docs`, and unknown-route fallback handling.

**Tech Stack:** React 19, TypeScript, Vite, React Router, React Three Fiber, Three.js, Drei, GSAP, Zustand, Lucide, Zod, Vitest, Testing Library, Playwright, axe-core, PNGJS, and pixelmatch.

---

## Working Context

- The approved design is `docs/superpowers/specs/2026-07-13-packsmith-immersive-website-design.md`.
- The current branch is `codex/optimization-plan`, and the working tree contains 274 existing changes, including 221 untracked paths. Preserve all unrelated work.
- Do not create a worktree from current `HEAD` while implementing this plan: the uncommitted Registry, target, workflow, and official-Pack data required by the site would be absent. Work in the current workspace unless those changes are first consolidated by their owner.
- Use exact-path staging and `git commit --only` for every task so unrelated staged changes are never included.
- Keep `site/package.json` and `site/package-lock.json` independent. Do not add React, Three.js, test, or build packages to the root package dependencies; the published CLI remains zero-runtime-dependency.
- `registry/catalog.json` currently contains 53 Packs and `src/lib/targets.mjs` contains 11 adapters, of which exactly six have `status === "supported"`.
- The catalog does not contain computed risk, checksum, preview writes, quality score, or audit state. Generate these through the existing `passport --json` CLI contract; do not duplicate trust logic or invent it in the browser.
- The npm package is not proven published. Primary commands must use `node src/cli.mjs ...`; never enable an `npx` CTA from `package.json.version` alone.
- Noomo is a behavior and composition reference only. Do not copy source, proprietary assets, copy, logos, or exact scene geometry.
- The requested `RTK.md` file is absent from the workspace. No additional project instruction can be loaded from that reference.

## Planned File Map

```text
site/
  package.json
  package-lock.json
  README.md
  index.html
  tsconfig.json
  vite.config.ts
  playwright.config.ts
  scripts/
    passport-client.mjs
    passport-client.test.mjs
    generate-repository-data.mjs
    generate-repository-data.test.mjs
    emit-route-shells.mjs
    emit-route-shells.test.mjs
  src/
    main.tsx
    app/
      App.tsx
      AppShell.tsx
      AppProviders.tsx
      RouteFocusManager.tsx
      RouteErrorPage.tsx
      routes.tsx
    animation/
      gsap.ts
      useSectionTimeline.ts
    components/
      BrandMark.tsx
      CommandCopy.tsx
      LanguageMenu.tsx
      Navigation.tsx
      Status.tsx
    content/
      docs.ts
      messages.ts
    data/
      commands.ts
      selectors.ts
      types.ts
      repositoryData.ts
    experience/
      ExperienceCanvas.tsx
      ExperienceProvider.tsx
      SceneDirector.tsx
      sceneStore.ts
      types.ts
      fallback/
      lifecycle/
      performance/
      primitives/
      scenes/
    features/
      demo/
      registry/
      pack-detail/
      docs/
    i18n/
      LanguageProvider.tsx
      locale.ts
    pages/
      HomePage.tsx
      RegistryPage.tsx
      PackDetailPage.tsx
      DocsPage.tsx
    styles/
      fonts.css
      global.css
      motion.css
      tokens.css
    test/
      render.tsx
      setup.ts
  e2e/
    accessibility.spec.ts
    canvas.spec.ts
    demo.spec.ts
    fallback.spec.ts
    routes.spec.ts
    helpers/
      canvas-pixels.ts
      console-guard.ts
```

## Task 1: Bootstrap The Isolated Site Toolchain

**Files:**
- Create: `site/package.json`
- Create: `site/package-lock.json`
- Create: `site/index.html`
- Create: `site/tsconfig.json`
- Create: `site/vite.config.ts`
- Create: `site/eslint.config.js`
- Create: `site/src/test/setup.ts`
- Create: `site/src/app/App.test.tsx`
- Create: `site/src/app/App.tsx`
- Create: `site/src/main.tsx`
- Modify: `.gitignore`

- [ ] **Step 1: Create the independent package manifest**

Create `site/package.json` with the following scripts before installing packages:

```json
{
  "name": "@packsmith/site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "data:generate": "node scripts/generate-repository-data.mjs",
    "dev": "npm run data:generate && vite",
    "typecheck": "npm run data:generate && tsc -b",
    "lint": "eslint . --max-warnings 0",
    "test:data": "node --test scripts/passport-client.test.mjs",
    "test": "npm run data:generate && vitest run",
    "test:watch": "vitest",
    "test:coverage": "npm run data:generate && vitest run --coverage",
    "build": "npm run data:generate && tsc -b && vite build && node scripts/emit-route-shells.mjs",
    "preview": "vite preview",
    "test:e2e": "playwright test",
    "test:visual": "playwright test --grep @visual",
    "test:canvas": "playwright test --grep @canvas",
    "check": "npm run typecheck && npm run lint && npm run test:data && npm test && npm run build"
  }
}
```

- [ ] **Step 2: Install exact site-only dependencies**

Run from the repository root:

```powershell
npm.cmd install --prefix site --save-exact react@19 react-dom@19 react-router-dom@7 three @react-three/fiber @react-three/drei @react-three/postprocessing gsap @gsap/react zustand lucide-react zod @fontsource/archivo-black @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono @fontsource-variable/noto-sans-sc
npm.cmd install --prefix site --save-dev --save-exact typescript vite @vitejs/plugin-react @types/react @types/react-dom @types/three vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @axe-core/playwright pngjs @types/pngjs pixelmatch eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals
```

Expected: `site/package-lock.json` is created and the root `package-lock.json` remains unchanged.

- [ ] **Step 3: Add TypeScript, Vite, Vitest, and test setup configuration**

Create `site/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts"]
}
```

Create `site/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.SITE_BASE_PATH || "/";

export default defineConfig({
  base,
  publicDir: "../docs/assets",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 75, branches: 80, statements: 80 }
    }
  }
});
```

Create `site/eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "src/generated"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
```

Create `site/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  })
});
```

- [ ] **Step 4: Write the first failing application test**

Create `site/src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders Packsmith as the first viewport product signal", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /package manager for ai agent workflows/i })).toBeVisible();
  expect(screen.getByText("Packsmith")).toBeVisible();
});
```

- [ ] **Step 5: Run the test and verify RED**

Run:

```powershell
npm.cmd exec --prefix site -- vitest run src/app/App.test.tsx
```

Expected: FAIL because `site/src/app/App.tsx` does not exist.

- [ ] **Step 6: Add the minimal application entry**

Create `site/src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <p>Packsmith</p>
      <h1>The package manager for AI agent workflows.</h1>
    </main>
  );
}
```

Create `site/src/main.tsx` and `site/index.html` with a `#root` mount and `createRoot(...).render(<App />)`.

- [ ] **Step 7: Verify GREEN and isolate generated output**

Run the focused test again. Add these entries to `.gitignore`:

```gitignore
site/node_modules/
site/dist/
site/coverage/
site/playwright-report/
site/test-results/
site/src/generated/*
!site/src/generated/.gitkeep
site/.cache/
```

Expected: the focused test passes and `git status --short` does not show dependency or build output directories.

- [ ] **Step 8: Commit the tooling task only**

```powershell
git add .gitignore site/package.json site/package-lock.json site/index.html site/tsconfig.json site/vite.config.ts site/eslint.config.js site/src/test/setup.ts site/src/app/App.test.tsx site/src/app/App.tsx site/src/main.tsx
git commit --only -m "build: scaffold isolated website package" -- .gitignore site/package.json site/package-lock.json site/index.html site/tsconfig.json site/vite.config.ts site/eslint.config.js site/src/test/setup.ts site/src/app/App.test.tsx site/src/app/App.tsx site/src/main.tsx
```

## Task 2: Add A Deterministic Passport CLI Client

**Files:**
- Create: `site/scripts/passport-client.mjs`
- Create: `site/scripts/passport-client.test.mjs`

- [ ] **Step 1: Write the failing real-contract test**

Create `site/scripts/passport-client.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPassport } from "./passport-client.mjs";

test("loads truthful Passport JSON without writing to the real user home", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "packsmith-passport-client-"));
  const passport = await loadPassport("senior-code-reviewer", { cacheRoot });

  assert.equal(passport.pack.id, "senior-code-reviewer");
  assert.equal(passport.targetSummary.ready, 6);
  assert.equal(passport.provenance.verified, true);
  assert.match(passport.provenance.checksum, /^sha256-/);
  assert.equal(passport.score.overall, 95);
  assert.equal(passport.audit.status, "preview-only");
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm.cmd run test:data --prefix site
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `passport-client.mjs`.

- [ ] **Step 3: Implement the isolated CLI client**

Create `site/scripts/passport-client.mjs`:

```js
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadPassport(packId, options = {}) {
  if (!packIdPattern.test(packId)) {
    throw new Error(`Invalid Pack ID "${packId}".`);
  }

  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const cacheRoot = options.cacheRoot ?? path.join(repoRoot, "site", ".cache", "passport", packId);
  const homeDir = path.join(cacheRoot, "home");
  const stateDir = path.join(cacheRoot, "state");
  const projectDir = path.join(cacheRoot, "project");

  await Promise.all([
    mkdir(homeDir, { recursive: true }),
    mkdir(stateDir, { recursive: true }),
    mkdir(projectDir, { recursive: true })
  ]);

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(repoRoot, "src", "cli.mjs"), "passport", packId, "--json"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          PACKSMITH_HOME: stateDir,
          PACKSMITH_TEST_HOME: homeDir,
          NO_COLOR: "1"
        },
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      }
    );

    return JSON.parse(stdout);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
}
```

This uses the existing Packsmith CLI JSON contract instead of duplicating trust logic. All preview cache and fake target paths stay inside the supplied temporary directory and are removed in `finally`.

- [ ] **Step 4: Verify GREEN and invalid-ID behavior**

Add a second assertion that `loadPassport("../secret")` rejects with `Invalid Pack ID`, then run:

```powershell
npm.cmd run test:data --prefix site
```

Expected: both Passport client tests pass and no `~/.packsmith` directory is touched.

- [ ] **Step 5: Commit the client only**

```powershell
git add site/scripts/passport-client.mjs site/scripts/passport-client.test.mjs
git commit --only -m "feat: add isolated passport data client" -- site/scripts/passport-client.mjs site/scripts/passport-client.test.mjs
```

## Task 3: Generate And Validate Browser-Safe Repository Data

**Files:**
- Modify: `site/package.json`
- Create: `site/scripts/generate-repository-data.mjs`
- Create: `site/scripts/generate-repository-data.test.mjs`
- Create: `site/src/generated/.gitkeep`
- Create: `site/src/data/types.ts`
- Create: `site/src/data/repositoryData.ts`

- [ ] **Step 1: Write the failing generator test**

Create `site/scripts/generate-repository-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRepositoryData } from "./generate-repository-data.mjs";

test("generates truthful portable site data from the repository", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "packsmith-site-data-"));
  const outputPath = path.join(outputDir, "repository-data.json");
  await generateRepositoryData({ outputPath });
  const data = JSON.parse(await readFile(outputPath, "utf8"));
  const reviewer = data.packs.find((pack) => pack.id === "senior-code-reviewer");
  const accessibility = data.packs.find((pack) => pack.id === "accessibility-auditor");

  assert.equal(data.packs.length, 53);
  assert.deepEqual(data.supportedTargetIds, ["claude-code", "codex", "github-copilot", "opencode", "cursor", "trae"]);
  assert.equal(reviewer.passport.qualityScore, 95);
  assert.equal(reviewer.passport.audit.status, "preview-only");
  assert.equal(accessibility.previews["github-copilot"].status, "not-declared");
  assert.doesNotMatch(JSON.stringify(data), /[A-Z]:\\|\/home\/runner/);
  await rm(outputDir, { recursive: true, force: true });
});
```

Update `site/package.json` so `test:data` is:

```json
"test:data": "node --test scripts/passport-client.test.mjs scripts/generate-repository-data.test.mjs"
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm.cmd run test:data --prefix site
```

Expected: FAIL because the generator module does not exist.

- [ ] **Step 3: Implement schema validation and deterministic generation**

Create `site/scripts/generate-repository-data.mjs` with an exported `generateRepositoryData({ outputPath })`. It must:

1. Parse `registry/catalog.json`, `i18n/config.json`, and all configured translation files with Zod.
2. Import `TARGET_ADAPTERS` in Node only and call `loadPassport` from `site/scripts/passport-client.mjs` once per catalog Pack.
3. Filter supported targets with `adapter.status === "supported"`; never use `SUPPORTED_TARGET_IDS` for the public six-target count.
4. Run Passport generation inside `site/.cache/site-data/{home,state,project}` and clean that directory in `finally`.
5. Use catalog `targets` as the authority for `{ status: "not-declared" }`; do not expose an internal preview failure as if the Pack had declared that runtime.
6. Convert `installDir` and `writePaths` to POSIX templates beginning with `<home>/` or `<project>/`; reject remaining absolute paths.
7. Serialize catalog `updatedAt` rather than the current clock so repeated generation is byte-stable.
8. Write UTF-8 JSON to `site/src/generated/repository-data.json` by default.
9. Hash catalog, translations, target/pack/registry/CLI sources, and official-Pack files into `site/.cache/repository-data-fingerprint.json`; when the fingerprint and output both match, reuse the generated data so `typecheck`, `test`, and `build` do not repeat 53 Passport subprocesses in one run.
10. Limit Passport subprocess concurrency to two and sort final Packs by ID before serialization.

Use this public TypeScript contract in `site/src/data/types.ts`:

```ts
export type RuntimeId = "claude-code" | "codex" | "github-copilot" | "opencode" | "cursor" | "trae";
export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type PermissionLevel = "none" | "optional" | "required";
export type CatalogLocale = "en" | "zh" | "ja" | "ko" | "es" | "fr" | "de";
export type SiteLocale = "en" | "zh";

export interface RuntimeTarget {
  id: RuntimeId;
  name: string;
  scopes: readonly string[];
  defaultScope: string;
  installSubdirs: Readonly<Record<string, string>>;
  skillDirectoryFormat: string;
  bridgeFiles: readonly string[];
  compatibilityWarnings: readonly string[];
}

export interface TargetPreview {
  targetId: RuntimeId;
  status: "preview-ready" | "not-declared" | "not-ready";
  scope?: string;
  installPathTemplate?: string;
  writes: readonly string[];
  checksum?: string;
  checksumStatus?: "calculated" | "matched" | "mismatch";
  bridgeFiles: readonly string[];
  warnings: readonly string[];
  reason?: string;
}

export interface SitePack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: readonly string[];
  license: string;
  repository: string;
  homepage: string;
  updatedAt: string;
  compatibilityNotes: string;
  targetIds: readonly RuntimeId[];
  permissions: Readonly<Record<"shell" | "filesystem" | "network" | "browser", PermissionLevel>>;
  declaredRisk: RiskLevel;
  estimatedContextSize: number;
  verified: boolean;
  publisher: { id: string; verified: boolean };
  localizations: Partial<Record<CatalogLocale, { name: string; description: string }>>;
  passport: {
    computedRisk: RiskLevel;
    riskReasons: readonly string[];
    qualityScore: number;
    checksum: string;
    checksumStatus: "calculated" | "matched" | "mismatch";
    context: { estimatedChars: number; tokenPressure: string };
    audit: { status: "preview-only"; reason: string };
  };
  previews: Readonly<Record<RuntimeId, TargetPreview>>;
}

export interface RepositoryData {
  schemaVersion: number;
  catalogUpdatedAt: string;
  supportedTargetIds: readonly RuntimeId[];
  targets: readonly RuntimeTarget[];
  packs: readonly SitePack[];
}
```

Create `site/src/data/repositoryData.ts`:

```ts
import data from "../generated/repository-data.json";
import type { RepositoryData } from "./types";

export const repositoryData = data as RepositoryData;
```

- [ ] **Step 4: Verify GREEN and deterministic output**

Run the generator test twice and compare hashes:

```powershell
npm.cmd run test:data --prefix site
npm.cmd run data:generate --prefix site
Get-FileHash site/src/generated/repository-data.json
npm.cmd run data:generate --prefix site
Get-FileHash site/src/generated/repository-data.json
```

Expected: the test passes and both SHA256 hashes match.

- [ ] **Step 5: Commit generator sources only**

```powershell
git add site/package.json site/scripts/generate-repository-data.mjs site/scripts/generate-repository-data.test.mjs site/src/generated/.gitkeep site/src/data/types.ts site/src/data/repositoryData.ts
git commit --only -m "feat: generate truthful site repository data" -- site/package.json site/scripts/generate-repository-data.mjs site/scripts/generate-repository-data.test.mjs site/src/generated/.gitkeep site/src/data/types.ts site/src/data/repositoryData.ts
```

## Task 4: Add Selectors, Commands, And Localization

**Files:**
- Create: `site/src/data/selectors.test.ts`
- Create: `site/src/data/selectors.ts`
- Create: `site/src/data/commands.test.ts`
- Create: `site/src/data/commands.ts`
- Create: `site/src/content/messages.ts`
- Create: `site/src/i18n/locale.test.ts`
- Create: `site/src/i18n/locale.ts`
- Create: `site/src/i18n/LanguageProvider.tsx`

- [ ] **Step 1: Write failing selector and command tests**

```ts
import { repositoryData } from "./repositoryData";
import { filterPacks, getPackById } from "./selectors";
import { buildInstallCommand } from "./commands";

test("filters from one authoritative pack collection", () => {
  const results = filterPacks(repositoryData.packs, { q: "review", category: "", target: "codex", risk: "", sort: "name" });
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((pack) => pack.targetIds.includes("codex"))).toBe(true);
});

test("returns undefined for an unknown exact id", () => {
  expect(getPackById(repositoryData.packs, "does-not-exist")).toBeUndefined();
});

test("builds only a truthful source-tree command for ready targets", () => {
  const pack = getPackById(repositoryData.packs, "senior-code-reviewer")!;
  expect(buildInstallCommand(pack, "codex")).toBe("node src/cli.mjs install senior-code-reviewer --target codex --yes");
});

test("rejects a target not declared by the pack", () => {
  const pack = getPackById(repositoryData.packs, "accessibility-auditor")!;
  expect(() => buildInstallCommand(pack, "github-copilot")).toThrow(/not available/i);
});
```

Create `site/src/i18n/locale.test.ts`:

```ts
import { detectCatalogLocale } from "./locale";

test("prefers a valid stored locale and normalizes regional browser tags", () => {
  expect(detectCatalogLocale("en-US", "zh")).toBe("zh");
  expect(detectCatalogLocale("ja-JP", null)).toBe("ja");
  expect(detectCatalogLocale("pt-BR", null)).toBe("en");
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd test --prefix site -- --run src/data/selectors.test.ts src/data/commands.test.ts src/i18n/locale.test.ts
```

Expected: FAIL because the selector, command, and locale modules do not exist.

- [ ] **Step 3: Implement pure data and locale functions**

Implement `filterPacks` with case-insensitive matching against `id`, localized `name`, localized `description`, `category`, and tags; apply category, target, and risk filters before stable `name`, `quality`, or `updated` sorting. Implement exact-ID `getPackById` with `Array.find`.

Implement `buildInstallCommand(pack, targetId)` so it checks `pack.previews[targetId].status === "preview-ready"` before returning:

```ts
return `node src/cli.mjs install ${pack.id} --target ${targetId} --yes`;
```

Implement `detectCatalogLocale(language, stored)` in `site/src/i18n/locale.ts`; accept only the seven `CatalogLocale` values, prefer a valid stored override, map regional language tags by their first segment, and otherwise return `"en"`.

Create English and Chinese marketing dictionaries in `site/src/content/messages.ts`. Other catalog locales use English marketing UI with their translated Pack names and descriptions.

- [ ] **Step 4: Implement and test the provider**

`LanguageProvider` must initialize from `localStorage.getItem("packsmith.locale")`, fall back to `navigator.language`, update `<html lang>`, persist explicit changes, and expose `{ locale, siteLocale, setLocale, t }`. Add a component test proving Chinese selection persists and changes the navigation labels.

- [ ] **Step 5: Verify GREEN**

Run the focused tests and `npm.cmd run typecheck --prefix site`.

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the data-facing browser modules**

```powershell
git add site/src/data site/src/content/messages.ts site/src/i18n
git commit --only -m "feat: add site selectors commands and locale state" -- site/src/data site/src/content/messages.ts site/src/i18n
```

## Task 5: Build The Route Shell And Noomo-Inspired Design System

**Files:**
- Create: `site/src/app/AppProviders.tsx`
- Create: `site/src/app/AppShell.tsx`
- Create: `site/src/app/RouteFocusManager.tsx`
- Create: `site/src/app/RouteErrorPage.tsx`
- Create: `site/src/app/routes.tsx`
- Create: `site/src/components/BrandMark.tsx`
- Create: `site/src/components/LanguageMenu.tsx`
- Create: `site/src/components/Navigation.tsx`
- Create: `site/src/components/Status.tsx`
- Create: `site/src/test/render.tsx`
- Create: `site/src/styles/fonts.css`
- Create: `site/src/styles/tokens.css`
- Create: `site/src/styles/global.css`
- Create: `site/src/styles/motion.css`
- Create: `site/src/pages/HomePage.tsx`
- Create: `site/src/pages/RegistryPage.tsx`
- Create: `site/src/pages/PackDetailPage.tsx`
- Create: `site/src/pages/DocsPage.tsx`
- Modify: `site/src/app/App.tsx`
- Modify: `site/src/main.tsx`
- Modify: `site/src/app/App.test.tsx`

- [ ] **Step 1: Expand the failing route-shell test**

Render the app at `/registry`, `/registry/senior-code-reviewer`, and `/docs` with `createMemoryRouter`. Assert a single navigation landmark, a skip link, Packsmith brand, current route heading, language control, and `main` landmark. Assert the unknown Pack route renders `Pack not found` and a Registry link.

- [ ] **Step 2: Verify RED**

Expected: FAIL because routing, navigation, route errors, and providers are absent.

- [ ] **Step 3: Implement the router and stable application shell**

Use `createBrowserRouter(routes, { basename: normalizeBasename(import.meta.env.BASE_URL) })` in production and a route object export for tests. The route tree is:

```tsx
{
  path: "/",
  element: <AppShell />,
  errorElement: <RouteErrorPage />,
  children: [
    { index: true, lazy: () => import("../pages/HomePage") },
    { path: "registry", lazy: () => import("../pages/RegistryPage") },
    { path: "registry/:packId", lazy: () => import("../pages/PackDetailPage") },
    { path: "docs", lazy: () => import("../pages/DocsPage") }
  ]
}
```

`AppShell` renders the skip link, persistent navigation, a stable `#experience-root` host, `<Outlet />`, and a polite live region. `RouteFocusManager` focuses the destination `h1` after pathname changes but does not react to hash-only documentation navigation. Create minimal semantic route components with their final H1 text and export each route component as the named `Component` expected by React Router lazy modules; `PackDetailPage` uses exact-ID lookup and renders `Pack not found` plus a Registry link for an unknown ID. Task 6 replaces the stable experience host content with the persistent Canvas, and Tasks 7-10 expand the route bodies.

- [ ] **Step 4: Establish visual tokens and typography**

Define semantic tokens including:

```css
:root {
  --ink: #181520;
  --forge-0: #080a0e;
  --forge-1: #11151b;
  --graphite: #1b2229;
  --blueprint: #c9d2e7;
  --paper: #edf1f7;
  --cyan: #2be4d0;
  --orange: #ff6b2c;
  --success: #4ce0a3;
  --warning: #f0b94f;
  --danger: #ff5b62;
  --focus: #fff06a;
  --display: "Archivo Black", "Noto Sans SC", sans-serif;
  --body: "IBM Plex Sans", "Noto Sans SC", sans-serif;
  --mono: "IBM Plex Mono", monospace;
  --page-gutter: clamp(1rem, 3vw, 3rem);
  --nav-height: 6rem;
}
```

Import the specified Fontsource files in `fonts.css`. Keep cards at `8px` radius or less, avoid cards inside cards, use large type only in route heroes, and use unframed full-width content bands elsewhere.

```css
@import "@fontsource/archivo-black/400.css";
@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/600.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource-variable/noto-sans-sc";
```

- [ ] **Step 5: Build accessible navigation interactions**

Use Lucide `Menu`, `X`, `ArrowUpRight`, and `Languages` icons. The mobile menu is a real button with `aria-expanded`, closes on route change and Escape, traps no focus when closed, and preserves 44px targets. Add visible focus styles and `prefers-reduced-motion` overrides.

- [ ] **Step 6: Verify GREEN at desktop and mobile DOM sizes**

Run component tests and render at 375px and 1440px in jsdom by setting `window.innerWidth`. Assert no duplicate navigation and all controls remain reachable.

- [ ] **Step 7: Commit the route shell and design system**

```powershell
git add site/src/app site/src/components site/src/styles site/src/pages site/src/main.tsx
git commit --only -m "feat: add immersive site shell and routing" -- site/src/app site/src/components site/src/styles site/src/pages site/src/main.tsx
```

## Task 6: Implement The Persistent 3D Experience Runtime

**Files:**
- Create: `site/src/experience/types.ts`
- Create: `site/src/experience/sceneStore.test.ts`
- Create: `site/src/experience/sceneStore.ts`
- Create: `site/src/experience/performance/derivePerformanceTier.test.ts`
- Create: `site/src/experience/performance/derivePerformanceTier.ts`
- Create: `site/src/experience/performance/FrameGovernor.test.ts`
- Create: `site/src/experience/performance/FrameGovernor.tsx`
- Create: `site/src/experience/ExperienceProvider.tsx`
- Create: `site/src/experience/ExperienceCanvas.tsx`
- Create: `site/src/experience/SceneDirector.tsx`
- Create: `site/src/experience/primitives/PackArtifact.tsx`
- Create: `site/src/experience/primitives/ScanGrid.tsx`
- Create: `site/src/experience/primitives/TrailPath.tsx`
- Create: `site/src/experience/fallback/FallbackStage.tsx`
- Create: `site/src/experience/lifecycle/useVisibilityPause.ts`
- Create: `site/src/experience/lifecycle/useContextRecovery.ts`

- [ ] **Step 1: Write failing state and performance tests**

Define tests for this discriminated union:

```ts
export type RouteSceneInput =
  | { scene: "home"; section: string; packId: string; targetId: RuntimeId; demoStep: number; progress: number }
  | { scene: "registry"; packIds: readonly string[]; focusedPackId?: string; progress: number }
  | { scene: "pack-detail"; packId: string; targetId?: RuntimeId; layer: string; progress: number }
  | { scene: "docs"; topic: string; progress: number };
```

Assert the store keeps exactly one active input, progress updates do not recreate unrelated state, route changes preserve an outgoing scene until `markIncomingReady()`, and `completeTransition()` releases it. Test performance decisions for high, balanced, low, reduced-motion, and WebGL-unavailable inputs.

- [ ] **Step 2: Verify RED**

Run the two focused test files. Expected: module-not-found failures.

- [ ] **Step 3: Implement the vanilla Zustand scene store**

Use `createStore` from `zustand/vanilla` so GSAP and R3F can update/read scene state without React rendering every frame. Store `{ active, outgoing, incomingReady, paused, contextLosses }` and expose `setScene`, `patchScene`, `markIncomingReady`, `completeTransition`, `setPaused`, and `recordContextLoss`.

- [ ] **Step 4: Implement deterministic performance tiers**

`derivePerformanceTier` accepts `{ width, coarsePointer, saveData, hardwareConcurrency, deviceMemory, reducedMotion, webgl }` and returns:

```ts
type PerformanceConfig = {
  tier: "high" | "balanced" | "low" | "fallback";
  dpr: number;
  particles: number;
  shadows: false | 512 | 1024;
  postprocessing: boolean;
  continuous: boolean;
};
```

Use high only for fine pointer, width >= 1024, at least eight cores and 8GB; use low for coarse pointer, width < 640, Save-Data, or at most four cores/GB; return fallback when WebGL is false. Reduced motion preserves the selected static 3D composition but sets particles to zero and continuous to false.

`FrameGovernor` observes a rolling 120-frame window. When p95 frame time exceeds 24ms, it lowers the session by one tier and never auto-promotes during that session. Its pure sample reducer is covered by `FrameGovernor.test.ts` so GPU rendering is not mocked in jsdom.

- [ ] **Step 5: Mount one canvas outside the router outlet**

`ExperienceCanvas` owns one fixed full-bleed `<Canvas>` with capped DPR, route lighting, `PackArtifact`, and `SceneDirector`. Set `eventSource` to the app shell root so pointer interaction works through semantic overlays. Use lazy scene modules inside `Suspense`; keep `PackArtifact` visible while a route chunk loads so the canvas never turns blank.

- [ ] **Step 6: Add lifecycle and fallback behavior**

Pause the store on `visibilitychange`. On first `webglcontextlost`, prevent default and remount the renderer once; on a second loss set tier `fallback`. A scene-chunk error boundary keeps route DOM visible and offers one explicit retry that clears only the failed lazy import state. `FallbackStage` selects a route-specific CSS composition and never removes page DOM. Mark the canvas `aria-hidden="true"` and keep it outside tab order.

- [ ] **Step 7: Verify GREEN and singleton mounting**

Component-test the fallback decision and assert route changes leave one canvas host. Run typecheck.

- [ ] **Step 8: Commit the experience runtime**

```powershell
git add site/src/experience
git commit --only -m "feat: add persistent 3d experience runtime" -- site/src/experience
```

## Task 7: Build The Home Narrative And Forge Scene

**Files:**
- Create: `site/src/features/demo/demoMachine.test.ts`
- Create: `site/src/features/demo/demoMachine.ts`
- Create: `site/src/features/demo/DemoSequence.test.tsx`
- Create: `site/src/features/demo/DemoSequence.tsx`
- Create: `site/src/features/hero/HeroSection.tsx`
- Create: `site/src/features/passport/PassportGrid.tsx`
- Create: `site/src/features/runtime-network/RuntimeNetworkSection.tsx`
- Create: `site/src/features/proof/ProofSection.tsx`
- Create: `site/src/features/install/InstallSection.tsx`
- Create: `site/src/experience/scenes/home/HomeScene.tsx`
- Modify: `site/src/pages/HomePage.tsx`

- [ ] **Step 1: Write failing demo-machine tests**

Test the exact state sequence `search -> passport -> preview -> target -> install -> use`, forward/back navigation, skip-to-install, selected target validation, and command derivation from the selected Pack. Assert no state claims browser-side installation.

- [ ] **Step 2: Verify RED and implement the reducer**

Run the focused test, then implement a pure reducer with `NEXT`, `BACK`, `SKIP`, `SELECT_PACK`, `SELECT_TARGET`, and `RESET`. Keep the six step IDs in a readonly tuple so scene and DOM labels cannot drift.

- [ ] **Step 3: Write failing HomePage component tests**

Assert the page contains the literal category H1, both primary actions, all six demo steps, Passport permissions/risk/checksum/quality/audit facts from `senior-code-reviewer`, all six runtime names, real official-Pack and supported-runtime counts, planned team capabilities labeled `Planned`, and the source-tree install command.

- [ ] **Step 4: Implement the eight full-width home scenes**

Compose `HomePage` from forge hero, portability problem, guided demo, Passport, runtime network, repository proof, team value, and install sections. Use native document scroll and IntersectionObserver to update the active home scene input. Keep the next section visible below the hero at all desktop and mobile viewport heights.

`ProofSection` renders the real `packsmith-demo.svg` exposed through Vite's configured `publicDir`, with intrinsic dimensions and descriptive alt text. Do not use the outdated five-runtime hero GIF.

- [ ] **Step 5: Implement the procedural HomeScene**

Use instanced fragments that assemble into `PackArtifact`, a scanning plane, perspective `ScanGrid`, six `TrailPath` connections, and route lighting in cyan/orange against graphite. Seed fragment positions from Pack ID, read progress from the vanilla store in `useFrame`, and avoid React state updates per frame.

- [ ] **Step 6: Add GSAP timelines with cleanup**

Register GSAP and ScrollTrigger once in `site/src/animation/gsap.ts`. `useSectionTimeline` creates timelines through `gsap.context()` and returns `context.revert()` on unmount. Animate text masks, transforms, opacity, and scene-store progress only; never animate layout dimensions.

- [ ] **Step 7: Verify GREEN**

Run demo, HomePage, data, and typecheck tests. Manually tab through every Home action and confirm the demo can complete without animation timing.

- [ ] **Step 8: Commit the Home experience**

```powershell
git add site/src/features/demo site/src/features/hero site/src/features/passport site/src/features/runtime-network site/src/features/proof site/src/features/install site/src/experience/scenes/home site/src/pages/HomePage.tsx site/src/animation
git commit --only -m "feat: build immersive packsmith home story" -- site/src/features/demo site/src/features/hero site/src/features/passport site/src/features/runtime-network site/src/features/proof site/src/features/install site/src/experience/scenes/home site/src/pages/HomePage.tsx site/src/animation
```

## Task 8: Build The Spatial Registry

**Files:**
- Create: `site/src/features/registry/registryQuery.test.ts`
- Create: `site/src/features/registry/registryQuery.ts`
- Create: `site/src/features/registry/RegistryControls.tsx`
- Create: `site/src/features/registry/RegistryResults.test.tsx`
- Create: `site/src/features/registry/RegistryResults.tsx`
- Create: `site/src/features/registry/RegistryResultRow.tsx`
- Create: `site/src/experience/scenes/registry/registryLayout.test.ts`
- Create: `site/src/experience/scenes/registry/registryLayout.ts`
- Create: `site/src/experience/scenes/registry/RegistryScene.tsx`
- Modify: `site/src/pages/RegistryPage.tsx`

- [ ] **Step 1: Write failing URL-query tests**

Test parsing and serializing `?q=&category=&target=&risk=&sort=`. Unknown category, target, risk, and sort values must normalize to empty/default values; search text must round-trip through URL encoding.

- [ ] **Step 2: Write failing result synchronization tests**

Render Registry with a memory router, select `target=github-copilot`, and assert exactly 30 current Pack result rows. Assert the scene store receives the same 30 Pack IDs in the same stable order. Focus a row and assert only `focusedPackId` changes.

- [ ] **Step 3: Implement semantic controls and dense results**

Use a search input, select menus for category/target/risk/sort, result count, and reset command. URL search parameters are authoritative. Render unframed result rows with name, category, risk, quality, target count, and a detail link; do not nest cards.

Open with a full-viewport oversized Registry statement and leave a visible hint of the filter/results band. Use `useSectionTimeline` for the route-title reveal, filter-band entrance, result-row stagger, count changes, and focus-line motion while keeping all controls immediately usable.

- [ ] **Step 4: Implement deterministic spatial layout**

`layoutRegistryPacks(packIds, seed)` hashes each ID into a stable helix/field position and returns `{ id, position, rotation, scale }`. Tests assert deterministic output, unique positions, stable ordering, and finite values for zero/one/53 Packs.

- [ ] **Step 5: Implement RegistryScene motion**

Render low-poly Pack objects through `InstancedMesh`. Filter changes interpolate matrices instead of recreating meshes; focused keyboard/pointer Pack separates and brightens. The DOM list remains the only navigation target. Low tier caps rendered particles/lines while keeping all Pack labels in DOM.

- [ ] **Step 6: Verify GREEN and commit**

Run Registry query, results, layout, and typecheck tests, then commit exact Registry paths with message `feat: add spatial registry experience`.

```powershell
git add site/src/features/registry site/src/experience/scenes/registry site/src/pages/RegistryPage.tsx
git commit --only -m "feat: add spatial registry experience" -- site/src/features/registry site/src/experience/scenes/registry site/src/pages/RegistryPage.tsx
```

## Task 9: Build Pack Detail And Exploded Passport Inspection

**Files:**
- Create: `site/src/features/pack-detail/packDetailModel.test.ts`
- Create: `site/src/features/pack-detail/packDetailModel.ts`
- Create: `site/src/features/pack-detail/TargetSelector.tsx`
- Create: `site/src/features/pack-detail/PassportFacts.tsx`
- Create: `site/src/features/pack-detail/PreviewWrites.tsx`
- Create: `site/src/features/pack-detail/VerificationCommand.tsx`
- Create: `site/src/experience/scenes/pack-detail/passportLayerModel.test.ts`
- Create: `site/src/experience/scenes/pack-detail/passportLayerModel.ts`
- Create: `site/src/experience/scenes/pack-detail/PackDetailScene.tsx`
- Create: `site/src/pages/PackDetailPage.test.tsx`
- Modify: `site/src/pages/PackDetailPage.tsx`

- [ ] **Step 1: Write failing detail-model tests**

Assert exact Pack lookup, unknown-ID failure, default selection of the first preview-ready target, preservation of an explicitly requested unavailable target, target-specific writes/checksum, and refusal to create an install command for `not-declared` or `not-ready` targets.

- [ ] **Step 2: Verify RED and implement the pure model**

The route reads `packId` from params and `target` from URL search params. An unknown Pack throws `new Response("Pack not found", { status: 404 })`. A known unavailable target stays selected and renders `Not available for this Pack`; it never silently changes to another runtime.

- [ ] **Step 3: Write failing page tests**

For `senior-code-reviewer?target=codex`, assert publisher verification, declared/computed risk, risk reasons, four permissions, quality, checksum status, preview-only audit wording, exact normalized write paths, and copyable source command. For `accessibility-auditor?target=github-copilot`, assert no command is shown.

- [ ] **Step 4: Implement the semantic Passport surface**

Use a segmented target selector, unframed fact bands, expandable evidence rows, a write-path table, and one final verification command. Color is always paired with icon and text. Keep content in DOM order matching the exploded visual layer order.

Open with an oversized Pack name and live Passport status, then animate fact-band reveals, checksum tracing, write-path sequencing, target-selector motion, and final verification without delaying content or focus.

- [ ] **Step 5: Implement the exploded Passport scene**

`passportLayerModel(layer, progress)` returns transforms for manifest, permissions, risk, provenance, writes, and adapter layers. Tests require finite transforms at 0/0.5/1 and full reassembly at the install section. `PackDetailScene` uses shared `PackArtifact` materials, separates layers with scroll progress, rotates the adapter layer on target changes, and reassembles for the CTA.

- [ ] **Step 6: Verify GREEN and commit**

Run model, page, scene-layout, and typecheck tests. Commit exact Pack detail paths with message `feat: add exploded pack passport detail`.

```powershell
git add site/src/features/pack-detail site/src/experience/scenes/pack-detail site/src/pages/PackDetailPage.test.tsx site/src/pages/PackDetailPage.tsx
git commit --only -m "feat: add exploded pack passport detail" -- site/src/features/pack-detail site/src/experience/scenes/pack-detail site/src/pages/PackDetailPage.test.tsx site/src/pages/PackDetailPage.tsx
```

## Task 10: Build Animated Documentation Pipeline

**Files:**
- Create: `site/src/content/docs.ts`
- Create: `site/src/features/docs/docsManifest.test.ts`
- Create: `site/src/features/docs/docsManifest.ts`
- Create: `site/src/features/docs/DocsNav.tsx`
- Create: `site/src/features/docs/DocsSection.tsx`
- Create: `site/src/experience/scenes/docs/pipelineModel.test.ts`
- Create: `site/src/experience/scenes/docs/pipelineModel.ts`
- Create: `site/src/experience/scenes/docs/DocsScene.tsx`
- Create: `site/src/pages/DocsPage.test.tsx`
- Modify: `site/src/pages/DocsPage.tsx`

- [ ] **Step 1: Write failing documentation manifest tests**

Define the exact topics `install`, `author`, `publish`, `trust`, `policy`, and `audit`. Test unique IDs, English and Chinese title/summary content, at least one real command per topic, valid repository documentation links, and hash lookup fallback to `install`.

- [ ] **Step 2: Verify RED and create structured content**

Create `docs.ts` as typed English/Chinese topic records. Use only source-tree commands verified in README and existing docs, including `node src/cli.mjs passport senior-code-reviewer`, `node src/cli.mjs preview senior-code-reviewer --target codex`, `node src/cli.mjs init my-pack`, `node src/cli.mjs publish my-pack --dry-run`, `node src/cli.mjs policy validate examples/policy.json`, and `node src/cli.mjs audit --ci`. Link to the corresponding repository Markdown source.

- [ ] **Step 3: Write failing DocsPage tests**

Assert normal anchor links, sequential headings, active topic updates after an injected IntersectionObserver event, keyboard navigation, code copy, and no dependence on scene readiness.

- [ ] **Step 4: Implement the readable documentation layout**

Render a sticky topic index beside unframed documentation sections on desktop and a compact menu on mobile. Hash navigation uses native `scrollIntoView`; IntersectionObserver updates the active topic without replacing browser history during ordinary scrolling.

Open with a full-viewport documentation statement and a visible first-topic edge. Animate the route title, active-topic marker, command-line reveals, node labels, and section transitions through the shared GSAP lifecycle while long prose remains stable.

- [ ] **Step 5: Implement the pipeline scene**

`pipelineModel(topic)` returns stable nodes and connecting paths for the six topics. `DocsScene` traces the active path, moves the camera only when motion is allowed, and keeps a low-contrast stable topology behind long reading sections. Reduced motion changes only opacity in 120ms.

- [ ] **Step 6: Verify GREEN and commit**

Run docs manifest, page, pipeline, and typecheck tests. Commit exact documentation paths with message `feat: add animated documentation pipeline`.

```powershell
git add site/src/content/docs.ts site/src/features/docs site/src/experience/scenes/docs site/src/pages/DocsPage.test.tsx site/src/pages/DocsPage.tsx
git commit --only -m "feat: add animated documentation pipeline" -- site/src/content/docs.ts site/src/features/docs site/src/experience/scenes/docs site/src/pages/DocsPage.test.tsx site/src/pages/DocsPage.tsx
```

## Task 11: Finish Motion, Fallbacks, Copy Feedback, And Resource Cleanup

**Files:**
- Create: `site/src/components/CommandCopy.test.tsx`
- Create: `site/src/components/CommandCopy.tsx`
- Create: `site/src/experience/fallback/HomeForgeFallback.tsx`
- Create: `site/src/experience/fallback/RegistryFieldFallback.tsx`
- Create: `site/src/experience/fallback/PackDetailFallback.tsx`
- Create: `site/src/experience/fallback/DocsPipelineFallback.tsx`
- Create: `site/src/experience/lifecycle/sceneLifecycle.test.ts`
- Modify: `site/src/experience/SceneDirector.tsx`
- Modify: `site/src/styles/global.css`
- Modify: `site/src/styles/motion.css`

- [ ] **Step 1: Write failing behavior tests**

Test Clipboard API success, rejected-permission fallback selection, polite live-region feedback, outgoing scene disposal after transition, one-canvas invariants over repeated route changes, first context-loss recovery, second context-loss fallback, visibility pause, and reduced-motion first render.

- [ ] **Step 2: Verify RED and implement copy fallback**

On clipboard rejection, focus/select a readonly command input and announce `Command selected. Press Ctrl+C or Command+C to copy.` The control uses a Lucide copy/check icon and never resizes when its label changes.

- [ ] **Step 3: Implement route-specific non-WebGL compositions**

Create CSS/SVG compositions for forge assembly, Registry field, exploded Passport, and Docs pipeline. Each fallback uses the same adjacent page content and no separate product claims. It must be visible when WebGL initialization rejects, after a second context loss, or under the Playwright no-WebGL project.

- [ ] **Step 4: Complete transition and cleanup ownership**

Each scene registers a disposer for geometry, materials, textures, GSAP contexts, observers, and subscriptions. `SceneDirector` may render outgoing and incoming environments only during transition, morphs the persistent `PackArtifact` between route variants, then calls the outgoing disposer. A `data-scene-ready` and `data-scene-phase` attribute on the canvas host exposes stable test state without adding production-only methods.

- [ ] **Step 5: Complete responsive and reduced-motion styling**

Check 375, 768, 1024, and 1440 widths. Keep stable aspect ratios for runtime nodes and Passport layers, 44px touch targets with 8px gaps, no viewport-width font scaling, zero letter-spacing compression, no nested cards, and no horizontal overflow. Reduced motion disables scrub, cursor tracking, particle travel, and camera travel while keeping static 3D compositions and all states visible.

- [ ] **Step 6: Verify GREEN and commit**

Run component, lifecycle, fallback, typecheck, and lint tests. Commit exact paths with message `feat: harden motion and fallback behavior`.

```powershell
git add site/src/components/CommandCopy.test.tsx site/src/components/CommandCopy.tsx site/src/experience/fallback site/src/experience/lifecycle/sceneLifecycle.test.ts site/src/experience/SceneDirector.tsx site/src/styles/global.css site/src/styles/motion.css
git commit --only -m "feat: harden motion and fallback behavior" -- site/src/components/CommandCopy.test.tsx site/src/components/CommandCopy.tsx site/src/experience/fallback site/src/experience/lifecycle/sceneLifecycle.test.ts site/src/experience/SceneDirector.tsx site/src/styles/global.css site/src/styles/motion.css
```

## Task 12: Emit Static Route Shells And Migrate GitHub Pages Safely

**Files:**
- Modify: `site/package.json`
- Create: `site/scripts/emit-route-shells.test.mjs`
- Create: `site/scripts/emit-route-shells.mjs`
- Create: `.github/workflows/site-ci.yml`
- Modify: `.github/workflows/docs-site-deploy.yml`

- [ ] **Step 1: Write the failing route-shell test**

Build a temporary `dist/index.html`, call `emitRouteShells({ distDir, packIds })`, and assert byte-identical HTML exists at `registry/index.html`, `docs/index.html`, every `registry/<pack-id>/index.html`, and `404.html`. Reject Pack IDs containing `/`, `..`, or characters outside the catalog slug pattern.

Update `site/package.json` so `test:data` includes all three Node test files explicitly:

```json
"test:data": "node --test scripts/passport-client.test.mjs scripts/generate-repository-data.test.mjs scripts/emit-route-shells.test.mjs"
```

- [ ] **Step 2: Verify RED and implement route emission**

Read generated Pack IDs from `site/src/generated/repository-data.json`, validate them again, and copy the already-built `index.html` without rewriting asset URLs. Create directories recursively. Do not delete any existing path outside `site/dist`.

- [ ] **Step 3: Add an isolated site CI workflow**

Create `.github/workflows/site-ci.yml` with path filters for `site/**`, Registry, i18n, official Packs, `src/cli.mjs`, and `src/lib/{targets,pack,registry}.mjs`. The job checks out, sets up Node 20 with `cache-dependency-path: site/package-lock.json`, runs `npm ci --prefix site`, runs `npm run check --prefix site`, installs Playwright Chromium, and runs route/accessibility/fallback E2E. Keep the existing dirty root CI workflow untouched.

- [ ] **Step 4: Replace the Pages artifact only after the new gates exist**

Update `docs-site-deploy.yml` to trigger on `site/**`, Registry, i18n, official Packs, Pack/Registry/target libraries, CLI, and the workflow itself. Add `actions/configure-pages@v5` with `id: pages`, run `npm ci --prefix site`, set `SITE_BASE_PATH` to `${{ steps.pages.outputs.base_path }}/`, run the site build, upload `site/dist`, and deploy with `actions/deploy-pages@v4`.

- [ ] **Step 5: Verify deep links under a project base path**

```powershell
$env:SITE_BASE_PATH='/packsmith/'
npm.cmd run build --prefix site
Test-Path site/dist/registry/senior-code-reviewer/index.html
Test-Path site/dist/docs/index.html
Select-String -Path site/dist/index.html -Pattern '/packsmith/assets/'
```

Expected: both route shells exist and built asset URLs contain `/packsmith/assets/`.

- [ ] **Step 6: Commit deployment changes only**

```powershell
git add site/package.json site/scripts/emit-route-shells.mjs site/scripts/emit-route-shells.test.mjs .github/workflows/site-ci.yml .github/workflows/docs-site-deploy.yml
git commit --only -m "ci: deploy immersive site to pages" -- site/package.json site/scripts/emit-route-shells.mjs site/scripts/emit-route-shells.test.mjs .github/workflows/site-ci.yml .github/workflows/docs-site-deploy.yml
```

## Task 13: Add Real-Browser Accessibility, Route, And Canvas Verification

**Files:**
- Create: `site/playwright.config.ts`
- Create: `site/e2e/helpers/console-guard.ts`
- Create: `site/e2e/helpers/canvas-pixels.ts`
- Create: `site/e2e/routes.spec.ts`
- Create: `site/e2e/demo.spec.ts`
- Create: `site/e2e/accessibility.spec.ts`
- Create: `site/e2e/fallback.spec.ts`
- Create: `site/e2e/canvas.spec.ts`

- [ ] **Step 1: Configure deterministic browser projects**

Use a production build and Vite preview server on `127.0.0.1:4173`. Configure `webServer.command` as `npm run build && npm run preview -- --host 127.0.0.1 --port 4173`, set `webServer.env.SITE_BASE_PATH` to `/packsmith/`, and set `use.baseURL` to `http://127.0.0.1:4173/packsmith/`. Fix locale `en-US`, timezone `Asia/Shanghai`, light color scheme, traces on first retry, screenshots on failure, and use these project filters:

```ts
[
  { name: "desktop", grepInvert: /@fallback|@reduced/, use: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", grepInvert: /@fallback|@reduced/, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  { name: "reduced-motion", grep: /@reduced/, use: { viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" } },
  { name: "no-webgl", grep: /@fallback/, use: { viewport: { width: 1024, height: 768 }, launchOptions: { args: ["--disable-webgl", "--disable-webgl2"] } } }
]
```

- [ ] **Step 2: Write route and demo tests that initially fail**

Test `/`, `/registry`, all 53 generated detail paths, `/docs`, an unknown Pack ID, navigation loops, direct deep links, query/hash preservation, the full six-step demo, target changes, command copy, and zero console/page errors. Expected first run: failures identify any unfinished integration.

- [ ] **Step 3: Add automated accessibility checks**

Use `@axe-core/playwright` on all four route types after scene readiness. Complete the demo by keyboard only, navigate Docs hashes, filter Registry, open a Pack, and change target without pointer input. Assert visible focus, sequential headings, one `main`, one navigation, canvas outside tab order, and no serious/critical axe violations.

- [ ] **Step 4: Implement statistical canvas checks**

`canvas-pixels.ts` uses `locator("canvas").screenshot()`, PNGJS, and pixelmatch. Assert canvas bounds cover at least 95% of the viewport, non-background pixels exceed 1%, center-region brightness variance exceeds 2, and scroll/focus/route interaction changes more than 0.5% of pixels after waiting for `data-scene-phase="stable"`. Use statistical checks rather than strict GPU-dependent golden pixels.

- [ ] **Step 5: Verify every route at desktop and mobile sizes**

Tag Canvas tests `@canvas` and visual layout tests `@visual`. Cover 375, 768, 1024, and 1440 widths; prove every route is nonblank, correctly framed, moving or interactively changing, and has no text overlap or horizontal overflow. Verify the Passport SVG asset renders where referenced.

- [ ] **Step 6: Verify fallback and repeated route cleanup**

In no-WebGL, assert each route-specific fallback appears with complete DOM content. Loop `/ -> /registry -> /registry/senior-code-reviewer -> /docs -> /` three times and assert one canvas host, one active scene lifecycle, and no growing duplicate listener markers.

- [ ] **Step 7: Commit E2E verification**

```powershell
git add site/playwright.config.ts site/e2e
git commit --only -m "test: verify immersive routes and canvas rendering" -- site/playwright.config.ts site/e2e
```

## Task 14: Run Final Product And Repository Verification

**Files:**
- Create: `site/README.md`

- [ ] **Step 1: Document local site commands**

Create `site/README.md` with the architecture boundary, generated-data contract, and these local commands:

```powershell
npm.cmd ci --prefix site
npm.cmd run dev --prefix site
npm.cmd run check --prefix site
npm.cmd run test:e2e --prefix site
```

State that build-time Passport generation is preview-only and writes only to ignored `site/.cache` before cleanup.

- [ ] **Step 2: Run the full CLI gate**

```powershell
npm.cmd test
node src/cli.mjs registry validate --quality-gate 85
node scripts/i18n-check.mjs --ci
npm.cmd run verify:hackathon:quick
npm.cmd run pack:dry-run
```

Expected: all commands exit 0; root package output does not include `site/node_modules`, `site/dist`, or frontend dependencies.

- [ ] **Step 3: Run the full site gate**

```powershell
npm.cmd ci --prefix site
npm.cmd run check --prefix site
npm.cmd exec --prefix site -- playwright install chromium
npm.cmd run test:e2e --prefix site
```

Expected: typecheck, lint, generator tests, Vitest, production build, route shells, accessibility, fallback, route, demo, and Canvas suites all pass.

- [ ] **Step 4: Perform in-app browser visual QA**

Start the site on an unused localhost port. Inspect and capture `/`, `/registry`, `/registry/senior-code-reviewer`, and `/docs` at desktop and mobile sizes. Verify first-viewport product signal, hint of next content, real assets, nonblank Canvas, motion, touch/focus behavior, text containment, no overlap, and correct responsive framing.

- [ ] **Step 5: Reconcile the acceptance checklist**

Read every item in Section 14 of the approved design. Link each item to an automated test or browser observation. Fix any uncovered requirement before claiming completion.

- [ ] **Step 6: Commit documentation only after all gates pass**

```powershell
git add site/README.md
git commit --only -m "docs: document immersive site development" -- site/README.md
```

## Final Verification Matrix

| Requirement | Primary evidence |
| --- | --- |
| Four distinct route scenes | `site/e2e/canvas.spec.ts` desktop/mobile matrix |
| Truthful Pack and Passport facts | Passport CLI client and repository-data generator tests plus existing CLI Passport tests |
| Six-step usable demo | demo machine/component tests plus `site/e2e/demo.spec.ts` |
| Registry DOM/3D synchronization | Registry query/component tests plus scene store assertions |
| Honest unknown and unsupported states | Pack detail model tests plus route E2E |
| English/Chinese and catalog locales | locale/provider tests plus Registry E2E |
| Reduced motion and WebGL fallback | lifecycle unit tests plus reduced/no-WebGL projects |
| Keyboard and screen-reader semantics | component tests plus axe and keyboard E2E |
| GitHub Pages deep links | route-shell generator tests plus production-base E2E |
| No Canvas blank/overlap regressions | PNG statistics, screenshots, and in-app browser QA |
| CLI remains dependency-free | separate locks plus `npm pack --dry-run` inspection |
