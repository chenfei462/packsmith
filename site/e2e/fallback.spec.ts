import { expect, test, type Page } from '@playwright/test'

import { installConsoleGuard } from './helpers/console-guard'

const fallbackRoutes = [
  {
    path: '/',
    heading: /package manager for ai agent workflows/i,
    scene: 'home',
    composition: 'home-forge',
  },
  {
    path: '/registry',
    heading: 'Registry',
    scene: 'registry',
    composition: 'registry-field',
  },
  {
    path: '/registry/senior-code-reviewer',
    heading: 'Senior Code Reviewer',
    scene: 'pack-detail',
    composition: 'pack-passport',
  },
  {
    path: '/docs',
    heading: 'Documentation',
    scene: 'docs',
    composition: 'docs-pipeline',
  },
] as const

function appUrl(path: string): string {
  return path === '/' ? './' : `.${path}`
}

async function expectFallbackRoute(
  page: Page,
  route: (typeof fallbackRoutes)[number],
) {
  const response = await page.goto(appUrl(route.path))
  expect(response?.ok()).toBe(true)
  await expect(page.getByRole('heading', {
    level: 1,
    name: route.heading,
  })).toBeVisible()
  await expect(page.locator('[data-experience-tier="fallback"]')).toHaveAttribute(
    'data-experience-scene',
    route.scene,
  )
  await expect(
    page.locator(`[data-fallback-composition="${route.composition}"]`),
  ).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
}

async function clickPrimaryNavigation(
  page: Page,
  name: 'Docs' | 'Home' | 'Registry',
) {
  const link = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
  await link.click()
  await page.waitForLoadState('domcontentloaded')
}

async function listenerSnapshot(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    (
      window as Window & {
        __packsmithListenerAudit: { snapshot: () => Record<string, number> }
      }
    ).__packsmithListenerAudit.snapshot(),
  )
}

test.describe('WebGL fallback', () => {
  for (const route of fallbackRoutes) {
    test(`@fallback ${route.scene} retains its route-specific composition`, async ({
      page,
    }) => {
      const guard = installConsoleGuard(page)
      await expectFallbackRoute(page, route)
      guard.expectNoErrors()
    })
  }

  test('@fallback repeated route cleanup keeps one host and stable listener counts', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalAdd = EventTarget.prototype.addEventListener
      const originalRemove = EventTarget.prototype.removeEventListener
      const registrations = new Map<
        string,
        Set<EventListenerOrEventListenerObject>
      >()

      EventTarget.prototype.addEventListener = function (
        type,
        listener,
        options,
      ) {
        if (this === window && listener) {
          const capture =
            typeof options === 'boolean' ? options : Boolean(options?.capture)
          const key = `${type}:${capture}`
          const listeners = registrations.get(key) ?? new Set()
          listeners.add(listener)
          registrations.set(key, listeners)
        }
        originalAdd.call(this, type, listener, options)
      }

      EventTarget.prototype.removeEventListener = function (
        type,
        listener,
        options,
      ) {
        if (this === window && listener) {
          const capture =
            typeof options === 'boolean' ? options : Boolean(options?.capture)
          registrations.get(`${type}:${capture}`)?.delete(listener)
        }
        originalRemove.call(this, type, listener, options)
      }

      Object.defineProperty(window, '__packsmithListenerAudit', {
        configurable: false,
        value: {
          snapshot: () =>
            Object.fromEntries(
              [...registrations.entries()]
                .map(([type, listeners]) => [type, listeners.size])
                .filter(([, count]) => count > 0),
            ),
        },
      })
    })

    const guard = installConsoleGuard(page)
    await expectFallbackRoute(page, fallbackRoutes[0])
    let baseline: Record<string, number> | undefined

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await clickPrimaryNavigation(page, 'Registry')
      await expect(page.locator('[data-experience-scene="registry"]')).toHaveCount(1)
      await page.getByRole('searchbox', { name: 'Search Packs' }).fill(
        'senior code reviewer',
      )
      await page.locator('[data-pack-id="senior-code-reviewer"]').scrollIntoViewIfNeeded()
      await page.getByRole('link', {
        name: 'Open Passport: Senior Code Reviewer',
        exact: true,
      }).click()
      await expect(page.locator('[data-experience-scene="pack-detail"]')).toHaveCount(1)
      await clickPrimaryNavigation(page, 'Docs')
      await expect(page.locator('[data-experience-scene="docs"]')).toHaveCount(1)
      await clickPrimaryNavigation(page, 'Home')
      await expect(page.locator('[data-experience-scene="home"]')).toHaveCount(1)

      await expect(page.locator('#experience-root')).toHaveCount(1)
      await expect(
        page.locator('#experience-root > [data-scene-phase="stable"]'),
      ).toHaveCount(1)
      const snapshot = await listenerSnapshot(page)
      if (baseline) expect(snapshot).toEqual(baseline)
      baseline = snapshot
    }

    guard.expectNoErrors()
  })
})
