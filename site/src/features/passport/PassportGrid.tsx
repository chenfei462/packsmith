import { BadgeCheck, FileCheck2, Gauge, ShieldCheck } from 'lucide-react'

import type { SitePack } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { homeCopy } from '../home/homeCopy'

export function PassportGrid({ pack }: { readonly pack: SitePack }) {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]

  return (
    <section
      className="home-section home-section--passport"
      data-home-section="passport"
      data-reveal
      id="passport"
    >
      <div className="home-section__inner">
        <header className="home-section__header">
          <p className="eyebrow">{copy.passportEyebrow}</p>
          <h2>{copy.passportTitle}</h2>
          <p>{copy.passportBody}</p>
        </header>

        <div className="passport-grid">
          <article className="passport-fact">
            <BadgeCheck aria-hidden="true" />
            <h3>Publisher</h3>
            <p>
              {pack.publisher.id} / {pack.publisher.verified ? 'verified' : 'unverified'}
            </p>
          </article>
          <article className="passport-fact passport-fact--risk">
            <ShieldCheck aria-hidden="true" />
            <h3>Risk</h3>
            <p>Declared risk: {pack.declaredRisk}</p>
            <p>Computed risk: {pack.passport.computedRisk}</p>
            <ul>
              {pack.passport.riskReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>
          <article className="passport-fact passport-fact--permissions">
            <FileCheck2 aria-hidden="true" />
            <h3>Permissions</h3>
            <p>Shell: {pack.permissions.shell}</p>
            <p>Filesystem: {pack.permissions.filesystem}</p>
            <p>Network: {pack.permissions.network}</p>
            <p>Browser: {pack.permissions.browser}</p>
          </article>
          <article className="passport-fact">
            <Gauge aria-hidden="true" />
            <h3>Quality</h3>
            <p>Quality score: {pack.passport.qualityScore} / 100</p>
            <p>Context pressure: {pack.passport.context.tokenPressure}</p>
          </article>
          <article className="passport-fact passport-fact--checksum">
            <h3>Provenance</h3>
            <p>Checksum status: {pack.passport.checksumStatus}</p>
            <code>{pack.passport.checksum}</code>
          </article>
          <article className="passport-fact passport-fact--audit">
            <h3>Audit</h3>
            <p>
              Preview only: {pack.passport.audit.reason}
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
