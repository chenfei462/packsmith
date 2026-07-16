import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Status } from '../components/Status'
import { repositoryData } from '../data/repositoryData'
import { getPackById } from '../data/selectors'
import { useLanguage } from '../i18n/useLanguage'

export function PackDetailPage() {
  const { packId = '' } = useParams()
  const { locale } = useLanguage()
  const pack = getPackById(repositoryData.packs, packId)

  if (!pack) {
    return (
      <article className="route-page">
        <section className="route-hero route-hero--compact">
          <p className="eyebrow">Registry / Unknown Pack</p>
          <h1>Pack not found</h1>
          <p className="route-lede">
            No exact Registry entry matches <code>{packId}</code>.
          </p>
          <Link className="text-link text-link--back" to="/registry">
            <ArrowLeft aria-hidden="true" />
            Back to Registry
          </Link>
        </section>
      </article>
    )
  }

  const localized = pack.localizations[locale] ?? pack.localizations.en

  return (
    <article className="route-page">
      <section className="route-hero route-hero--compact">
        <p className="eyebrow">
          {pack.category} / v{pack.version}
        </p>
        <h1>{localized?.name ?? pack.name}</h1>
        <p className="route-lede">{localized?.description ?? pack.description}</p>
        <div className="hero-proof">
          <Status tone={pack.verified ? 'success' : 'warning'}>
            {pack.verified ? 'Verified' : 'Unverified'}
          </Status>
          <span>Quality {pack.passport.qualityScore}/100</span>
          <span>Risk {pack.passport.computedRisk}</span>
        </div>
      </section>
    </article>
  )
}

export { PackDetailPage as Component }
