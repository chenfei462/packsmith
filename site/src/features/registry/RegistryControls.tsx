import { RotateCcw, Search } from 'lucide-react'

import { repositoryData } from '../../data/repositoryData'
import type { PackFilters, PackSort } from '../../data/selectors'
import type { RiskLevel, RuntimeId } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { registryCopy } from './registryCopy'
import { registryCategories } from './registryQuery'

export function RegistryControls({
  filters,
  onChange,
  onReset,
}: {
  readonly filters: PackFilters
  readonly onChange: (
    patch: Partial<PackFilters>,
    options?: { readonly replace?: boolean },
  ) => void
  readonly onReset: () => void
}) {
  const { siteLocale } = useLanguage()
  const copy = registryCopy[siteLocale]
  const isDefault =
    !filters.q &&
    !filters.category &&
    !filters.target &&
    !filters.risk &&
    filters.sort === 'name'

  return (
    <form
      className="registry-controls"
      aria-label={copy.search}
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="registry-control registry-control--search">
        <span>{copy.search}</span>
        <div>
          <Search aria-hidden="true" size={18} />
          <input
            type="search"
            value={filters.q}
            placeholder={copy.searchPlaceholder}
            onChange={(event) =>
              onChange(
                { q: event.target.value },
                { replace: true },
              )
            }
          />
        </div>
      </label>

      <label className="registry-control">
        <span>{copy.category}</span>
        <select
          value={filters.category}
          onChange={(event) => onChange({ category: event.target.value })}
        >
          <option value="">{copy.allCategories}</option>
          {registryCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className="registry-control">
        <span>{copy.target}</span>
        <select
          value={filters.target}
          onChange={(event) =>
            onChange({ target: event.target.value as RuntimeId | '' })
          }
        >
          <option value="">{copy.allTargets}</option>
          {repositoryData.targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
      </label>

      <label className="registry-control">
        <span>{copy.risk}</span>
        <select
          value={filters.risk}
          onChange={(event) =>
            onChange({ risk: event.target.value as RiskLevel | '' })
          }
        >
          <option value="">{copy.allRisks}</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>

      <label className="registry-control">
        <span>{copy.sort}</span>
        <select
          value={filters.sort}
          onChange={(event) =>
            onChange({ sort: event.target.value as PackSort })
          }
        >
          <option value="name">{copy.sortName}</option>
          <option value="quality">{copy.sortQuality}</option>
          <option value="updated">{copy.sortUpdated}</option>
        </select>
      </label>

      <button
        className="registry-reset"
        type="button"
        disabled={isDefault}
        onClick={onReset}
      >
        <RotateCcw aria-hidden="true" size={17} />
        {copy.reset}
      </button>
    </form>
  )
}
