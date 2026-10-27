import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { messages, type MessageKey } from '../content/messages'
import type { CatalogLocale } from '../data/types'
import {
  LanguageContext,
  type LanguageContextValue,
} from './LanguageContext'
import { detectCatalogLocale, getSiteLocale } from './locale'

const storageKey = 'packsmith.locale'

function readInitialLocale(): CatalogLocale {
  if (typeof window === 'undefined') {
    return 'en'
  }

  let storedLocale: string | null = null

  try {
    storedLocale = window.localStorage.getItem(storageKey)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return detectCatalogLocale(window.navigator.language, storedLocale)
}

export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<CatalogLocale>(readInitialLocale)
  const siteLocale = getSiteLocale(locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((nextLocale: CatalogLocale) => {
    setLocaleState(nextLocale)

    try {
      window.localStorage.setItem(storageKey, nextLocale)
    } catch {
      // The in-memory selection still works when persistence is unavailable.
    }
  }, [])

  const t = useCallback(
    (key: MessageKey) => messages[siteLocale][key],
    [siteLocale],
  )
  const value = useMemo<LanguageContextValue>(
    () => ({ locale, siteLocale, setLocale, t }),
    [locale, setLocale, siteLocale, t],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}
