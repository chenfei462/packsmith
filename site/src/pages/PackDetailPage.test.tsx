import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { sceneStore } from '../experience/sceneStore'
import { renderAppRoute } from '../test/render'

beforeEach(() => window.localStorage.clear())

describe('Pack detail route', () => {
  it('renders the selected Codex Passport evidence and install plan', async () => {
    renderAppRoute('/registry/senior-code-reviewer?target=codex')

    expect(
      await screen.findByRole('heading', { name: 'Senior Code Reviewer' }),
    ).toBeVisible()

    const manifest = screen.getByRole('region', { name: 'Manifest' })
    expect(within(manifest).getByText('Verified publisher')).toBeVisible()
    expect(within(manifest).getByText('packsmith')).toBeVisible()
    expect(within(manifest).getByText('Declared risk')).toBeVisible()
    expect(within(manifest).getByText('low')).toBeVisible()

    const permissions = screen.getByRole('region', { name: 'Permissions' })
    expect(within(permissions).getByText('Shell')).toBeVisible()
    expect(within(permissions).getByText('Filesystem')).toBeVisible()
    expect(within(permissions).getByText('required')).toBeVisible()
    expect(within(permissions).getByText('Network')).toBeVisible()
    expect(within(permissions).getAllByText('optional')).toHaveLength(2)
    expect(within(permissions).getByText('Browser')).toBeVisible()
    expect(within(permissions).getByText('none')).toBeVisible()

    const risk = screen.getByRole('region', { name: 'Risk analysis' })
    expect(within(risk).getByText('Computed risk')).toBeVisible()
    expect(within(risk).getByText('medium')).toBeVisible()
    expect(within(risk).getByText('registry declares low risk')).toBeVisible()
    expect(within(risk).getByText('filesystem: required')).toBeVisible()
    expect(within(risk).getByText('network: optional')).toBeVisible()

    const provenance = screen.getByRole('region', { name: 'Provenance' })
    expect(within(provenance).getByText('95 / 100')).toBeVisible()
    expect(within(provenance).getByText('calculated')).toBeVisible()
    expect(within(provenance).getByText('preview-only')).toBeVisible()
    expect(within(provenance).getByText('No files were written.')).toBeVisible()

    const writes = screen.getByRole('region', { name: 'Preview writes' })
    const expectedWrites = [
      '<home>/.codex/skills/senior-code-reviewer/AGENTS.md',
      '<home>/.codex/skills/senior-code-reviewer/README.md',
      '<home>/.codex/skills/senior-code-reviewer/bundle.json',
      '<home>/.codex/skills/senior-code-reviewer/catalog.json',
      '<home>/.codex/skills/senior-code-reviewer/manifest.json',
      '<home>/.codex/skills/senior-code-reviewer/prompts/review-current-change.md',
      '<home>/.codex/skills/senior-code-reviewer/skills/senior-code-review/SKILL.md',
    ]
    expectedWrites.forEach((path) => {
      expect(within(writes).getByText(path)).toBeVisible()
    })

    const install = screen.getByRole('region', { name: 'Install verification' })
    expect(
      within(install).getByText(
        'node src/cli.mjs install senior-code-reviewer --target codex --yes',
      ),
    ).toBeVisible()
    expect(
      within(install).getByRole('button', { name: 'Copy install command' }),
    ).toBeEnabled()
    expect(
      within(install).getByRole('link', { name: 'Browse Registry' }),
    ).toHaveAttribute('href', '/registry')
    expect(
      within(install).getByRole('link', { name: 'Read documentation' }),
    ).toHaveAttribute('href', '/docs')
  })

  it('preserves an unavailable GitHub Copilot target without a command', async () => {
    renderAppRoute(
      '/registry/accessibility-auditor?target=github-copilot',
    )

    expect(
      await screen.findByRole('heading', { name: 'Accessibility Auditor' }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: /GitHub Copilot/i }),
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Not available for this Pack')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Copy install command' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'node src/cli.mjs install accessibility-auditor --target github-copilot --yes',
      ),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(sceneStore.getState().active).toMatchObject({
        scene: 'pack-detail',
        packId: 'accessibility-auditor',
        targetId: 'github-copilot',
      })
    })
  })

  it('renders an unknown Pack inside the application shell', async () => {
    renderAppRoute('/registry/not-a-real-pack')

    expect(
      await screen.findByRole('heading', { name: 'Pack not found' }),
    ).toBeVisible()
    expect(screen.getByRole('navigation')).toBeVisible()
  })

  it('localizes the Passport interface in Chinese', async () => {
    window.localStorage.setItem('packsmith.locale', 'zh')
    renderAppRoute('/registry/senior-code-reviewer?target=codex')

    expect(
      await screen.findByRole('heading', { name: '高级代码审查' }),
    ).toBeVisible()
    expect(screen.getByRole('group', { name: '运行时目标' })).toBeVisible()
    expect(screen.getByText('01 / 护照层')).toBeVisible()
    expect(screen.getByText('版本')).toBeVisible()
    expect(screen.getByText('许可证')).toBeVisible()
    expect(screen.getByText('质量评分 95/100')).toBeVisible()
    expect(screen.getByText('05 / 护照层')).toBeVisible()
    expect(screen.getByText('06 / 验证')).toBeVisible()
    expect(screen.getByRole('link', { name: '浏览 Registry' })).toBeVisible()
    expect(screen.getByRole('link', { name: '阅读文档' })).toBeVisible()
  })

  it('keeps URL, preview evidence, command, and 3D adapter in sync on target change', async () => {
    const user = userEvent.setup()
    const { router } = renderAppRoute(
      '/registry/senior-code-reviewer?target=codex',
    )
    await screen.findByRole('heading', { name: 'Senior Code Reviewer' })

    await user.click(screen.getByRole('link', { name: /Cursor/i }))

    expect(router.state.location.search).toBe('?target=cursor')
    expect(screen.getByRole('link', { name: /Cursor/i })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      await screen.findByText(
        '<home>/.cursor/rules/packsmith/senior-code-reviewer/senior-code-reviewer.mdc',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'node src/cli.mjs install senior-code-reviewer --target cursor --yes',
      ),
    ).toBeVisible()
    await waitFor(() => {
      expect(sceneStore.getState().active).toMatchObject({
        scene: 'pack-detail',
        packId: 'senior-code-reviewer',
        targetId: 'cursor',
      })
    })
  })
})
