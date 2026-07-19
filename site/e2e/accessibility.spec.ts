import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { installConsoleGuard } from './helpers/console-guard'

const accessibleRoutes = [
  { path: '/', heading: /package manager for ai agent workflows/i },
  { path: '/registry', heading: 'Registry' },
  { path: '/registry/senior-code-reviewer', heading: 'Senior Code Reviewer' },
  { path: '/docs', heading: 'Documentation' },
] as const

function appUrl(path: string): string {
  return path === '/' ? './' : `.${path}`
}

async function focusByTab(page: Page, target: Locator, limit = 160) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }

  const label =
    (await target.getAttribute('aria-label')) ?? (await target.textContent())
  throw new Error(`Tab order did not reach ${label}`)
}

async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused()
  const focusIsVisible = await target.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return (
      (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== 'none'
    )
  })
  expect(focusIsVisible).toBe(true)
}

test.describe('route accessibility', () => {
  for (const route of accessibleRoutes) {
    test(`${route.path} has a valid semantic and axe baseline`, async ({ page }) => {
      const guard = installConsoleGuard(page)
      await page.goto(appUrl(route.path))
      await expect(page.getByRole('heading', {
        level: 1,
        name: route.heading,
      })).toBeVisible()
      await expect(page.locator('[data-scene-phase="stable"]')).toHaveCount(1)

      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('navigation')).toHaveCount(1)
      await expect(page.locator('canvas')).toHaveAttribute('tabindex', '-1')

      const headingLevels = await page
        .locator('main h1, main h2, main h3, main h4, main h5, main h6')
        .evaluateAll((headings) =>
          headings
            .filter((heading) => {
              const bounds = heading.getBoundingClientRect()
              return bounds.width > 0 && bounds.height > 0
            })
            .map((heading) => Number(heading.tagName.slice(1))),
        )
      expect(headingLevels[0]).toBe(1)
      for (let index = 1; index < headingLevels.length; index += 1) {
        expect(headingLevels[index]! - headingLevels[index - 1]!).toBeLessThanOrEqual(1)
      }

      const results = await new AxeBuilder({ page }).analyze()
      const seriousViolations = results.violations.filter(
        ({ impact }) => impact === 'serious' || impact === 'critical',
      )
      expect(seriousViolations).toEqual([])
      guard.expectNoErrors()
    })
  }

  test('keyboard-only workflows retain visible focus and route state', async (
    { page },
    testInfo,
  ) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'The desktop project owns the long keyboard traversal.',
    )
    const guard = installConsoleGuard(page)

    await page.goto(appUrl('/#guided-demo'))
    const targetButton = page.locator('.demo-sequence').getByRole('button', {
      name: 'Claude Code',
    })
    await focusByTab(page, targetButton)
    await expectVisibleFocus(targetButton)
    await page.keyboard.press('Enter')
    await expect(targetButton).toHaveAttribute('aria-pressed', 'true')

    const nextButton = page.locator('.demo-sequence').getByRole('button', {
      name: 'Next step',
    })
    await focusByTab(page, nextButton)
    for (let step = 2; step <= 6; step += 1) {
      await page.keyboard.press('Enter')
      await expect(
        page.locator('.demo-sequence').getByText(`Step ${step} of 6`),
      ).toBeVisible()
    }

    await page.goto(appUrl('/registry'))
    const search = page.getByRole('searchbox', { name: 'Search Packs' })
    await focusByTab(page, search)
    await page.keyboard.type('security reviewer')
    await expect(page).toHaveURL(/q=security(?:\+|%20)reviewer/)
    const result = page.getByRole('link', {
      name: 'Open Passport: Security Reviewer',
    })
    await focusByTab(page, result)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Security Reviewer',
    })).toBeVisible()

    const copilot = page.getByRole('link', { name: /GitHub Copilot/ })
    await focusByTab(page, copilot)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/target=github-copilot/)

    await page.goto(appUrl('/docs'))
    const policy = page.locator('[data-docs-topic-link][href="#policy"]')
    await focusByTab(page, policy)
    await expectVisibleFocus(policy)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/docs#policy$/)
    guard.expectNoErrors()
  })
})
