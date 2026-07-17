import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderAppRoute } from '../test/render'

describe('persistent experience host', () => {
  it('uses one route-specific fallback host across navigation without WebGL', async () => {
    const { router } = renderAppRoute('/')
    await screen.findByRole('heading', {
      level: 1,
      name: /package manager for ai agent workflows/i,
    })

    expect(document.querySelectorAll('#experience-root')).toHaveLength(1)
    expect(
      document.querySelector('[data-experience-tier="fallback"]'),
    ).toBeInTheDocument()

    await act(async () => {
      await router.navigate('/docs')
    })
    await screen.findByRole('heading', { level: 1, name: 'Documentation' })

    expect(document.querySelectorAll('#experience-root')).toHaveLength(1)
    expect(
      document.querySelector('[data-experience-scene="docs"]'),
    ).toBeInTheDocument()
  })
})
