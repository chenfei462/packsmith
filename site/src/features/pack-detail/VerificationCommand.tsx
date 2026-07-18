import { useState } from 'react'
import { BookOpen, Boxes, Check, Copy, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

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
  const [copied, setCopied] = useState(false)

  const copyInstallCommand = async () => {
    if (!command || !navigator.clipboard) return
    await navigator.clipboard.writeText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

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
          <div className="pack-install__command" data-reveal-item>
            <code>{command}</code>
            <button
              aria-label={copied ? copy.copied : copy.copyCommand}
              onClick={copyInstallCommand}
              title={copy.copyCommand}
              type="button"
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </button>
          </div>
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
        <p aria-live="polite" className="sr-only" role="status">
          {copied ? copy.copied : ''}
        </p>
      </div>
    </section>
  )
}
