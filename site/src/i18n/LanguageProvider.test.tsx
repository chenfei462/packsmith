import { useContext } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { LanguageContext } from './LanguageContext'
import { LanguageProvider } from './LanguageProvider'

function LanguageHarness() {
  const language = useContext(LanguageContext)

  if (!language) {
    throw new Error('LanguageHarness must be rendered inside LanguageProvider.')
  }

  return (
    <nav aria-label={language.t('nav.primary')}>
      <span>{language.t('nav.registry')}</span>
      <button type="button" onClick={() => language.setLocale('zh')}>
        中文
      </button>
    </nav>
  )
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
  })

  it('persists Chinese selection and updates navigation messages', async () => {
    const user = userEvent.setup()
    const firstRender = render(
      <LanguageProvider>
        <LanguageHarness />
      </LanguageProvider>,
    )

    expect(screen.getByText('Registry')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '中文' }))

    expect(screen.getByText('技能库')).toBeVisible()
    expect(window.localStorage.getItem('packsmith.locale')).toBe('zh')
    expect(document.documentElement.lang).toBe('zh')

    firstRender.unmount()
    render(
      <LanguageProvider>
        <LanguageHarness />
      </LanguageProvider>,
    )

    expect(screen.getByText('技能库')).toBeVisible()
  })
})
