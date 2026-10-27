# Packsmith immersive site

This directory contains the React/Vite experience for Packsmith's registry, Passport, and documentation flows. The UI uses a persistent React Three Fiber scene with GSAP section transitions; every route keeps the scene mounted while route content changes through the app shell.

## Local development

From the repository root:

```bash
npm install
npm run dev --prefix site
```

The Vite dev server serves the site at `http://127.0.0.1:5173/` by default. Repository data is generated from the root catalog before the dev server starts. The generated cache lives in `site/src/generated/repository-data.json` and should not be edited by hand.

## Production build and Pages preview

GitHub Pages publishes the site under the repository subpath. Reproduce that build locally with:

```bash
SITE_BASE_PATH=/packsmith/ npm run build --prefix site
SITE_BASE_PATH=/packsmith/ npm run preview --prefix site -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/packsmith/`. The build emits static shells for `/`, `/registry`, every generated `/registry/<pack-id>`, and `/docs`, so direct links work on Pages hosts that serve the generated files.

## Verification

The normal site gate is:

```bash
npm run typecheck --prefix site
npm run lint --prefix site
npm run test:data --prefix site
npm test --prefix site
npm run build --prefix site
```

Playwright uses the same Pages base path and starts a production preview automatically:

```bash
npm run test:e2e --prefix site
```

Useful focused suites are `npm run test:visual --prefix site` and `npm run test:canvas --prefix site`. The E2E projects cover desktop, 375px mobile, reduced-motion, and WebGL-disabled fallback behavior. A browser runtime must be able to launch Chromium; restricted CI sandboxes may report `spawn EPERM` before tests reach the app.

## Design and accessibility notes

- The scene is demand-rendered when motion is reduced and remains nonblank when WebGL is unavailable.
- Route changes preserve one `#experience-root` and one stable scene marker to prevent duplicate canvases and leaked listeners.
- Interactive controls expose accessible names, keyboard focus states, and target-specific install plans.
- Passport data is generated from the repository registry, so pack detail pages and deep links stay aligned with the CLI catalog.
