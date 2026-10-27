import { expect, test, type Page } from '@playwright/test'

import {
  expectCanvasComposition,
} from './helpers/canvas-pixels'
import { installConsoleGuard } from './helpers/console-guard'

const canvasRoutes = [
  {
    path: '/',
    heading: /package manager for ai agent workflows/i,
    interaction: 'scroll',
  },
  { path: '/registry', heading: 'Registry', interaction: 'focus' },
  {
    path: '/registry/senior-code-reviewer',
    heading: 'Senior Code Reviewer',
    interaction: 'scroll',
  },
  { path: '/docs', heading: 'Documentation', interaction: 'docs' },
] as const

function appUrl(path: string): string {
  return path === '/' ? './' : `.${path}`
}

async function openCanvasRoute(
  page: Page,
  route: (typeof canvasRoutes)[number],
) {
  await page.goto(appUrl(route.path))
  await expect(page.getByRole('heading', {
    level: 1,
    name: route.heading,
  })).toBeVisible()
  await expect(
    page.locator('#experience-root > [data-scene-phase="stable"]'),
  ).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('canvas')).toHaveCount(1)
}

async function interactWithRoute(
  page: Page,
  interaction: (typeof canvasRoutes)[number]['interaction'],
) {
  if (interaction === 'focus') {
    await page.getByTestId('registry-result').first().getByRole('link').focus()
    return
  }

  if (interaction === 'docs') {
    const policyLink = page.locator('[data-docs-topic-link][href="#policy"]')
    if (await policyLink.isVisible()) {
      await policyLink.click()
    } else {
      await page.getByRole('combobox', { name: 'Choose a topic' }).selectOption('policy')
    }
    return
  }

  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight * 0.55 }),
  )
}

async function expectSoundTextLayout(page: Page) {
  const result = await page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        'main h1, main h2, main h3, main p, main a, main button, main label, .site-header a, .site-header button',
      ),
    ].filter((element) => {
      if (element.classList.contains('sr-only')) return false
      const style = window.getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number.parseFloat(style.opacity || '1') > 0.05 &&
        bounds.width > 0 &&
        bounds.height > 0
      )
    })

    const overflow = candidates.flatMap((element) => {
      const bounds = element.getBoundingClientRect()
      const text = element.textContent?.trim().slice(0, 80) ?? element.tagName
      const issues: string[] = []
      if (bounds.left < -2 || bounds.right > viewportWidth + 2) {
        issues.push(`viewport:${text}`)
      }
      if (
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 2 &&
        window.getComputedStyle(element).overflowX === 'visible'
      ) {
        issues.push(`text-overflow:${text}`)
      }
      return issues
    })

    const overlap: string[] = []
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const left = candidates[leftIndex]!
        const right = candidates[rightIndex]!
        if (left.parentElement !== right.parentElement) continue
        const leftBounds = left.getBoundingClientRect()
        const rightBounds = right.getBoundingClientRect()
        const width =
          Math.min(leftBounds.right, rightBounds.right) -
          Math.max(leftBounds.left, rightBounds.left)
        const height =
          Math.min(leftBounds.bottom, rightBounds.bottom) -
          Math.max(leftBounds.top, rightBounds.top)
        if (width > 2 && height > 2) {
          overlap.push(
            `${left.textContent?.trim().slice(0, 40)} <> ${right.textContent
              ?.trim()
              .slice(0, 40)}`,
          )
        }
      }
    }

    return {
      documentOverflow: document.documentElement.scrollWidth - viewportWidth,
      overflow,
      overlap,
    }
  })

  expect(result.documentOverflow).toBeLessThanOrEqual(1)
  expect(result.overflow).toEqual([])
  expect(result.overlap).toEqual([])
}

test.describe('3D route rendering', () => {
  for (const route of canvasRoutes) {
    test(`@canvas ${route.path} is nonblank, framed, and responds to route state`, async ({
      page,
    }) => {
      const guard = installConsoleGuard(page)
      await openCanvasRoute(page, route)
      const canvas = page.locator('canvas')
      await expectCanvasComposition(page, canvas)

      await interactWithRoute(page, route.interaction)
      await expect(
        page.locator('#experience-root > [data-scene-phase="stable"]'),
      ).toHaveCount(1)
      await expectCanvasComposition(page, canvas)

      await expectSoundTextLayout(page)
      guard.expectNoErrors()
    })
  }

  test('@visual every route remains contained at 375, 768, 1024, and 1440 pixels', async (
    { page },
    testInfo,
  ) => {
    test.setTimeout(300_000)
    test.skip(
      testInfo.project.name === 'mobile',
      'The desktop browser owns the explicit width matrix.',
    )
    const guard = installConsoleGuard(page)

    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
      for (const route of canvasRoutes) {
        await openCanvasRoute(page, route)
        await expectCanvasComposition(page, page.locator('canvas'))
        await expectSoundTextLayout(page)
      }
    }

    guard.expectNoErrors()
  })

  test('@visual the Passport proof asset loads at its intrinsic size', async ({
    page,
  }) => {
    const guard = installConsoleGuard(page)
    await openCanvasRoute(page, canvasRoutes[0])
    const passport = page.getByRole('img', {
      name: /Packsmith Passport terminal/,
    })
    await passport.scrollIntoViewIfNeeded()
    await expect(passport).toBeVisible()
    expect(
      await passport.evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        height: image.naturalHeight,
        width: image.naturalWidth,
      })),
    ).toEqual({ complete: true, height: 620, width: 1080 })
    guard.expectNoErrors()
  })

  test('@reduced reduced-motion keeps a stable, nonblank demand-rendered scene', async ({
    page,
  }) => {
    const guard = installConsoleGuard(page)
    await openCanvasRoute(page, canvasRoutes[0])
    expect(
      await page.evaluate(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true)
    await expectCanvasComposition(page, page.locator('canvas'))
    const runningAnimations = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(({ playState }) => playState === 'running').length,
    )
    expect(runningAnimations).toBe(0)
    guard.expectNoErrors()
  })
})
