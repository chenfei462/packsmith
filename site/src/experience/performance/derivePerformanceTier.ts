import type {
  PerformanceConfig,
  PerformanceTier,
} from '../types'

export interface PerformanceInputs {
  readonly width: number
  readonly coarsePointer: boolean
  readonly saveData: boolean
  readonly hardwareConcurrency?: number
  readonly deviceMemory?: number
  readonly reducedMotion: boolean
  readonly webgl: boolean
}

const configs: Readonly<Record<PerformanceTier, PerformanceConfig>> = {
  high: {
    tier: 'high',
    dpr: 2,
    particles: 160,
    shadows: 1024,
    postprocessing: true,
    continuous: true,
  },
  balanced: {
    tier: 'balanced',
    dpr: 1.5,
    particles: 90,
    shadows: 512,
    postprocessing: true,
    continuous: true,
  },
  low: {
    tier: 'low',
    dpr: 1,
    particles: 32,
    shadows: false,
    postprocessing: false,
    continuous: true,
  },
  fallback: {
    tier: 'fallback',
    dpr: 1,
    particles: 0,
    shadows: false,
    postprocessing: false,
    continuous: false,
  },
}

export function performanceConfigForTier(
  tier: PerformanceTier,
  reducedMotion = false,
): PerformanceConfig {
  const config = configs[tier]

  return reducedMotion && tier !== 'fallback'
    ? { ...config, particles: 0, continuous: false }
    : config
}

export function derivePerformanceTier(
  inputs: PerformanceInputs,
): PerformanceConfig {
  if (!inputs.webgl) {
    return configs.fallback
  }

  const constrained =
    inputs.coarsePointer ||
    inputs.width < 640 ||
    inputs.saveData ||
    (inputs.hardwareConcurrency !== undefined &&
      inputs.hardwareConcurrency <= 4) ||
    (inputs.deviceMemory !== undefined && inputs.deviceMemory <= 4)
  const highEnd =
    !constrained &&
    inputs.width >= 1024 &&
    (inputs.hardwareConcurrency ?? 0) >= 8 &&
    (inputs.deviceMemory ?? 0) >= 8
  const tier: PerformanceTier = highEnd
    ? 'high'
    : constrained
      ? 'low'
      : 'balanced'

  return performanceConfigForTier(tier, inputs.reducedMotion)
}
