import { Languages } from 'lucide-react'

import { isCatalogLocale } from '../i18n/locale'
import { useLanguage } from '../i18n/useLanguage'

const languageNames = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
} as const

export function LanguageMenu() {
  const { locale, setLocale, t } = useLanguage()

  return (
    <label className="language-menu">
      <Languages aria-hidden="true" size={18} strokeWidth={1.8} />
      <span className="sr-only">{t('nav.language')}</span>
      <select
        aria-label={t('nav.language')}
        value={locale}
        onChange={(event) => {
          if (isCatalogLocale(event.target.value)) {
            setLocale(event.target.value)
          }
        }}
      >
        {Object.entries(languageNames).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}
