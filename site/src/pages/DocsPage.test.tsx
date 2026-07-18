import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LanguageProvider } from '../i18n/LanguageProvider'
import { DocsPage } from './DocsPage'

let intersectionCallback: IntersectionObserverCallback | undefined
const scrollIntoView = vi.fn()
const scrollTo = vi.fn()
const writeText = vi.fn(() => Promise.resolve())

class DocsIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback
  }

  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

function renderDocsRoute(initialEntry = '/docs') {
  const router = createMemoryRouter(
    [
      {
        path: '/docs',
        element: (
          <LanguageProvider>
            <DocsPage />
          </LanguageProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  )

  return {
    router,
    ...render(<RouterProvider router={router} />),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  intersectionCallback = undefined
  scrollIntoView.mockClear()
  scrollTo.mockClear()
  writeText.mockClear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: DocsIntersectionObserver,
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

describe('Docs route', () => {
  it('renders readable content immediately with native anchors and sequential headings', async () => {
    const { container } = renderDocsRoute()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Documentation' }),
    ).toBeVisible()
    expect(container.querySelector('[data-scene-ready]')).toBeNull()

    const topicIndex = screen.getByRole('complementary', {
      name: 'Documentation topics',
    })
    const links = within(topicIndex).getAllByRole('link')
    expect(links).toHaveLength(6)
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#install',
      '#author',
      '#publish',
      '#trust',
      '#policy',
      '#audit',
    ])

    const headings = screen.getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual([
      'H1',
      'H2',
      'H2',
      'H2',
      'H2',
      'H2',
      'H2',
    ])
  })

  it('updates the active topic from observed reading position', async () => {
    const { container } = renderDocsRoute()
    await screen.findByRole('heading', { level: 1, name: 'Documentation' })
    const policy = container.querySelector('#policy')

    expect(policy).not.toBeNull()
    expect(intersectionCallback).toBeTypeOf('function')
    act(() => {
      intersectionCallback?.(
        [
          {
            target: policy!,
            isIntersecting: true,
            intersectionRatio: 0.82,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )
    })

    expect(screen.getByRole('link', { name: /Policy/i })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  it('moves through topic anchors with the keyboard and scrolls selected sections', async () => {
    const user = userEvent.setup()
    const { router } = renderDocsRoute()
    await screen.findByRole('heading', { level: 1, name: 'Documentation' })
    const install = screen.getByRole('link', { name: /Install/i })
    const author = screen.getByRole('link', { name: /Author/i })

    install.focus()
    await user.keyboard('{ArrowDown}')
    expect(author).toHaveFocus()

    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(router.state.location.hash).toBe('#author')
    })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('id', 'author')
  })

  it('copies a topic command without waiting for the 3D scene', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { container } = renderDocsRoute()
    await screen.findByRole('heading', { level: 1, name: 'Documentation' })
    const install = container.querySelector('#install')

    expect(install).not.toBeNull()
    await user.click(
      within(install as HTMLElement).getAllByRole('button', {
        name: 'Copy command',
      })[0],
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'node src/cli.mjs passport senior-code-reviewer',
      )
    })
    expect(screen.getByText('Command copied')).toBeVisible()
  })
})
