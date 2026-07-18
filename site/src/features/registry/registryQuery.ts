import { repositoryData } from '../../data/repositoryData'
import type { PackFilters, PackSort } from '../../data/selectors'
import type { RiskLevel, RuntimeId } from '../../data/types'

export const registryCategories = [
  ...new Set(repositoryData.packs.map((pack) => pack.category)),
].sort((left, right) => left.localeCompare(right))

const categoriesByValue = new Map(
  registryCategories.map((category) => [category.toLocaleLowerCase(), category]),
)
const targetIds = new Set<string>(repositoryData.supportedTargetIds)
const riskLevels = new Set<RiskLevel>(['low', 'medium', 'high', 'blocked'])
const sortValues = new Set<PackSort>(['name', 'quality', 'updated'])

export function parseRegistryQuery(searchParams: URLSearchParams): PackFilters {
  const categoryValue = searchParams.get('category') ?? ''
  const targetValue = searchParams.get('target') ?? ''
  const riskValue = searchParams.get('risk') ?? ''
  const sortValue = searchParams.get('sort') ?? ''

  return {
    q: searchParams.get('q') ?? '',
    category:
      categoriesByValue.get(categoryValue.toLocaleLowerCase()) ?? '',
    target: targetIds.has(targetValue) ? (targetValue as RuntimeId) : '',
    risk: riskLevels.has(riskValue as RiskLevel)
      ? (riskValue as RiskLevel)
      : '',
    sort: sortValues.has(sortValue as PackSort)
      ? (sortValue as PackSort)
      : 'name',
  }
}

export function serializeRegistryQuery(filters: PackFilters): URLSearchParams {
  const searchParams = new URLSearchParams()

  if (filters.q) searchParams.set('q', filters.q)
  if (filters.category) searchParams.set('category', filters.category)
  if (filters.target) searchParams.set('target', filters.target)
  if (filters.risk) searchParams.set('risk', filters.risk)
  if (filters.sort !== 'name') searchParams.set('sort', filters.sort)

  return searchParams
}
