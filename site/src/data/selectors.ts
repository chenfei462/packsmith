import type { RiskLevel, RuntimeId, SitePack } from './types'

export type PackSort = 'name' | 'quality' | 'updated'

export interface PackFilters {
  readonly q: string
  readonly category: string
  readonly target: RuntimeId | ''
  readonly risk: RiskLevel | ''
  readonly sort: PackSort
}

function searchableValues(pack: SitePack): string[] {
  const localizedValues = Object.values(pack.localizations).flatMap(
    (localization) =>
      localization ? [localization.name, localization.description] : [],
  )

  return [
    pack.id,
    pack.name,
    pack.description,
    pack.category,
    ...pack.tags,
    ...localizedValues,
  ]
}

export function filterPacks(
  packs: readonly SitePack[],
  filters: PackFilters,
): SitePack[] {
  const query = filters.q.trim().toLocaleLowerCase()
  const category = filters.category.trim().toLocaleLowerCase()
  const filtered = packs.filter((pack) => {
    if (category && pack.category.toLocaleLowerCase() !== category) {
      return false
    }

    if (filters.target && !pack.targetIds.includes(filters.target)) {
      return false
    }

    if (filters.risk && pack.passport.computedRisk !== filters.risk) {
      return false
    }

    return (
      !query ||
      searchableValues(pack).some((value) =>
        value.toLocaleLowerCase().includes(query),
      )
    )
  })

  return [...filtered].sort((left, right) => {
    if (filters.sort === 'quality') {
      return right.passport.qualityScore - left.passport.qualityScore
    }

    if (filters.sort === 'updated') {
      return right.updatedAt.localeCompare(left.updatedAt)
    }

    return left.name.localeCompare(right.name)
  })
}

export function getPackById(
  packs: readonly SitePack[],
  packId: string,
): SitePack | undefined {
  return packs.find((pack) => pack.id === packId)
}
