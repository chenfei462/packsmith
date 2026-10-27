import { describe, expect, it } from 'vitest'

import { repositoryData } from '../../../data/repositoryData'
import { layoutRegistryPacks } from './registryLayout'

function expectFiniteLayout(packIds: readonly string[]) {
  const layout = layoutRegistryPacks(packIds, 0x5041434b)

  expect(layout.map((item) => item.id)).toEqual(packIds)
  for (const item of layout) {
    expect([...item.position, ...item.rotation, item.scale].every(Number.isFinite)).toBe(true)
  }
}

describe('layoutRegistryPacks', () => {
  it('returns deterministic unique positions without changing Pack order', () => {
    const packIds = repositoryData.packs.map((pack) => pack.id)
    const first = layoutRegistryPacks(packIds, 0x5041434b)
    const repeated = layoutRegistryPacks(packIds, 0x5041434b)

    expect(first).toEqual(repeated)
    expect(first.map((item) => item.id)).toEqual(packIds)
    expect(new Set(first.map((item) => item.position.join(','))).size).toBe(
      packIds.length,
    )
  })

  it('returns finite transforms for empty, single, and complete catalogs', () => {
    expectFiniteLayout([])
    expectFiniteLayout(['senior-code-reviewer'])
    expectFiniteLayout(repositoryData.packs.map((pack) => pack.id))
  })
})
