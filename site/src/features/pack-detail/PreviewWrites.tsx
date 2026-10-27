import { FileCheck2, TriangleAlert } from 'lucide-react'

import type { SiteLocale, TargetPreview } from '../../data/types'
import { packDetailCopy } from './packDetailCopy'

export function PreviewWrites({
  preview,
  locale,
}: {
  readonly preview: TargetPreview
  readonly locale: SiteLocale
}) {
  const copy = packDetailCopy[locale]
  const available = preview.status === 'preview-ready'

  return (
    <section
      aria-label={copy.writes}
      className="passport-band passport-writes"
      data-passport-layer="writes"
      data-reveal
    >
      <div className="pack-detail__inner">
        <header className="passport-band__header passport-writes__header">
          <p className="eyebrow">05 / {copy.passportLayer}</p>
          <div>
            <FileCheck2 aria-hidden="true" />
            <h2>{copy.writes}</h2>
          </div>
        </header>

        {available ? (
          <>
            <dl className="writes-summary" data-reveal-item>
              <div>
                <dt>{copy.installPath}</dt>
                <dd><code>{preview.installPathTemplate}</code></dd>
              </div>
              <div>
                <dt>{copy.plannedWrites}</dt>
                <dd>{preview.writes.length}</dd>
              </div>
            </dl>
            <table className="writes-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{copy.path}</th>
                </tr>
              </thead>
              <tbody>
                {preview.writes.map((path, index) => (
                  <tr data-reveal-item key={path}>
                    <th scope="row">{String(index + 1).padStart(2, '0')}</th>
                    <td><code>{path}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="writes-unavailable" data-reveal-item role="status">
            <TriangleAlert aria-hidden="true" />
            <div>
              <strong>{copy.notAvailable}</strong>
              <p>
                {preview.status === 'not-declared'
                  ? copy.notDeclared
                  : preview.reason ?? copy.notReady}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
