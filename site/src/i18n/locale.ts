import type { CatalogLocale, SiteLocale } from '../data/types'

export const catalogLocales = [
  'en',
  'zh',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
] as const satisfies readonly CatalogLocale[]

export function isCatalogLocale(value: string): value is CatalogLocale {
  return (catalogLocales as readonly string[]).includes(value)
}

export function detectCatalogLocale(
  language: string | null | undefined,
  stored: string | null | undefined,
): CatalogLocale {
  const storedLocale = stored?.trim().toLocaleLowerCase()

  if (storedLocale && isCatalogLocale(storedLocale)) {
    return storedLocale
  }

  const browserLocale = language
    ?.trim()
    .toLocaleLowerCase()
    .split(/[-_]/, 1)[0]

  return browserLocale && isCatalogLocale(browserLocale)
    ? browserLocale
    : 'en'
}

export function getSiteLocale(locale: CatalogLocale): SiteLocale {
  return locale === 'zh' ? 'zh' : 'en'
}
