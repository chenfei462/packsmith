import { CircleCheck, CircleMinus } from 'lucide-react'
import { Link } from 'react-router-dom'

import type {
  RuntimeId,
  RuntimeTarget,
  SiteLocale,
  SitePack,
} from '../../data/types'
import { packDetailCopy } from './packDetailCopy'

export function TargetSelector({
  pack,
  targets,
  selectedTargetId,
  locale,
}: {
  readonly pack: SitePack
  readonly targets: readonly RuntimeTarget[]
  readonly selectedTargetId: RuntimeId
  readonly locale: SiteLocale
}) {
  const copy = packDetailCopy[locale]

  return (
    <section className="pack-targets" data-reveal>
      <div className="pack-detail__inner">
        <header className="pack-targets__header">
          <p className="eyebrow">{copy.runtimeEyebrow}</p>
          <h2>{copy.runtimeLabel}</h2>
        </header>
        <div
          aria-label={copy.runtimeLabel}
          className="target-segments"
          role="group"
        >
          {targets.map((target) => {
            const ready = pack.previews[target.id].status === 'preview-ready'
            const selected = target.id === selectedTargetId
            const Icon = ready ? CircleCheck : CircleMinus

            return (
              <Link
                aria-current={selected ? 'true' : undefined}
                className="target-segments__item"
                data-ready={ready ? 'true' : 'false'}
                data-reveal-item
                key={target.id}
                to={`?target=${target.id}`}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{target.name}</strong>
                  <small>{ready ? copy.ready : copy.unavailable}</small>
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
