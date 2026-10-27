# Packsmith Cinematic Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Packsmith site into a cinematic smoked-glass forge experience with route-specific 3D storytelling, stronger typography, deliberate motion, and reliable responsive/fallback behavior.

**Architecture:** Preserve the existing single-Canvas route director, semantic React pages, repository-backed data, and performance tiering. Introduce a shared cinematic environment and glass Passport primitive, then restyle each route so DOM composition and scene state tell the same story without adding generated image dependencies.

**Tech Stack:** React 19, TypeScript, React Router, React Three Fiber, Three.js, GSAP/ScrollTrigger, Vitest, Playwright, CSS custom properties.

---

## File Structure

- `site/src/styles/tokens.css`: cinematic color, spacing, typography, surface, and easing tokens.
- `site/src/styles/global.css`: shell, navigation, global typography, buttons, noise/grid overlays, responsive rules.
- `site/src/styles/motion.css`: shared reveal, route-enter, focus, reduced-motion, and fallback animation rules.
- `site/src/animation/useSectionTimeline.ts`: bounded text/section reveal timelines with cleanup.
- `site/src/experience/primitives/PassportCore.tsx`: shared smoked-glass Passport core and runtime rails.
- `site/src/experience/primitives/Atmosphere.tsx`: restrained dust field, halo rings, and cinematic lighting helpers.
- `site/src/experience/ExperienceCanvas.tsx`: environment lighting and postprocessing composition.
- `site/src/experience/SceneDirector.tsx`: persistent object morph and route transition choreography.
- `site/src/experience/scenes/**`: route-specific scene arrangement.
- `site/src/features/home/home.css`, `registry/registry.css`, `pack-detail/pack-detail.css`, `docs/docs.css`: route-specific composition.
- `site/src/features/hero/HeroSection.tsx`: literal brand/product-first hero copy and controls.
- `site/src/pages/*.tsx`: semantic section wrappers and scene state synchronization.
- `site/e2e/*.spec.ts`: visual containment, Canvas, route lifecycle, fallback, and accessibility proof.

### Task 1: Lock the Cinematic Design System

**Files:**
- Modify: `site/src/styles/tokens.css`
- Modify: `site/src/styles/fonts.css`
- Modify: `site/src/styles/global.css`
- Modify: `site/src/styles/motion.css`
- Test: `site/e2e/canvas.spec.ts`
- Test: `site/e2e/accessibility.spec.ts`

- [ ] **Step 1: Add a failing visual contract**

Add token and shell assertions to `canvas.spec.ts`:

```ts
const shellStyle = await page.locator('.app-shell').evaluate((element) => {
  const style = getComputedStyle(element)
  return {
    background: style.backgroundColor,
    color: style.color,
  }
})
expect(shellStyle.background).toBe('rgba(0, 0, 0, 0)')
expect(shellStyle.color).not.toBe('rgb(255, 255, 255)')
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd run test:e2e --prefix site -- --project=desktop --grep "cinematic shell"`

Expected: FAIL because the cinematic shell contract does not exist.

- [ ] **Step 3: Replace flat tokens with semantic forge tokens**

Implement tokens with this shape:

```css
:root {
  --void: #050608;
  --void-soft: #0a0d11;
  --smoke: #11161b;
  --metal: #9ba7b4;
  --silver: #f2f5f7;
  --cyan: #35e5d1;
  --coral: #ff6a3d;
  --glass: rgb(210 230 235 / 0.055);
  --glass-line: rgb(210 245 244 / 0.16);
  --ease-cinematic: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Add a fixed grain layer, perspective grid, stronger focus treatment, restrained glass surfaces, and a header that reads as a precision instrument rather than a SaaS navbar. Keep text contrast at WCAG AA.

- [ ] **Step 4: Run lint, typecheck, accessibility, and visual shell checks**

Run:

```powershell
npm.cmd run lint --prefix site
npm.cmd run typecheck --prefix site
.\site\node_modules\.bin\playwright.cmd test site/e2e/accessibility.spec.ts --project=desktop
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
git add site/src/styles site/e2e/canvas.spec.ts site/e2e/accessibility.spec.ts
git commit -m "feat: establish cinematic forge design system"
```

### Task 2: Build the Shared Passport Core and Atmosphere

**Files:**
- Create: `site/src/experience/primitives/PassportCore.tsx`
- Create: `site/src/experience/primitives/Atmosphere.tsx`
- Modify: `site/src/experience/ExperienceCanvas.tsx`
- Modify: `site/src/experience/SceneDirector.tsx`
- Test: `site/src/experience/SceneDirector.test.tsx`
- Test: `site/src/experience/lifecycle/sceneLifecycle.test.ts`

- [ ] **Step 1: Write failing scene composition tests**

```tsx
it('keeps one persistent Passport core across route changes', () => {
  renderExperience('/registry')
  expect(screen.getAllByTestId('passport-core')).toHaveLength(1)
})
```

Add a second assertion that the route identity changes without remounting the experience root.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test --prefix site -- SceneDirector.test.tsx sceneLifecycle.test.ts`

Expected: FAIL because `PassportCore` and its stable identity are missing.

- [ ] **Step 3: Implement `PassportCore`**

Use a small set of physical materials and instanced rails:

```tsx
<meshPhysicalMaterial
  color="#172127"
  transmission={tier === 'high' ? 0.82 : 0.35}
  thickness={0.65}
  ior={1.32}
  roughness={0.16}
  metalness={0.08}
/>
```

Expose props for `mode`, `progress`, `accent`, `opacity`, and `reducedMotion`. Keep geometry procedural and reuse materials with `useMemo`.

- [ ] **Step 4: Implement `Atmosphere` and cinematic lighting**

Create an instanced dust field with deterministic positions, two thin halo rings, and low-opacity scan planes. In `ExperienceCanvas`, replace uniformly bright lights with a cold key, cyan rim, coral verification light, and route-aware fog density.

- [ ] **Step 5: Integrate a persistent core into `SceneDirector`**

Render one shared core outside outgoing/incoming route instances. Route scenes arrange supporting geometry around it. Preserve existing readiness and disposal behavior.

- [ ] **Step 6: Verify unit and lifecycle tests**

Run: `npm.cmd test --prefix site -- SceneDirector.test.tsx sceneLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add site/src/experience
git commit -m "feat: add persistent glass Passport core"
```

### Task 3: Recompose the Home Experience

**Files:**
- Modify: `site/src/features/hero/HeroSection.tsx`
- Modify: `site/src/pages/HomePage.tsx`
- Modify: `site/src/features/home/home.css`
- Modify: `site/src/experience/scenes/home/HomeScene.tsx`
- Modify: `site/src/experience/scenes/home/homeSceneModel.ts`
- Test: `site/src/pages/HomePage.test.tsx`
- Test: `site/src/experience/scenes/home/HomeScene.test.ts`

- [ ] **Step 1: Write failing hero hierarchy tests**

```tsx
expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Packsmith')
expect(screen.getByText(/one workflow/i)).toBeVisible()
expect(screen.getByTestId('hero-proof-strip')).toBeVisible()
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test --prefix site -- HomePage.test.tsx HomeScene.test.ts`

Expected: FAIL because the current H1 is a value proposition and there is no proof strip.

- [ ] **Step 3: Implement the product-first hero**

Use `Packsmith` as the H1 and move the literal offer into supporting copy. Add a compact proof strip for 53 Packs, six runtimes, Passport evidence, and preview-before-write. Keep the hero unframed.

- [ ] **Step 4: Recompose below-fold sections**

Replace repeated card-like blocks with full-width editorial bands: portability fracture, guided forge console, Passport inspection, runtime rails, and final install command. Use asymmetric two-column compositions that alternate visual weight.

- [ ] **Step 5: Upgrade HomeScene choreography**

Map section progress to fragment assembly, rail connection, scan traversal, and sealed core states. Keep idle motion below 0.1 world units and let scroll drive the high-impact changes.

- [ ] **Step 6: Verify focused tests and desktop/mobile screenshots**

Run:

```powershell
npm.cmd test --prefix site -- HomePage.test.tsx HomeScene.test.ts
.\site\node_modules\.bin\playwright.cmd test site/e2e/canvas.spec.ts --project=desktop --grep "@canvas / is"
.\site\node_modules\.bin\playwright.cmd test site/e2e/canvas.spec.ts --project=mobile --grep "@canvas / is"
```

Expected: all pass; hero has no overlap at 375px and 1440px.

- [ ] **Step 7: Commit**

```powershell
git add site/src/features/hero site/src/features/home site/src/pages/HomePage.tsx site/src/experience/scenes/home
git commit -m "feat: recompose cinematic home forge"
```

### Task 4: Turn Registry into a Spatial Index

**Files:**
- Modify: `site/src/pages/RegistryPage.tsx`
- Modify: `site/src/features/registry/registry.css`
- Modify: `site/src/features/registry/RegistryControls.tsx`
- Modify: `site/src/features/registry/RegistryResults.tsx`
- Modify: `site/src/experience/scenes/registry/RegistryScene.tsx`
- Test: `site/src/features/registry/RegistryResults.test.tsx`
- Test: `site/src/experience/scenes/registry/registryLayout.test.ts`

- [ ] **Step 1: Add failing synchronization tests**

Assert that filtering updates the DOM pack IDs and the spatial scene IDs in the same order, while the result row remains visible and focusable.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test --prefix site -- RegistryResults.test.tsx registryLayout.test.ts`

- [ ] **Step 3: Implement the glass control rail and technical index**

Keep controls in one continuous glass rail. Use fine rules, compact labels, a large result count, and row scan accents. Do not wrap each filter or row in a card.

- [ ] **Step 4: Upgrade RegistryScene**

Arrange all 53 nodes in asymmetric orbital bands. Filtered nodes converge into a readable foreground field; focused nodes move toward the camera and illuminate a coral verification ring.

- [ ] **Step 5: Verify tests and route cycle**

Run:

```powershell
npm.cmd test --prefix site -- RegistryResults.test.tsx registryLayout.test.ts
.\site\node_modules\.bin\playwright.cmd test site/e2e/routes.spec.ts --project=desktop --grep "navigation cycles"
```

Expected: PASS with one experience root and visible filtered results.

- [ ] **Step 6: Commit**

```powershell
git add site/src/pages/RegistryPage.tsx site/src/features/registry site/src/experience/scenes/registry
git commit -m "feat: turn Registry into a spatial index"
```

### Task 5: Rebuild Pack Detail as a Layered Passport Scanner

**Files:**
- Modify: `site/src/pages/PackDetailPage.tsx`
- Modify: `site/src/features/pack-detail/pack-detail.css`
- Modify: `site/src/features/pack-detail/PassportFacts.tsx`
- Modify: `site/src/features/pack-detail/PreviewWrites.tsx`
- Modify: `site/src/features/pack-detail/TargetSelector.tsx`
- Modify: `site/src/experience/scenes/pack-detail/PackDetailScene.tsx`
- Test: `site/src/pages/PackDetailPage.test.tsx`
- Test: `site/src/experience/scenes/pack-detail/passportLayerModel.test.ts`

- [ ] **Step 1: Add failing layer/target tests**

Assert six semantic Passport layers, a selected runtime rail, and a target-specific verification command.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test --prefix site -- PackDetailPage.test.tsx passportLayerModel.test.ts`

- [ ] **Step 3: Implement the editorial scanner layout**

Create an unframed hero with the Pack name, trust posture, and live checksum. Follow it with six full-width scan bands aligned to the 3D layers. Keep commands in precision rails rather than cards.

- [ ] **Step 4: Upgrade PackDetailScene**

Use six glass plates with etched line patterns. Move the active layer forward, dim adjacent layers, and reroute the runtime rail when the target changes.

- [ ] **Step 5: Verify unknown-Pack and target deep links**

Run:

```powershell
npm.cmd test --prefix site -- PackDetailPage.test.tsx passportLayerModel.test.ts
.\site\node_modules\.bin\playwright.cmd test site/e2e/routes.spec.ts --project=desktop --grep "unknown Pack|query and hash"
```

- [ ] **Step 6: Commit**

```powershell
git add site/src/pages/PackDetailPage.tsx site/src/features/pack-detail site/src/experience/scenes/pack-detail
git commit -m "feat: present Packs as layered Passports"
```

### Task 6: Turn Docs into a Luminous Pipeline

**Files:**
- Modify: `site/src/pages/DocsPage.tsx`
- Modify: `site/src/features/docs/docs.css`
- Modify: `site/src/features/docs/DocsNav.tsx`
- Modify: `site/src/features/docs/DocsSection.tsx`
- Modify: `site/src/experience/scenes/docs/DocsScene.tsx`
- Modify: `site/src/experience/scenes/docs/pipelineModel.ts`
- Test: `site/src/pages/DocsPage.test.tsx`
- Test: `site/src/experience/scenes/docs/pipelineModel.test.ts`

- [ ] **Step 1: Add failing topic synchronization tests**

Assert that desktop links and the mobile select set the same hash/topic and that the selected node is reflected in the pipeline model.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test --prefix site -- DocsPage.test.tsx pipelineModel.test.ts`

- [ ] **Step 3: Implement the editorial Docs layout**

Use a restrained sticky topic rail, large section numbers, command strips, and generous readable measures. Keep the mobile selector visible and functional without desktop links occupying layout space.

- [ ] **Step 4: Upgrade DocsScene**

Create six glass-and-metal pipeline nodes, a moving emissive trace, and route-aware depth-of-field emphasis. Disable the moving trace under reduced motion.

- [ ] **Step 5: Verify desktop/mobile docs interactions**

Run:

```powershell
npm.cmd test --prefix site -- DocsPage.test.tsx pipelineModel.test.ts
.\site\node_modules\.bin\playwright.cmd test site/e2e/canvas.spec.ts --project=desktop --grep "@canvas /docs"
.\site\node_modules\.bin\playwright.cmd test site/e2e/canvas.spec.ts --project=mobile --grep "@canvas /docs"
```

- [ ] **Step 6: Commit**

```powershell
git add site/src/pages/DocsPage.tsx site/src/features/docs site/src/experience/scenes/docs
git commit -m "feat: turn Docs into a luminous pipeline"
```

### Task 7: Final Motion, Fallback, and Release Verification

**Files:**
- Modify: `site/src/animation/useSectionTimeline.ts`
- Modify: `site/src/experience/fallback/*.tsx`
- Modify: `site/src/styles/motion.css`
- Modify: `site/e2e/accessibility.spec.ts`
- Modify: `site/e2e/canvas.spec.ts`
- Modify: `site/e2e/fallback.spec.ts`
- Modify: `site/README.md`

- [ ] **Step 1: Add failing cleanup and fallback contracts**

Assert that every fallback exposes a route-specific composition, no reveal leaves interactive content hidden, and two complete route cycles retain one shell and stable listener counts.

- [ ] **Step 2: Run fallback/lifecycle tests and confirm RED**

Run:

```powershell
npm.cmd test --prefix site -- sceneLifecycle.test.ts
.\site\node_modules\.bin\playwright.cmd test --project=no-webgl
```

- [ ] **Step 3: Harden timeline cleanup and reduced motion**

Keep reveal displacement at 24-36px, avoid long-lived content opacity, call `context.revert()` on unmount, and make reduced motion render stable final states immediately.

- [ ] **Step 4: Restyle route-specific fallbacks**

Mirror the same Passport core, constellation, scanner layers, and pipeline silhouettes with CSS transforms and lighting. Do not use a generic gradient placeholder.

- [ ] **Step 5: Run the full verification gate**

Run:

```powershell
npm.cmd run lint --prefix site
npm.cmd run typecheck --prefix site
npm.cmd test --prefix site
npm.cmd test
$env:SITE_BASE_PATH='/packsmith/'; npm.cmd run build --prefix site
.\site\node_modules\.bin\playwright.cmd test --project=desktop
.\site\node_modules\.bin\playwright.cmd test --project=mobile
.\site\node_modules\.bin\playwright.cmd test --project=reduced-motion
.\site\node_modules\.bin\playwright.cmd test --project=no-webgl
```

Expected: all commands exit 0; mobile may skip desktop-owned exhaustive matrices.

- [ ] **Step 6: Update documentation and commit**

Document the cinematic scene model, performance tiers, asset prompts, and test commands in `site/README.md`.

```powershell
git add site/src/animation site/src/experience/fallback site/src/styles/motion.css site/e2e site/README.md
git commit -m "feat: finish cinematic immersive site"
```

## Plan Self-Review

- Spec coverage: color, typography, glass materials, four route compositions, route continuity, scroll motion, performance tiers, reduced motion, fallback, mobile, and image-prompt-only policy are covered.
- Scope: no backend, registry data, CLI contract, generated image, CMS, or authentication work is included.
- Consistency: all tasks retain the existing `sceneStore`, one `#experience-root`, and route-specific scene names.
- Verification: every task has a focused test command; the final task includes full static, unit, build, desktop, mobile, reduced-motion, and no-WebGL gates.
