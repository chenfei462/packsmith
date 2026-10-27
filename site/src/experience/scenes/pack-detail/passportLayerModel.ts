export const passportLayers = [
  'manifest',
  'permissions',
  'risk',
  'provenance',
  'writes',
  'adapter',
] as const

export type PassportLayer = (typeof passportLayers)[number]

export interface PassportLayerTransform {
  readonly position: [number, number, number]
  readonly rotation: [number, number, number]
  readonly scale: number
  readonly opacity: number
}

export function settlePassportMotion(
  current: number,
  target: number,
  delta: number,
  reducedMotion: boolean,
  smoothing = 4.8,
): number {
  if (reducedMotion) return target

  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0
  return target + (current - target) * Math.exp(-smoothing * safeDelta)
}

const explodedTransforms: Readonly<
  Record<
    PassportLayer,
    {
      readonly position: readonly [number, number, number]
      readonly rotation: readonly [number, number, number]
      readonly scale: number
    }
  >
> = {
  manifest: {
    position: [-2.75, 1.35, 0.7],
    rotation: [-0.18, -0.32, -0.1],
    scale: 0.92,
  },
  permissions: {
    position: [-1.7, 0.65, 0.38],
    rotation: [0.12, -0.22, 0.08],
    scale: 0.96,
  },
  risk: {
    position: [-0.62, 0.18, 0.16],
    rotation: [-0.08, 0.16, -0.06],
    scale: 1.02,
  },
  provenance: {
    position: [0.68, -0.18, -0.08],
    rotation: [0.08, -0.14, 0.07],
    scale: 1.02,
  },
  writes: {
    position: [1.78, -0.72, -0.38],
    rotation: [-0.12, 0.24, -0.08],
    scale: 0.96,
  },
  adapter: {
    position: [2.85, -1.32, -0.72],
    rotation: [0.18, 0.36, 0.12],
    scale: 0.9,
  },
}

function inspectionProgress(progress: number): number {
  const safeProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0

  return safeProgress <= 0.5
    ? safeProgress * 2
    : (1 - safeProgress) * 2
}

export function passportLayerModel(
  layer: PassportLayer,
  progress: number,
): PassportLayerTransform {
  const inspection = inspectionProgress(progress)
  const exploded = explodedTransforms[layer]

  if (inspection === 0) {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      opacity: 1,
    }
  }

  return {
    position: exploded.position.map((value) => value * inspection) as [
      number,
      number,
      number,
    ],
    rotation: exploded.rotation.map((value) => value * inspection) as [
      number,
      number,
      number,
    ],
    scale: 1 + (exploded.scale - 1) * inspection,
    opacity: 1,
  }
}
