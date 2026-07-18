import {
  BadgeCheck,
  ChevronDown,
  Fingerprint,
  KeyRound,
  PackageCheck,
  ShieldAlert,
} from 'lucide-react'

import type { SiteLocale, SitePack, TargetPreview } from '../../data/types'
import { packDetailCopy } from './packDetailCopy'

function LayerHeader({
  index,
  title,
  layerLabel,
  icon: Icon,
}: {
  readonly index: string
  readonly title: string
  readonly layerLabel: string
  readonly icon: typeof PackageCheck
}) {
  return (
    <header className="passport-band__header">
      <p className="eyebrow">{index} / {layerLabel}</p>
      <div>
        <Icon aria-hidden="true" />
        <h2>{title}</h2>
      </div>
    </header>
  )
}

export function PassportFacts({
  pack,
  preview,
  locale,
}: {
  readonly pack: SitePack
  readonly preview: TargetPreview
  readonly locale: SiteLocale
}) {
  const copy = packDetailCopy[locale]

  return (
    <>
      <section
        aria-label={copy.manifest}
        className="passport-band"
        data-passport-layer="manifest"
        data-reveal
      >
        <div className="pack-detail__inner passport-band__layout">
          <LayerHeader
            icon={PackageCheck}
            index="01"
            layerLabel={copy.passportLayer}
            title={copy.manifest}
          />
          <dl className="passport-facts">
            <div data-reveal-item>
              <dt>{copy.publisher}</dt>
              <dd>
                <BadgeCheck aria-hidden="true" />
                <span>{pack.publisher.id}</span>
                <small>{copy.verifiedPublisher}</small>
              </dd>
            </div>
            <div data-reveal-item>
              <dt>{copy.declaredRisk}</dt>
              <dd><span>{pack.declaredRisk}</span></dd>
            </div>
            <div data-reveal-item>
              <dt>{copy.version}</dt>
              <dd><span>{pack.version}</span></dd>
            </div>
            <div data-reveal-item>
              <dt>{copy.license}</dt>
              <dd><span>{pack.license}</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section
        aria-label={copy.permissions}
        className="passport-band passport-band--graphite"
        data-passport-layer="permissions"
        data-reveal
      >
        <div className="pack-detail__inner passport-band__layout">
          <LayerHeader
            icon={KeyRound}
            index="02"
            layerLabel={copy.passportLayer}
            title={copy.permissions}
          />
          <dl className="permission-list">
            {Object.entries(pack.permissions).map(([permission, level]) => (
              <div data-level={level} data-reveal-item key={permission}>
                <dt>{copy.permissionLabels[permission]}</dt>
                <dd>{copy.permissionValues[level]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-label={copy.risk}
        className="passport-band passport-band--risk"
        data-passport-layer="risk"
        data-reveal
      >
        <div className="pack-detail__inner passport-band__layout">
          <LayerHeader
            icon={ShieldAlert}
            index="03"
            layerLabel={copy.passportLayer}
            title={copy.risk}
          />
          <div className="risk-evidence">
            <div className="risk-evidence__score" data-reveal-item>
              <span>{copy.computedRisk}</span>
              <strong>{pack.passport.computedRisk}</strong>
            </div>
            <div className="risk-evidence__rows">
              {pack.passport.riskReasons.map((reason) => (
                <details data-reveal-item key={reason}>
                  <summary>
                    <span>{reason}</span>
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <p><strong>{copy.evidence}:</strong> {copy.evidenceDetail}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label={copy.provenance}
        className="passport-band passport-band--paper"
        data-passport-layer="provenance"
        data-reveal
      >
        <div className="pack-detail__inner passport-band__layout">
          <LayerHeader
            icon={Fingerprint}
            index="04"
            layerLabel={copy.passportLayer}
            title={copy.provenance}
          />
          <dl className="provenance-grid">
            <div data-reveal-item>
              <dt>{copy.quality}</dt>
              <dd>{pack.passport.qualityScore} / 100</dd>
            </div>
            <div data-reveal-item>
              <dt>{copy.checksumStatus}</dt>
              <dd>{preview.checksumStatus ?? 'not-calculated'}</dd>
            </div>
            <div data-reveal-item>
              <dt>{copy.audit}</dt>
              <dd>{pack.passport.audit.status}</dd>
              <small>{pack.passport.audit.reason}</small>
            </div>
            <div className="provenance-grid__checksum" data-reveal-item>
              <dt>SHA-256</dt>
              <dd className="checksum-value">
                {preview.checksum ?? 'Checksum unavailable'}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  )
}
