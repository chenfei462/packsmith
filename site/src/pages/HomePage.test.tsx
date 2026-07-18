import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { repositoryData } from '../data/repositoryData'
import { renderAppRoute } from '../test/render'

describe('HomePage product story', () => {
  it('renders the real Packsmith flow, evidence, runtimes, and install command', async () => {
    const { container } = renderAppRoute('/')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'The package manager for AI agent workflows.',
      }),
    ).toBeVisible()
    expect(container.querySelectorAll('[data-home-section]')).toHaveLength(8)
    expect(screen.getByRole('link', { name: /start guided demo/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /view on github/i })).toBeVisible()

    for (const step of [
      'Search',
      'Passport',
      'Preview',
      'Choose agent',
      'Install',
      'Use',
    ]) {
      expect(screen.getByText(step)).toBeVisible()
    }

    expect(screen.getByText(/declared risk/i)).toHaveTextContent('low')
    expect(screen.getByText(/computed risk/i)).toHaveTextContent('medium')
    const permissions = screen
      .getByRole('heading', { level: 3, name: 'Permissions' })
      .closest('article')
    expect(permissions).not.toBeNull()
    expect(within(permissions!).getByText(/^shell:/i)).toHaveTextContent('optional')
    expect(within(permissions!).getByText(/^filesystem:/i)).toHaveTextContent('required')
    expect(within(permissions!).getByText(/^network:/i)).toHaveTextContent('optional')
    expect(within(permissions!).getByText(/^browser:/i)).toHaveTextContent('none')
    expect(screen.getByText(/quality score/i)).toHaveTextContent('95 / 100')
    expect(screen.getByText(/checksum status/i)).toHaveTextContent('calculated')
    expect(screen.getByText(/preview only/i)).toHaveTextContent(
      'No files were written.',
    )

    for (const target of repositoryData.targets) {
      expect(screen.getAllByText(target.name).length).toBeGreaterThanOrEqual(1)
    }
    expect(
      screen.getByText(`${repositoryData.packs.length} official Packs`),
    ).toBeVisible()
    expect(
      screen.getByText(`${repositoryData.targets.length} supported runtimes`),
    ).toBeVisible()
    expect(screen.getAllByText('Planned').length).toBeGreaterThanOrEqual(4)
    expect(
      screen.getByText(
        'node src/cli.mjs install senior-code-reviewer --target codex --yes',
      ),
    ).toBeVisible()
  })
})
