import { createContext } from 'react'

import type { MessageKey } from '../content/messages'
import type { CatalogLocale, SiteLocale } from '../data/types'

export interface LanguageContextValue {
  readonly locale: CatalogLocale
  readonly siteLocale: SiteLocale
  readonly setLocale: (locale: CatalogLocale) => void
  readonly t: (key: MessageKey) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
