import { expect, test } from '@playwright/test'

import { installConsoleGuard } from './helpers/console-guard'

function appUrl(path: string): string {
  return path === '/' ? './' : `.${path}`
}

test.describe('guided install workflow', () => {
  test('completes all six demo steps and resets', async ({ page }) => {
    const guard = installConsoleGuard(page)
    await page.goto(appUrl('/#guided-demo'))
    await expect(
      page.locator('#experience-root > [data-scene-phase="stable"]'),
    ).toHaveCount(1)

    const demo = page.locator('.demo-sequence')
    await demo.scrollIntoViewIfNeeded()
    await expect(demo.getByText('Step 1 of 6')).toBeVisible()

    for (const step of [2, 3, 4, 5, 6]) {
      await demo.getByRole('button', { name: 'Next step' }).click()
      await expect(demo.getByText(`Step ${step} of 6`)).toBeVisible()
    }

    await expect(demo.getByText(/browser has not written any files/i)).toBeVisible()
    await demo.getByRole('button', { name: 'Reset demo' }).click()
    await expect(demo.getByText('Step 1 of 6')).toBeVisible()
    guard.expectNoErrors()
  })

  test('changes Pack and target without losing demo state', async ({ page }) => {
    const guard = installConsoleGuard(page)
    await page.goto(appUrl('/#guided-demo'))

    const demo = page.locator('.demo-sequence')
    await demo.scrollIntoViewIfNeeded()
    await demo.getByLabel('Pack').selectOption('agent-memory-curator')
    await demo.getByRole('button', { name: 'GitHub Copilot' }).click()

    await expect(demo.getByRole('button', { name: 'GitHub Copilot' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(demo.getByText(/Selected: Agent Memory Curator/)).toBeVisible()
    guard.expectNoErrors()
  })

  test('copies the target-specific install command', async ({ context, page }) => {
    const guard = installConsoleGuard(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173',
    })
    await page.goto(
      appUrl('/registry/senior-code-reviewer?target=codex#install-verification'),
    )
    await expect(
      page.locator('#experience-root > [data-scene-phase="stable"]'),
    ).toHaveCount(1)

    const install = page.locator('[data-install-section]')
    await install.scrollIntoViewIfNeeded()
    const command = (await install.locator('code').textContent())?.trim()
    await install.getByRole('button', { name: 'Copy install command' }).click()

    await expect(install.locator('[data-copy-state="copied"]')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command)
    guard.expectNoErrors()
  })
})
