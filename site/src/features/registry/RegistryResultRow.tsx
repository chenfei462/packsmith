import { ArrowUpRight, Boxes, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { SitePack } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { registryCopy } from './registryCopy'

export function RegistryResultRow({
  index,
  onActive,
  onPointerLeave,
  pack,
}: {
  readonly index: number
  readonly onActive: (packId: string) => void
  readonly onPointerLeave: (packId: string, row: HTMLLIElement) => void
  readonly pack: SitePack
}) {
  const { locale, siteLocale } = useLanguage()
  const copy = registryCopy[siteLocale]
  const localized = pack.localizations[locale]
  const name = localized?.name ?? pack.name
  const description = localized?.description ?? pack.description

  return (
    <li
      className="registry-result-row"
      data-testid="registry-result"
      data-pack-id={pack.id}
      data-reveal-item
      onFocus={() => onActive(pack.id)}
      onPointerEnter={() => onActive(pack.id)}
      onPointerLeave={(event) => onPointerLeave(pack.id, event.currentTarget)}
    >
      <span className="registry-result-row__index">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="registry-result-row__identity">
        <strong>{name}</strong>
        <span>{description}</span>
      </div>
      <span className="registry-result-row__category">{pack.category}</span>
      <span className={`registry-risk registry-risk--${pack.passport.computedRisk}`}>
        <ShieldCheck aria-hidden="true" size={15} />
        {pack.passport.computedRisk}
      </span>
      <span className="registry-quality">
        <span
          aria-hidden="true"
          style={{ '--quality': `${pack.passport.qualityScore}%` } as React.CSSProperties}
        />
        {pack.passport.qualityScore}
      </span>
      <span className="registry-target-count">
        <Boxes aria-hidden="true" size={15} />
        {pack.targetIds.length}
      </span>
      <Link
        className="registry-result-row__link"
        to={`/registry/${encodeURIComponent(pack.id)}`}
        aria-label={`${copy.openPassport}: ${name}`}
      >
        {copy.openPassport}
        <ArrowUpRight aria-hidden="true" size={17} />
      </Link>
    </li>
  )
}
