import { FileOutput, GitCommitHorizontal } from 'lucide-react'

import { repositoryData } from '../../data/repositoryData'
import type { SitePack } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { homeCopy } from '../home/homeCopy'

export function ProofSection({ pack }: { readonly pack: SitePack }) {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]
  const preview = pack.previews.codex

  return (
    <section
      className="home-section home-section--proof"
      data-home-section="proof"
      data-reveal
      id="proof"
    >
      <div className="home-section__inner proof-layout">
        <div>
          <p className="eyebrow">{copy.proofEyebrow}</p>
          <h2>{copy.proofTitle}</h2>
          <div className="proof-counts">
            <strong>{repositoryData.packs.length} official Packs</strong>
            <strong>{repositoryData.targets.length} supported runtimes</strong>
          </div>
          <div className="proof-write-plan">
            <p>
              <GitCommitHorizontal aria-hidden="true" />
              {preview.checksumStatus} / {preview.scope}
            </p>
            <ul>
              {preview.writes.slice(0, 4).map((writePath) => (
                <li key={writePath}>
                  <FileOutput aria-hidden="true" />
                  {writePath}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <img
          src={`${import.meta.env.BASE_URL}packsmith-demo.svg`}
          width="1080"
          height="620"
          alt="Packsmith Passport terminal showing six runtime install plans, checksum receipt, and tamper audit"
        />
      </div>
    </section>
  )
}
