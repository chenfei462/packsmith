# Packsmith Immersive Website Design

**Date:** 2026-07-13
**Status:** Approved in conversation; awaiting written-spec review
**Scope:** Public marketing homepage plus a preserved standalone Registry route

## 1. Product Objective

Build a production-grade public website that makes a first-time developer understand Packsmith in seconds, experience the product before installing it, and copy a real command as the primary conversion.

The page must establish one belief:

> One useful AI workflow can be safely reused across the agents a developer already uses.

Packsmith is presented as the package manager and trust gate for AI agent workflows, not as a generic AI platform, a hosted marketplace, or an enterprise-only security product.

## 2. Audience and Commercial Roles

### Primary user

Developers who use more than one AI coding agent and currently rewrite or manually move reviewers, test writers, documentation helpers, prompts, and rules between runtimes.

### Secondary roles

- Engineering leaders and developer-productivity owners are the future paying decision-makers.
- Skill and prompt creators supply ecosystem content.
- Hackathon judges, investors, and partners may visit, but the page must not read like a competition submission.

### Commercial thesis

The open CLI and public Registry acquire individual developers. Teams pay for private registries, workflow approval, policy enforcement, version control, unified distribution, and auditability. Private deployment and support can support higher-value enterprise deals later.

## 3. Success Criteria

The first release succeeds when a new visitor can:

1. Explain Packsmith after the hero: “one workflow, safely installed across multiple agents.”
2. Complete the simulated flow `Search -> Passport -> Preview -> Choose Agent -> Install -> Use` without reading documentation.
3. See truthful evidence from the repository: real packs, supported runtimes, permissions, risk, checksums, file writes, and commands.
4. Copy a real Packsmith command from the completed demo.
5. Reach GitHub, Registry, and documentation without losing orientation.
6. Use the core page on keyboard, touch, reduced-motion settings, and a 375px-wide viewport.

Primary conversion: copy the real CLI command after completing or skipping into the interactive demo.

Secondary conversion: open GitHub.

Supporting conversion: browse the Registry.

## 4. Information Architecture

- `/`: immersive marketing homepage and interactive demo.
- `/registry`: searchable catalog generated from `registry/catalog.json`.
- `/registry/:pack-id`: future pack detail and Passport route; the initial release may link to the in-page Passport experience until this route exists.
- `/docs`: installation, authoring, publishing, trust, and team-governance documentation.

The existing `docs/site/generate.mjs` catalog generator remains a source of data and behavior, not the implementation base for the new cinematic homepage. The homepage and Registry share catalog and localization data so pack counts and compatibility claims cannot drift.

## 5. Content and Narrative

The homepage is an eight-scene scroll narrative.

### Scene 1: Forge / Verify hero

- Full-viewport near-black scene with a perspective scan grid.
- A central Pack object is assembled from fragments and scanned into a Passport.
- Headline: “The package manager for AI agent workflows.”
- Supporting promise: “One workflow. Six agent install plans. Trust before install.”
- Primary action starts the interactive demo.
- Secondary action opens GitHub.
- A small skip link jumps to the install command for users who do not want the cinematic tour.

### Scene 2: The portability problem

- Show the same reviewer workflow splitting into incompatible runtime-specific copies.
- Scrolling reveals duplicated maintenance, inconsistent permissions, and configuration drift.
- The scene resolves into one canonical Pack.

### Scene 3: Guided product flow

- Use a stacked scroll sequence for Search, Passport, Preview, Choose Agent, Install, and Use.
- Each step advances only when it is visible; normal page scrolling remains intact.
- Terminal output and interface state are based on real Packsmith commands and catalog fields.

### Scene 4: Interactive Passport

- A bento-style inspection surface shows target readiness, permissions, risk, checksum, publisher, quality score, and audit posture.
- Pointer proximity activates a restrained spotlight and border response.
- Expanding a card exposes the exact supporting fact rather than decorative filler.
- Status meaning is expressed with icon, label, and color; color is never the only signal.

### Scene 5: One Pack, six runtimes

- The selected Pack becomes the source node for Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and TRAE.
- Animated paths show one-to-many adapted install plans.
- Runtime claims must match the current registry and target metadata.

### Scene 6: Verifiable proof

- Show live-derived counts for official packs and supported runtimes.
- Show a real preview of intended file writes and a real tamper/audit state.
- Show CI or release evidence only when read from repository data or a stable public endpoint.
- Do not use invented testimonials, customer logos, partnerships, download counts, or unpublished capabilities.

### Scene 7: Team value

- Reframe the same local trust primitives as team governance: private registry, policies, approvals, version pinning, distribution, and audit.
- This section is a commercial bridge, not a pricing or sales page.
- Any capability not implemented today is labeled as planned rather than presented as available.

### Scene 8: Install

- Resolve the experience into a stable command panel.
- Provide one-click copy with visible and screen-reader confirmation.
- Keep Registry, documentation, and GitHub as clearly subordinate next steps.

## 6. Visual Direction

### Concept

“A trusted workflow being forged, scanned, and released into production.”

The page is cinematic and technologically expressive, but the memorable device is Packsmith’s forge-and-verification metaphor. It must not resemble a generic purple-gradient AI landing page.

### Color system

- Background: obsidian and graphite, not pure flat black everywhere.
- Primary technical light: electric cyan for scanning, connectivity, and focus.
- Brand energy and primary CTA: forge orange.
- Success: green-leaning cyan with explicit labels and check icons.
- Warning: amber; failure: red, each with text and symbol.
- Large atmospheric effects remain desaturated so interactive focus can carry the brightest color.

All colors are exposed as semantic CSS variables. Normal text must meet WCAG AA contrast, and keyboard focus must remain unmistakable against animated backgrounds.

### Typography

- Display: a distinctive geometric or industrial sans; avoid Inter, Roboto, Arial, and Space Grotesk as the primary brand face.
- Body: a highly readable modern sans.
- Commands, telemetry, statuses, and numeric data: a consistent engineering mono.
- Chinese: a modern CJK sans with natural metrics; do not fake monospacing for Chinese prose.
- Use `font-display: swap` and reserve stable metrics to minimize layout shift.

### Composition

- Editorial asymmetry, strong depth, and controlled density.
- The 3D/particle field may break the grid; product facts, commands, and controls stay on a strict layout system.
- Avoid stock people photography and generic AI illustrations.
- Preferred assets are live interface states, terminal output, vector runtime marks, procedural grids, particles, scan lines, and a custom Pack/Passport object.

## 7. Motion and Interaction Language

References inform behavior, not copied layouts:

- React Bits Grid Scan: perspective scan environment for the hero.
- React Bits Magic Bento: spotlight, border response, magnetism, and click feedback for Passport facts.
- React Bits Decrypted Text: short status or keyword transitions only.
- React Bits Scroll Stack: the guided six-step product sequence.
- React Bits Electric Border: a single verification-success or CTA moment.
- Recent Design motion references: high-contrast particle dissolution/reassembly, layered security separation, and cursor-tracked beams.

Motion rules:

- Every major motion communicates assembly, inspection, adaptation, transfer, or successful verification.
- Do not run unrelated decorative loops across every section.
- Scroll remains native and interruptible; no scroll-jacking.
- Pointer effects never gate information or primary actions.
- Micro-interactions target 150–300ms; long scene transitions may exceed this when they remain interruptible.
- Animate transform, opacity, shader uniforms, and canvas state; avoid layout-triggering animation.
- Pause WebGL and continuous animation when the page is hidden or the scene is offscreen.

## 8. Responsive and Accessibility Behavior

### Desktop

- Full scan-grid and particle hero.
- Pointer-reactive Passport surfaces.
- Scroll-linked staged transitions and one lightweight 3D hero object.

### Mobile and lower-power devices

- Replace dense particle fields with a lighter canvas or CSS/SVG fallback.
- Reduce blur, shadow layers, path count, and parallax.
- Convert hover-only responses to tap/focus states.
- Preserve the demo, command copy, navigation, and all product facts.
- Maintain at least 44px touch targets and 8px separation.

### Reduced motion

- Honor `prefers-reduced-motion` from first render.
- Use stable scene compositions and short opacity changes rather than spatial travel, particle storms, or cursor tracking.
- Present every step and proof point immediately without requiring animation completion.

### Keyboard and assistive technology

- Include a skip-to-content link.
- Use semantic landmarks and sequential headings.
- Keep DOM reading order aligned with the visual story.
- Provide visible focus and keyboard activation for every control.
- Announce copied-command and demo state changes with a polite live region.
- Treat animated canvas and 3D objects as decorative unless they communicate content; provide equivalent adjacent text for meaningful scenes.

## 9. Localization

- English is the canonical source language.
- Browser language chooses the first visit when supported; a visible selector always allows override.
- Chinese is included in the first release.
- Existing Japanese, Korean, Spanish, French, and German catalog descriptions remain usable in the Registry; marketing-page rollout beyond English and Chinese may be phased.
- Commands, pack IDs, runtime names, and code tokens are not translated.
- User language choice is stored locally without requiring an account.

## 10. Technical Architecture

### Application

- React + Vite + TypeScript static application.
- Route-level separation between marketing homepage and Registry.
- GSAP with ScrollTrigger for orchestrated narrative scenes.
- React Three Fiber / Three.js only for the hero’s Pack object and essential spatial effects.
- CSS and small SVG/canvas modules for lower-cost effects.
- Lucide or a single coherent SVG icon family for interface icons.

### Module boundaries

- `site/src/data`: typed adapters for catalog, targets, and localized copy.
- `site/src/i18n`: language detection, persistence, and message dictionaries.
- `site/src/components`: reusable navigation, command copy, status, and accessibility primitives.
- `site/src/features/hero`: scan scene and Pack object.
- `site/src/features/demo`: deterministic interactive product flow state machine.
- `site/src/features/passport`: fact cards and inspection details.
- `site/src/features/runtime-network`: one-to-many adapter visualization.
- `site/src/features/proof`: repository-derived evidence.
- `site/src/pages`: homepage and Registry route composition.
- `site/src/styles`: semantic tokens, typography, motion tokens, responsive rules, and global accessibility styles.

Files should remain focused; scene rendering, demo state, data parsing, and copy must not be combined in one large page component.

### Data flow

1. Build-time imports read `registry/catalog.json`, supported target metadata, and localization data.
2. A typed adapter normalizes these sources into UI-safe `PackSummary`, `PassportFact`, and `RuntimeTarget` records.
3. The demo uses a deterministic local state machine; it does not claim to install files from the browser.
4. The final command is derived from selected pack and target, then copied through the Clipboard API with a fallback selection path.
5. Counts and claims are computed from normalized data rather than hard-coded in components.

The command source is release-aware. The site may show an `npx @packsmith/cli` command only after package publication is represented by verified repository configuration or release metadata. Until then, the primary runnable path uses the documented source-tree command and labels the npm path as unavailable rather than implying publication.

### Deployment

- Output is static and compatible with GitHub Pages.
- Base paths are configurable for project-page hosting.
- Existing docs/Registry deployment is preserved until the new routes are verified, then migrated deliberately rather than overwritten implicitly.

## 11. Failure and Fallback Behavior

- Invalid catalog data fails the build with a clear schema error; the UI never silently publishes fabricated defaults.
- If WebGL is unavailable, the hero uses an SVG/CSS scan field and static Pack composition.
- If clipboard permission fails, select the command and explain how to copy it manually.
- If browser language is unsupported, use English.
- If a runtime or field is absent, show “not available” or omit the claim; never infer support.
- Lazy scene-loading failures keep the page readable and expose a retry only when retry can help.
- External fonts or media must have system fallbacks so content remains available during network failure.

## 12. Testing Strategy

Implementation follows red-green-refactor for behavior-bearing code.

### Unit tests

- Catalog normalization and derived counts.
- Runtime support mapping.
- Language detection and stored override.
- Demo state transitions and command generation.
- Clipboard success and fallback behavior.
- Reduced-motion and WebGL capability decisions.

### Component tests

- Keyboard navigation and focus visibility.
- Passport expansion and status semantics.
- Demo progression, skip path, and final command.
- Language selector behavior.
- Registry search and filtering against real fixture data.

### Integration and visual checks

- Production build with the repository’s real catalog.
- Routes under the configured GitHub Pages base path.
- 375px, 768px, 1024px, and 1440px viewport checks.
- Reduced-motion rendering.
- Keyboard-only completion of the demo and command copy.
- Browser smoke test for console errors and broken links.
- Screenshot review of hero, demo, Passport, runtime network, proof, commercial bridge, and final CTA.

Performance targets are budgets rather than unverifiable promises: keep initial content readable before heavy scenes load, lazy-load below-fold visual modules, and measure the production build before setting final bundle and interaction thresholds.

## 13. Non-Goals for the First Release

- Real browser-side Pack installation.
- Hosted marketplace accounts, ratings, payments, or creator payouts.
- Enterprise policy administration UI.
- Customer-logo or testimonial sections without real approved evidence.
- Full marketing translation into every existing catalog language.
- Persistent analytics or user tracking unless separately approved.
- Full-site 3D rendering or continuous decorative animation in every scene.

## 14. Acceptance Checklist

- The hero communicates category, value, and first action without animation completing.
- The full six-step demo is operable by mouse, keyboard, and touch.
- The command shown is derived from a real pack and selected supported target.
- Passport facts and counts come from repository data.
- The page contains no fabricated claims or social proof.
- English and Chinese switching works, with sensible browser-language defaulting.
- Reduced-motion mode retains all information and actions.
- Mobile layout has no horizontal overflow and preserves 44px touch targets.
- The existing Registry remains available at a distinct route.
- Production build, automated tests, and browser smoke checks pass before handoff.
