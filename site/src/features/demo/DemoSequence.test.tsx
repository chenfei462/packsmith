import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { LanguageProvider } from '../../i18n/LanguageProvider'
import { DemoSequence } from './DemoSequence'

describe('DemoSequence', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps every step visible and advances without animation timing', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <DemoSequence />
      </LanguageProvider>,
    )

    for (const label of [
      'Search',
      'Passport',
      'Preview',
      'Choose agent',
      'Install',
      'Use',
    ]) {
      expect(screen.getByText(label)).toBeVisible()
    }

    expect(screen.getByText(/step 1 of 6/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /next step/i }))
    expect(screen.getByText(/step 2 of 6/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /skip to install/i }))
    expect(screen.getByText(/step 5 of 6/i)).toBeVisible()
    expect(
      screen.getByText(
        'node src/cli.mjs install senior-code-reviewer --target codex --yes',
      ),
    ).toBeVisible()
  })

  it('localizes the complete demo controls for Chinese readers', () => {
    window.localStorage.setItem('packsmith.locale', 'zh')
    render(
      <LanguageProvider>
        <DemoSequence />
      </LanguageProvider>,
    )

    expect(screen.getByText('第 1 步，共 6 步')).toBeVisible()
    expect(screen.getByRole('button', { name: '上一步' })).toBeVisible()
    expect(screen.getByRole('button', { name: '跳到安装' })).toBeVisible()
    expect(screen.getByRole('button', { name: '下一步' })).toBeVisible()
  })
})
