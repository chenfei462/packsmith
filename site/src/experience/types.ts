import type { RuntimeId } from '../data/types'

export type RouteSceneInput =
  | {
      readonly scene: 'home'
      readonly section: string
      readonly packId: string
      readonly targetId: RuntimeId
      readonly demoStep: number
      readonly progress: number
    }
  | {
      readonly scene: 'registry'
      readonly packIds: readonly string[]
      readonly focusedPackId?: string
      readonly progress: number
    }
  | {
      readonly scene: 'pack-detail'
      readonly packId: string
      readonly targetId?: RuntimeId
      readonly layer: string
      readonly progress: number
    }
  | {
      readonly scene: 'docs'
      readonly topic: string
      readonly progress: number
    }

export interface RouteScenePatch {
  readonly section?: string
  readonly packId?: string
  readonly targetId?: RuntimeId
  readonly demoStep?: number
  readonly packIds?: readonly string[]
  readonly focusedPackId?: string
  readonly layer?: string
  readonly topic?: string
  readonly progress?: number
}

export type PerformanceTier = 'high' | 'balanced' | 'low' | 'fallback'

export interface PerformanceConfig {
  readonly tier: PerformanceTier
  readonly dpr: number
  readonly particles: number
  readonly shadows: false | 512 | 1024
  readonly postprocessing: boolean
  readonly continuous: boolean
}
