import { useEffect, useMemo } from 'react'
import { ArrowDown, Boxes, Network } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useSectionTimeline } from '../animation/useSectionTimeline'
import { repositoryData } from '../data/repositoryData'
import { filterPacks, type PackFilters } from '../data/selectors'
import { sceneStore } from '../experience/sceneStore'
import { RegistryControls } from '../features/registry/RegistryControls'
import { registryCopy } from '../features/registry/registryCopy'
import {
  parseRegistryQuery,
  serializeRegistryQuery,
} from '../features/registry/registryQuery'
import { RegistryResults } from '../features/registry/RegistryResults'
import '../features/registry/registry.css'
import { useLanguage } from '../i18n/useLanguage'

export function RegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { siteLocale } = useLanguage()
  const copy = registryCopy[siteLocale]
  const root = useSectionTimeline<HTMLElement>()
  const filters = useMemo(
    () => parseRegistryQuery(searchParams),
    [searchParams],
  )
  const results = useMemo(
    () => filterPacks(repositoryData.packs, filters),
    [filters],
  )

  useEffect(() => {
    let frame = 0
    const updateProgress = () => {
      frame = 0
      const article = root.current
      const active = sceneStore.getState().active

      if (!article || active.scene !== 'registry') return
      const scrollRange = Math.max(1, article.scrollHeight - window.innerHeight)
      sceneStore.getState().patchScene({
        progress: Math.min(
          1,
          Math.max(0, (window.scrollY - article.offsetTop) / scrollRange),
        ),
      })
    }
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress)
    }

    updateProgress()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [root])

  const updateFilters = (
    patch: Partial<PackFilters>,
    options?: { readonly replace?: boolean },
  ) => {
    setSearchParams(
      serializeRegistryQuery({ ...filters, ...patch }),
      { replace: options?.replace ?? false },
    )
  }

  return (
    <article ref={root} className="route-page route-page--registry">
      <section className="registry-hero" data-reveal>
        <div className="registry-hero__content">
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h1>Registry</h1>
          <p className="route-lede">{copy.heroLede}</p>
          <p className="registry-hero__note">{copy.heroNote}</p>
          <a className="registry-hero__jump" href="#registry-results">
            <ArrowDown aria-hidden="true" />
            {repositoryData.packs.length} Packs
          </a>
        </div>
        <dl className="registry-hero__facts" data-reveal-item>
          <div>
            <dt><Boxes aria-hidden="true" />Official Packs</dt>
            <dd>{repositoryData.packs.length}</dd>
          </div>
          <div>
            <dt><Network aria-hidden="true" />Runtime adapters</dt>
            <dd>{repositoryData.targets.length}</dd>
          </div>
        </dl>
      </section>
      <section
        className="registry-catalog"
        data-reveal
        id="registry-results"
      >
        <div className="registry-controls-wrap">
          <RegistryControls
            filters={filters}
            onChange={updateFilters}
            onReset={() => setSearchParams(new URLSearchParams())}
          />
        </div>
        <RegistryResults packs={results} />
      </section>
    </article>
  )
}

export { RegistryPage as Component }
