import { ArrowUpRight, ChevronsDown, Play } from 'lucide-react'

import { useLanguage } from '../../i18n/useLanguage'
import { homeCopy } from '../home/homeCopy'

export function HeroSection() {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]

  return (
    <section
      className="home-hero"
      data-home-section="hero"
      data-reveal
      id="home-hero"
    >
      <div className="home-section__inner home-hero__content">
        <p className="eyebrow">{copy.heroEyebrow}</p>
        <h1>{copy.heroTitle}</h1>
        <p className="route-lede">{copy.heroPromise}</p>
        <div className="hero-actions">
          <a className="primary-action" href="#guided-demo">
            <Play aria-hidden="true" size={18} />
            {copy.startDemo}
          </a>
          <a
            className="text-link"
            href="https://github.com/chenfei462/packsmith"
            target="_blank"
            rel="noreferrer"
          >
            {copy.viewGitHub}
            <ArrowUpRight aria-hidden="true" size={18} />
          </a>
        </div>
        <a className="hero-skip-install" href="#install-command">
          <ChevronsDown aria-hidden="true" size={17} />
          {copy.skipInstall}
        </a>
      </div>
    </section>
  )
}
