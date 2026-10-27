export type RegistryPoint = [number, number, number]

export interface RegistryLayoutItem {
  readonly id: string
  readonly position: RegistryPoint
  readonly rotation: RegistryPoint
  readonly scale: number
}

const goldenAngle = Math.PI * (3 - Math.sqrt(5))

function hashPackId(packId: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0

  for (const character of packId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function layoutRegistryPacks(
  packIds: readonly string[],
  seed: number,
): readonly RegistryLayoutItem[] {
  return packIds.map((id, index) => {
    const hash = hashPackId(id, seed)
    const jitter = ((hash & 0xffff) / 0xffff - 0.5) * 0.22
    const angle = index * goldenAngle + jitter
    const radius = 1.35 + Math.sqrt(index + 1) * 0.56
    const heightBand = ((hash >>> 16) % 9) - 4

    return {
      id,
      position: [
        Math.cos(angle) * radius,
        heightBand * 0.22 + Math.sin(index * 0.72) * 0.12,
        Math.sin(angle) * radius * 0.58 - Math.floor(index / 18) * 0.18,
      ],
      rotation: [
        ((hash >>> 5) % 11) * 0.035,
        ((hash >>> 11) % 31) * 0.08,
        ((hash >>> 19) % 9 - 4) * 0.035,
      ],
      scale: 0.64 + ((hash >>> 24) % 24) / 60,
    }
  })
}
