import { useEffect, type RefObject } from 'react'
import {
  Building2,
  Files,
  KeyRound,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import { useSectionTimeline } from '../animation/useSectionTimeline'
import { repositoryData } from '../data/repositoryData'
import { getPackById } from '../data/selectors'
import { sceneStore } from '../experience/sceneStore'
import { DemoSequence } from '../features/demo/DemoSequence'
import { homeCopy, homeDetails } from '../features/home/homeCopy'
import '../features/home/home.css'
import { HeroSection } from '../features/hero/HeroSection'
import { InstallSection } from '../features/install/InstallSection'
import { PassportGrid } from '../features/passport/PassportGrid'
import { ProofSection } from '../features/proof/ProofSection'
import { RuntimeNetworkSection } from '../features/runtime-network/RuntimeNetworkSection'
import { useLanguage } from '../i18n/useLanguage'

function useHomeSectionObserver(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const article = root.current

    if (!article || typeof window.IntersectionObserver === 'undefined') {
      return
    }

    const ratios = new Map<Element, number>()
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio))
        const activeEntry = [...ratios.entries()].sort(
          (left, right) => right[1] - left[1],
        )[0]

        if (!(activeEntry?.[0] instanceof HTMLElement) || activeEntry[1] <= 0) {
          return
        }

        const active = sceneStore.getState().active
        const scrollRange = Math.max(1, article.scrollHeight - window.innerHeight)
        const progress = Math.min(
          1,
          Math.max(0, (window.scrollY - article.offsetTop) / scrollRange),
        )

        if (active.scene === 'home') {
          sceneStore.getState().patchScene({
            progress,
            section: activeEntry[0].dataset.homeSection ?? 'hero',
          })
        }
      },
      { rootMargin: '-18% 0px -48%', threshold: [0.08, 0.25, 0.5, 0.75] },
    )

    article
      .querySelectorAll<HTMLElement>('[data-home-section]')
      .forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [root])
}

function PortabilitySection() {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]
  const details = homeDetails[siteLocale]
  const icons = [Files, ShieldAlert, RefreshCw] as const

  return (
    <section
      className="home-section home-section--portability"
      data-home-section="portability"
      data-reveal
    >
      <div className="home-section__inner portability-layout">
        <header className="home-section__header">
          <p className="eyebrow">{copy.portabilityEyebrow}</p>
          <h2>{copy.portabilityTitle}</h2>
          <p>{copy.portabilityBody}</p>
        </header>
        <ol className="portability-signals">
          {details.portabilitySignals.map(({ title, detail }, index) => {
            const Icon = icons[index]

            return (
              <li key={title} data-reveal-item>
                <span className="portability-signals__index">
                  0{index + 1}
                </span>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function GuidedDemoSection() {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]

  return (
    <section
      className="home-section home-section--demo"
      data-home-section="demo"
      data-reveal
      id="guided-demo"
    >
      <div className="home-section__inner">
        <header className="home-section__header">
          <p className="eyebrow">{copy.demoEyebrow}</p>
          <h2>{copy.demoTitle}</h2>
          <p>{copy.demoBody}</p>
        </header>
        <DemoSequence />
      </div>
    </section>
  )
}

function TeamSection() {
  const { siteLocale } = useLanguage()
  const copy = homeCopy[siteLocale]
  const details = homeDetails[siteLocale]
  const icons = [Building2, ShieldCheck, KeyRound, ScrollText] as const

  return (
    <section
      className="home-section home-section--team"
      data-home-section="team"
      data-reveal
      id="team-governance"
    >
      <div className="home-section__inner team-layout">
        <header className="home-section__header">
          <p className="eyebrow">{copy.teamEyebrow}</p>
          <h2>{copy.teamTitle}</h2>
          <p>{copy.teamBody}</p>
        </header>
        <ul className="team-capabilities">
          {details.teamCapabilities.map(({ name, detail }, index) => {
            const Icon = icons[index]

            return (
              <li key={name} data-reveal-item>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{name}</strong>
                  <span>{detail}</span>
                </div>
                <span className="planned-status">{details.planned}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export function HomePage() {
  const root = useSectionTimeline<HTMLElement>()
  useHomeSectionObserver(root)
  const featuredPack = getPackById(repositoryData.packs, 'senior-code-reviewer')

  if (!featuredPack) {
    throw new Error('Featured Pack "senior-code-reviewer" is missing.')
  }

  return (
    <article ref={root} className="route-page route-page--home">
      <HeroSection />
      <PortabilitySection />
      <GuidedDemoSection />
      <PassportGrid pack={featuredPack} />
      <RuntimeNetworkSection pack={featuredPack} />
      <ProofSection pack={featuredPack} />
      <TeamSection />
      <InstallSection pack={featuredPack} />
    </article>
  )
}

export { HomePage as Component }
