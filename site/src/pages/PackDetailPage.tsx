import { useEffect, type RefObject } from 'react'
import { ArrowLeft, BadgeCheck, ScanLine } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useSectionTimeline } from '../animation/useSectionTimeline'
import { Status } from '../components/Status'
import { repositoryData } from '../data/repositoryData'
import { sceneStore } from '../experience/sceneStore'
import { packDetailCopy } from '../features/pack-detail/packDetailCopy'
import { createPackDetailModel } from '../features/pack-detail/packDetailModel'
import { PassportFacts } from '../features/pack-detail/PassportFacts'
import { PreviewWrites } from '../features/pack-detail/PreviewWrites'
import { TargetSelector } from '../features/pack-detail/TargetSelector'
import { VerificationCommand } from '../features/pack-detail/VerificationCommand'
import '../features/pack-detail/pack-detail.css'
import { useLanguage } from '../i18n/useLanguage'

function usePackDetailSceneSync(
  root: RefObject<HTMLElement | null>,
  targetId: ReturnType<typeof createPackDetailModel>['targetId'] | undefined,
) {
  useEffect(() => {
    let frame = 0

    const updateScene = () => {
      frame = 0
      const article = root.current
      const active = sceneStore.getState().active

      if (!article || active.scene !== 'pack-detail' || !targetId) return

      const scrollRange = Math.max(1, article.scrollHeight - window.innerHeight)
      const progress = Math.min(
        1,
        Math.max(0, (window.scrollY - article.offsetTop) / scrollRange),
      )
      const layers = [...article.querySelectorAll<HTMLElement>('[data-passport-layer]')]
      const activeLayer = layers.sort(
        (left, right) =>
          Math.abs(left.getBoundingClientRect().top - window.innerHeight * 0.38) -
          Math.abs(right.getBoundingClientRect().top - window.innerHeight * 0.38),
      )[0]?.dataset.passportLayer

      sceneStore.getState().patchScene({
        layer: activeLayer ?? 'manifest',
        progress,
        targetId,
      })
    }

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateScene)
    }

    scheduleUpdate()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [root, targetId])
}

export function PackDetailPage() {
  const { packId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { locale, siteLocale } = useLanguage()
  const root = useSectionTimeline<HTMLElement>()
  const packExists = repositoryData.packs.some((pack) => pack.id === packId)
  const detail = packExists
    ? createPackDetailModel(
        repositoryData.packs,
        packId,
        searchParams.get('target'),
      )
    : undefined
  usePackDetailSceneSync(root, detail?.targetId)

  const copy = packDetailCopy[siteLocale]

  if (!detail) {
    return (
      <article ref={root} className="route-page route-error">
        <section className="route-hero route-hero--compact">
          <p className="eyebrow">Packsmith / Registry</p>
          <h1>Pack not found</h1>
          <p className="route-lede">
            The requested Pack is not present in this Registry build.
          </p>
          <Link className="text-link text-link--back" to="/registry">
            <ArrowLeft aria-hidden="true" />
            {copy.back}
          </Link>
        </section>
      </article>
    )
  }

  const { pack, preview, targetId, installCommand } = detail
  const localized = pack.localizations[locale] ?? pack.localizations.en
  const target = repositoryData.targets.find(({ id }) => id === targetId)

  return (
    <article ref={root} className="route-page route-page--pack-detail">
      <section className="pack-detail-hero" data-reveal>
        <div className="pack-detail-hero__content">
          <Link className="text-link text-link--back" to="/registry">
            <ArrowLeft aria-hidden="true" />
            {copy.back}
          </Link>
          <p className="eyebrow">
            {pack.category} / v{pack.version}
          </p>
          <h1>{localized?.name ?? pack.name}</h1>
          <p className="route-lede">
            {localized?.description ?? pack.description}
          </p>
          <div className="pack-detail-hero__proof" data-reveal-item>
            <Status tone={pack.verified ? 'success' : 'warning'}>
              <BadgeCheck aria-hidden="true" />
              {pack.verified ? copy.verifiedPassport : copy.unverifiedPassport}
            </Status>
            <span>{copy.quality} {pack.passport.qualityScore}/100</span>
            <span>{target?.name ?? targetId}</span>
          </div>
        </div>
        <div className="passport-live" data-reveal-item role="status">
          <ScanLine aria-hidden="true" />
          <span>{copy.passportLive}</span>
          <strong>{pack.passport.checksumStatus}</strong>
          <small>{pack.passport.checksum.slice(0, 18)}...</small>
        </div>
      </section>

      <TargetSelector
        locale={siteLocale}
        pack={pack}
        selectedTargetId={targetId}
        targets={repositoryData.targets}
      />
      <PassportFacts locale={siteLocale} pack={pack} preview={preview} />
      <PreviewWrites locale={siteLocale} preview={preview} />
      <VerificationCommand command={installCommand} locale={siteLocale} />
    </article>
  )
}

export { PackDetailPage as Component }
