import { ArrowUpRight, BookOpen, Boxes, Terminal } from 'lucide-react'
import { Link } from 'react-router-dom'

import { buildInstallCommand } from '../../data/commands'
import type { SitePack } from '../../data/types'
import { useLanguage } from '../../i18n/useLanguage'
import { homeCopy } from '../home/homeCopy'

export function InstallSection({ pack }: { readonly pack: SitePack }) {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]
  const command = buildInstallCommand(pack, 'codex')

  return (
    <section
      className="home-section home-section--install"
      data-home-section="install"
      data-reveal
      id="install-command"
    >
      <div className="home-section__inner install-layout">
        <div>
          <p className="eyebrow">{copy.installEyebrow}</p>
          <h2>{copy.installTitle}</h2>
          <p>{copy.installBody}</p>
        </div>
        <div className="install-command-panel">
          <Terminal aria-hidden="true" />
          <pre>
            <code>{command}</code>
          </pre>
        </div>
        <div
          className="install-links"
          role="group"
          aria-label="Install next steps"
        >
          <Link to="/registry">
            <Boxes aria-hidden="true" />
            Registry
          </Link>
          <Link to="/docs">
            <BookOpen aria-hidden="true" />
            Documentation
          </Link>
          <a
            href="https://github.com/chenfei462/packsmith"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
