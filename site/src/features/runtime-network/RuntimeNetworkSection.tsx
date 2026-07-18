import { Boxes, Check } from 'lucide-react'

import { repositoryData } from '../../data/repositoryData'
import type { SitePack } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { homeCopy } from '../home/homeCopy'

export function RuntimeNetworkSection({ pack }: { readonly pack: SitePack }) {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]

  return (
    <section
      className="home-section home-section--network"
      data-home-section="runtimes"
      data-reveal
      id="runtime-network"
    >
      <div className="home-section__inner">
        <header className="home-section__header">
          <p className="eyebrow">{copy.runtimeEyebrow}</p>
          <h2>{copy.runtimeTitle}</h2>
        </header>
        <div className="runtime-network">
          <div className="runtime-network__source">
            <Boxes aria-hidden="true" />
            <strong>{pack.name}</strong>
            <span>Canonical Pack</span>
          </div>
          <ul className="runtime-network__targets">
            {repositoryData.targets.map((target, index) => (
              <li key={target.id} style={{ '--runtime-index': index } as React.CSSProperties}>
                <Check aria-hidden="true" />
                <strong>{target.name}</strong>
                <span>{pack.previews[target.id].scope}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
