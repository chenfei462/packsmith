import { describe, expect, it } from 'vitest'

import { repositoryData } from '../../data/repositoryData'
import {
  parseRegistryQuery,
  serializeRegistryQuery,
} from './registryQuery'

describe('registry URL query', () => {
  it('normalizes unknown filter and sort values', () => {
    const filters = parseRegistryQuery(
      new URLSearchParams(
        'q=review&category=unknown&target=windsurf&risk=critical&sort=oldest',
      ),
    )

    expect(filters).toEqual({
      q: 'review',
      category: '',
      target: '',
      risk: '',
      sort: 'name',
    })
  })

  it('parses every supported query dimension', () => {
    const category = repositoryData.packs[0].category
    const filters = parseRegistryQuery(
      new URLSearchParams(
        `q=security&category=${encodeURIComponent(category)}&target=codex&risk=medium&sort=quality`,
      ),
    )

    expect(filters).toEqual({
      q: 'security',
      category,
      target: 'codex',
      risk: 'medium',
      sort: 'quality',
    })
  })

  it('round-trips encoded search text and omits default values', () => {
    const query = serializeRegistryQuery({
      q: 'checksum & 风险/quality',
      category: '',
      target: 'github-copilot',
      risk: '',
      sort: 'name',
    })

    expect(query.toString()).toBe(
      'q=checksum+%26+%E9%A3%8E%E9%99%A9%2Fquality&target=github-copilot',
    )
    expect(parseRegistryQuery(query)).toEqual({
      q: 'checksum & 风险/quality',
      category: '',
      target: 'github-copilot',
      risk: '',
      sort: 'name',
    })
  })
})
