import { expect, test, type Page } from '@playwright/test'

import { installConsoleGuard } from './helpers/console-guard'

const coreRoutes = [
  { path: '/', heading: /package manager for ai agent workflows/i },
  { path: '/registry', heading: 'Registry' },
  { path: '/registry/senior-code-reviewer', heading: 'Senior Code Reviewer' },
  { path: '/docs', heading: 'Documentation' },
] as const

function appUrl(path: string): string {
  return path === '/' ? './' : `.${path}`
}

async function expectRoute(
  page: Page,
  path: string,
  heading: string | RegExp,
) {
  const response = await page.goto(appUrl(path))

  expect(response?.ok(), `GET ${path}`).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await expect(
    page.locator('#experience-root > [data-scene-phase="stable"]'),
  ).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
}

async function clickPrimaryNavigation(
  page: Page,
  name: 'Docs' | 'Home' | 'Registry',
) {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
  const link = navigation.getByRole('link', { name, exact: true })

  if (!(await link.isVisible())) {
    await navigation.getByRole('button', { name: 'Open navigation' }).click()
  }

  await link.click()
  await page.waitForLoadState('domcontentloaded')
}

test.describe('production route shells', () => {
  for (const route of coreRoutes) {
    test(`${route.path} renders a complete route`, async ({ page }) => {
      const guard = installConsoleGuard(page)

      await expectRoute(page, route.path, route.heading)

      guard.expectNoErrors()
    })
  }

  test('all 53 generated Pack detail paths support direct loading', async (
    { page },
    testInfo,
  ) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'The desktop route matrix owns exhaustive deep-link coverage.',
    )
    test.setTimeout(300_000)
    const guard = installConsoleGuard(page)

    await expectRoute(page, '/registry', 'Registry')
    const packIds = await page
      .getByTestId('registry-result')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-pack-id')))

    expect(packIds).toHaveLength(53)
    expect(packIds.every((packId): packId is string => Boolean(packId))).toBe(true)

    for (const packId of packIds) {
      await expectRoute(
        page,
        `/registry/${encodeURIComponent(packId!)}`,
        /.+/,
      )
    }

    guard.expectNoErrors()
  })

  test('unknown Pack IDs render a recoverable error route', async ({ page }) => {
    const guard = installConsoleGuard(page)

    const response = await page.goto(appUrl('/registry/not-a-real-pack'))

    expect(response?.ok()).toBe(true)
    await expect(page.getByRole('heading', { level: 1, name: 'Pack not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Registry' })).toBeVisible()
    guard.expectNoErrors()
  })

  test('navigation cycles retain a single shell and stable scene', async ({ page }) => {
    test.setTimeout(120_000)
    const guard = installConsoleGuard(page)
    await expectRoute(page, '/', /package manager for ai agent workflows/i)

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await clickPrimaryNavigation(page, 'Registry')
      await expect(page, `cycle ${cycle + 1} Registry URL`).toHaveURL(
        /\/registry$/,
      )
      await expect(page.getByRole('heading', {
        level: 1,
        name: 'Registry',
      })).toBeVisible({ timeout: 20_000 })
      await page.getByRole('searchbox', { name: 'Search Packs' }).fill(
        'senior code reviewer',
      )
      await expect(page).toHaveURL(/q=senior(?:\+|%20)code(?:\+|%20)reviewer/)
      const reviewerRow = page.locator('[data-pack-id="senior-code-reviewer"]')
      await reviewerRow.scrollIntoViewIfNeeded()
      await expect(reviewerRow).toBeVisible()
      await reviewerRow.getByRole('link', {
        name: 'Open Passport: Senior Code Reviewer',
        exact: true,
      }).click()
      await expect(page.getByRole('heading', {
        level: 1,
        name: 'Senior Code Reviewer',
      })).toBeVisible({ timeout: 20_000 })
      await clickPrimaryNavigation(page, 'Docs')
      await expect(page.getByRole('heading', {
        level: 1,
        name: 'Documentation',
      })).toBeVisible({ timeout: 20_000 })
      await clickPrimaryNavigation(page, 'Home')
      await expect(page.getByRole('heading', {
        level: 1,
        name: /package manager for ai agent workflows/i,
      })).toBeVisible({ timeout: 20_000 })
      await expect(
        page.locator('#experience-root > [data-scene-phase="stable"]'),
      ).toHaveCount(1)
      await expect(page.locator('#experience-root')).toHaveCount(1)
    }

    guard.expectNoErrors()
  })

  test('direct deep links preserve supported query and hash state', async ({ page }) => {
    const guard = installConsoleGuard(page)

    await expectRoute(
      page,
      '/registry/senior-code-reviewer?target=github-copilot#install-verification',
      'Senior Code Reviewer',
    )
    await expect(page).toHaveURL(/\/registry\/senior-code-reviewer\?target=github-copilot#install-verification$/)
    await expect(
      page.locator('.target-segments__item[aria-current="true"]'),
    ).toContainText('GitHub Copilot')

    await expectRoute(page, '/docs#policy', 'Documentation')
    await expect(page).toHaveURL(/\/docs#policy$/)
    await expect(page.locator('[data-docs-topic-link][href="#policy"]')).toHaveAttribute('aria-current', 'location')

    guard.expectNoErrors()
  })
})
