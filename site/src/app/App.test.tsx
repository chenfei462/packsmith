/** @vitest-environment jsdom */

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderAppRoute } from '../test/render'

const routeCases = [
  ['/', /package manager for ai agent workflows/i],
  ['/registry', 'Registry'],
  ['/registry/senior-code-reviewer', 'Senior Code Reviewer'],
  ['/docs', 'Documentation'],
] as const

describe.each([375, 1440])('application shell at %ipx', (width) => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it.each(routeCases)('renders %s with one stable shell', async (path, heading) => {
    renderAppRoute(path, { width })

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeVisible()
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByRole('link', { name: /packsmith/i })).toBeVisible()
    expect(screen.getByRole('combobox', { name: /language/i })).toBeEnabled()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  it('keeps the mobile navigation control reachable', async () => {
    const user = userEvent.setup()
    renderAppRoute('/registry', { width })
    await screen.findByRole('heading', { level: 1, name: 'Registry' })

    const menuButton = screen.getByRole('button', { name: /open navigation/i })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Docs' })).toBeVisible()
  })
})

describe('Pack detail errors', () => {
  it('renders a clear unknown-Pack state with a Registry link', async () => {
    renderAppRoute('/registry/does-not-exist')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pack not found' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /back to registry/i })).toHaveAttribute(
      'href',
      '/registry',
    )
  })
})
