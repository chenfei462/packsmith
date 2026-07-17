import type { PerformanceTier } from '../types'

type GovernedTier = Exclude<PerformanceTier, 'fallback'>

export interface FrameGovernorState {
  readonly tier: GovernedTier
  readonly samples: readonly number[]
}

const sampleWindow = 120
const slowFrameThreshold = 24

export function createFrameGovernorState(
  tier: GovernedTier,
): FrameGovernorState {
  return { tier, samples: [] }
}

function lowerTier(tier: GovernedTier): GovernedTier {
  if (tier === 'high') {
    return 'balanced'
  }

  return 'low'
}

export function reduceFrameSample(
  state: FrameGovernorState,
  milliseconds: number,
): FrameGovernorState {
  const samples = [...state.samples, milliseconds]

  if (samples.length < sampleWindow) {
    return { ...state, samples }
  }

  const sorted = [...samples].sort((left, right) => left - right)
  const percentileIndex = Math.ceil(sorted.length * 0.95) - 1

  if (sorted[percentileIndex] > slowFrameThreshold) {
    return { tier: lowerTier(state.tier), samples: [] }
  }

  return { ...state, samples: samples.slice(1) }
}
