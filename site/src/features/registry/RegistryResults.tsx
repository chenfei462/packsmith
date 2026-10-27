import { useEffect, useMemo } from 'react'
import { SearchX } from 'lucide-react'
import { useStore } from 'zustand'

import type { SitePack } from '../../data/types'
import { sceneStore } from '../../experience/sceneStore'
import { useLanguage } from '../../i18n/useLanguage'
import { registryCopy } from './registryCopy'
import { RegistryResultRow } from './RegistryResultRow'

export function RegistryResults({ packs }: { readonly packs: readonly SitePack[] }) {
  const { siteLocale } = useLanguage()
  const copy = registryCopy[siteLocale]
  const activeScene = useStore(sceneStore, (state) => state.active.scene)
  const packIds = useMemo(() => packs.map((pack) => pack.id), [packs])

  useEffect(() => {
    const active = sceneStore.getState().active

    if (active.scene === 'registry') {
      sceneStore.getState().patchScene({
        packIds,
        focusedPackId:
          active.focusedPackId && packIds.includes(active.focusedPackId)
            ? active.focusedPackId
            : undefined,
      })
    }
  }, [activeScene, packIds])

  const activatePack = (packId: string) => {
    if (sceneStore.getState().active.scene === 'registry') {
      sceneStore.getState().patchScene({ focusedPackId: packId })
    }
  }

  const releasePointerPack = (packId: string, row: HTMLLIElement) => {
    const active = sceneStore.getState().active

    if (
      active.scene === 'registry' &&
      active.focusedPackId === packId &&
      !row.contains(document.activeElement)
    ) {
      sceneStore.getState().patchScene({ focusedPackId: undefined })
    }
  }

  return (
    <div className="registry-results">
      <header className="registry-results__header">
        <div>
          <p className="eyebrow">{copy.resultsEyebrow}</p>
          <h2>{copy.resultsTitle}</h2>
        </div>
        <p className="registry-results__count" role="status" aria-live="polite">
          <strong key={packs.length}>{packs.length}</strong>
          <span>{copy.matchingPacks}</span>
        </p>
      </header>

      {packs.length ? (
        <>
          <div className="registry-results__columns" aria-hidden="true">
            <span>#</span>
            <span>{copy.columnPack}</span>
            <span>{copy.columnCategory}</span>
            <span>{copy.columnRisk}</span>
            <span>{copy.columnQuality}</span>
            <span>{copy.columnTargets}</span>
            <span>Passport</span>
          </div>
          <ol className="registry-results__list">
            {packs.map((pack, index) => (
              <RegistryResultRow
                key={pack.id}
                index={index}
                pack={pack}
                onActive={activatePack}
                onPointerLeave={releasePointerPack}
              />
            ))}
          </ol>
        </>
      ) : (
        <div className="registry-empty" role="status">
          <SearchX aria-hidden="true" />
          <h3>{copy.emptyTitle}</h3>
          <p>{copy.emptyBody}</p>
        </div>
      )}
    </div>
  )
}
