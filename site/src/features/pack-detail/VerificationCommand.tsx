import { BookOpen, Boxes, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CommandCopy } from '../../components/CommandCopy'
import type { SiteLocale } from '../../data/types'
import { packDetailCopy } from './packDetailCopy'

export function VerificationCommand({
  command,
  locale,
}: {
  readonly command?: string
  readonly locale: SiteLocale
}) {
  const copy = packDetailCopy[locale]

  return (
    <section
      aria-label={copy.install}
      className="pack-install"
      data-install-section
      data-passport-layer="adapter"
      data-reveal
      id="install-verification"
    >
      <div className="pack-detail__inner pack-install__layout">
        <header>
          <p className="eyebrow">06 / {copy.verifyEyebrow}</p>
          <ShieldCheck aria-hidden="true" />
          <h2>{copy.install}</h2>
          <p>{command ? copy.verifyBeforeInstall : copy.noCommand}</p>
        </header>
        {command ? (
          <CommandCopy
            className="pack-install__command"
            command={command}
            copiedLabel={copy.copied}
            copyLabel={copy.copyCommand}
            fallbackLabel={copy.copyFallback}
            selectedCommandLabel={copy.selectedCommand}
          />
        ) : (
          <p className="pack-install__withheld" data-reveal-item>{copy.noCommand}</p>
        )}
        <div aria-label="Pack next steps" className="pack-install__next" role="group">
          <Link to="/registry">
            <Boxes aria-hidden="true" />
            {copy.browseRegistry}
          </Link>
          <Link to="/docs">
            <BookOpen aria-hidden="true" />
            {copy.readDocumentation}
          </Link>
        </div>
      </div>
    </section>
  )
}
