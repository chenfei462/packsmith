import { createContext } from 'react'

import type { PerformanceConfig, PerformanceTier } from './types'

export interface ExperienceContextValue {
  readonly config: PerformanceConfig
  readonly rendererEpoch: number
  readonly reducedMotion: boolean
  readonly lowerTier: (tier: Exclude<PerformanceTier, 'fallback'>) => void
  readonly handleContextLoss: () => void
}

export const ExperienceContext =
  createContext<ExperienceContextValue | null>(null)
