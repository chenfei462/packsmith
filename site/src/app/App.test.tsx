/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '../test/setup'
import { App } from './App'

describe('App', () => {
  it('introduces Packsmith', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: /package manager for ai agent workflows/i,
      }),
    ).toBeVisible()
    expect(screen.getByText('Packsmith')).toBeVisible()
  })
})
