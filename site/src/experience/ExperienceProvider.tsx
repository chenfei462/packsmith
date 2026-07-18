import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

import { repositoryData } from '../data/repositoryData'
import { ExperienceContext } from './ExperienceContext'
import { contextLossAction } from './lifecycle/useContextRecovery'
import { useVisibilityPause } from './lifecycle/useVisibilityPause'
import {
  derivePerformanceTier,
  performanceConfigForTier,
  type PerformanceInputs,
} from './performance/derivePerformanceTier'
import { sceneStore } from './sceneStore'
import type {
  PerformanceConfig,
  PerformanceTier,
  RouteSceneInput,
} from './types'

type NavigatorWithHints = Navigator & {
  readonly connection?: { readonly saveData?: boolean }
  readonly deviceMemory?: number
}

const tierRank: Readonly<Record<PerformanceTier, number>> = {
  fallback: 0,
  low: 1,
  balanced: 2,
  high: 3,
}

function supportsWebGl(): boolean {
  if (
    typeof window === 'undefined' ||
    /jsdom/i.test(window.navigator.userAgent) ||
    (!('WebGLRenderingContext' in window) &&
      !('WebGL2RenderingContext' in window))
  ) {
    return false
  }

  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function readPerformanceInputs(): PerformanceInputs {
  const navigatorWithHints = navigator as NavigatorWithHints

  return {
    width: window.innerWidth,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    saveData: navigatorWithHints.connection?.saveData ?? false,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigatorWithHints.deviceMemory,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl: supportsWebGl(),
  }
}

function decodePackId(pathSegment: string): string {
  try {
    return decodeURIComponent(pathSegment)
  } catch {
    return pathSegment
  }
}

function routeSceneForPath(pathname: string): RouteSceneInput {
  if (pathname === '/docs' || pathname.startsWith('/docs/')) {
    return { scene: 'docs', topic: 'overview', progress: 0 }
  }

  if (pathname === '/registry') {
    return {
      scene: 'registry',
      packIds: repositoryData.packs.map((pack) => pack.id),
      progress: 0,
    }
  }

  if (pathname.startsWith('/registry/')) {
    return {
      scene: 'pack-detail',
      packId: decodePackId(pathname.slice('/registry/'.length)),
      layer: 'overview',
      progress: 0,
    }
  }

  return {
    scene: 'home',
    section: 'hero',
    packId: 'senior-code-reviewer',
    targetId: 'codex',
    demoStep: 0,
    progress: 0,
  }
}

export function ExperienceProvider({
  children,
}: {
  readonly children: ReactNode
}) {
  const { pathname } = useLocation()
  const [initialInputs] = useState(readPerformanceInputs)
  const [config, setConfig] = useState<PerformanceConfig>(() =>
    derivePerformanceTier(initialInputs),
  )
  const [rendererEpoch, setRendererEpoch] = useState(0)
  const contextLosses = useRef(0)

  useVisibilityPause()

  useEffect(() => {
    sceneStore.getState().setScene(routeSceneForPath(pathname))
  }, [pathname])

  const lowerTier = useCallback(
    (nextTier: Exclude<PerformanceTier, 'fallback'>) => {
      setConfig((current) =>
        tierRank[nextTier] < tierRank[current.tier]
          ? performanceConfigForTier(nextTier, initialInputs.reducedMotion)
          : current,
      )
    },
    [initialInputs.reducedMotion],
  )

  const handleContextLoss = useCallback(() => {
    const action = contextLossAction(contextLosses.current)
    contextLosses.current += 1
    sceneStore.getState().recordContextLoss()

    if (action === 'recover') {
      setRendererEpoch((current) => current + 1)
      return
    }

    setConfig(performanceConfigForTier('fallback'))
  }, [])

  const value = useMemo(
    () => ({
      config,
      rendererEpoch,
      reducedMotion: initialInputs.reducedMotion,
      lowerTier,
      handleContextLoss,
    }),
    [
      config,
      handleContextLoss,
      initialInputs.reducedMotion,
      lowerTier,
      rendererEpoch,
    ],
  )

  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  )
}
