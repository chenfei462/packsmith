import { describe, expect, it } from 'vitest'

import { detectCatalogLocale } from './locale'

describe('catalog locale detection', () => {
  it('prefers a valid stored locale and normalizes regional browser tags', () => {
    expect(detectCatalogLocale('en-US', 'zh')).toBe('zh')
    expect(detectCatalogLocale('ja-JP', null)).toBe('ja')
    expect(detectCatalogLocale('pt-BR', null)).toBe('en')
  })

  it('ignores an unsupported stored value', () => {
    expect(detectCatalogLocale('de-DE', 'pt')).toBe('de')
  })
})
