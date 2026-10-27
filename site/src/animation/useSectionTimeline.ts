import { useLayoutEffect, useRef, type RefObject } from 'react'

import { sceneStore } from '../experience/sceneStore'
import { setupGsap } from './gsap'

export function useSectionTimeline<T extends HTMLElement>(): RefObject<T | null> {
  const scope = useRef<T>(null)

  useLayoutEffect(() => {
    const root = scope.current

    if (
      !root ||
      typeof window.IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const { gsap, ScrollTrigger } = setupGsap()
    const context = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((section) => {
        const revealTargets = section.querySelectorAll<HTMLElement>(
          '.eyebrow, h1, h2, .route-lede, .home-section__header > p, [data-reveal-item]',
        )

        gsap.fromTo(
          revealTargets,
          { autoAlpha: 0, y: 34 },
          {
            autoAlpha: 1,
            duration: 0.85,
            ease: 'power3.out',
            stagger: 0.07,
            y: 0,
            scrollTrigger: {
              trigger: section,
              start: 'top 84%',
              toggleActions: 'play none none reverse',
            },
          },
        )
      })

      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: ({ progress }) => {
          if (sceneStore.getState().active.scene === 'home') {
            sceneStore.getState().patchScene({ progress })
          }
        },
      })
    }, root)

    return () => context.revert()
  }, [])

  return scope
}
