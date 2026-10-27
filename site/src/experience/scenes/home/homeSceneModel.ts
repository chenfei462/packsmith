export type Point = [number, number, number]

export interface HomeFragment {
  readonly assembled: Point
  readonly rotation: Point
  readonly scale: number
  readonly scatter: Point
}

export const homeFragmentCount = 72

function hashPackId(packId: string): number {
  let hash = 2166136261

  for (const character of packId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function createRandom(seed: number) {
  let state = seed || 1

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function createFragmentLayout(packId: string): readonly HomeFragment[] {
  const random = createRandom(hashPackId(packId))

  return Array.from({ length: homeFragmentCount }, (_, index) => {
    const column = index % 6
    const row = Math.floor(index / 6) % 4
    const layer = Math.floor(index / 24)

    return {
      assembled: [
        (column - 2.5) * 0.39,
        (row - 1.5) * 0.39,
        (layer - 1) * 0.42,
      ],
      rotation: [random() * 5, random() * 5, random() * 5],
      scale: 0.62 + random() * 0.54,
      scatter: [
        (random() - 0.5) * 12,
        (random() - 0.5) * 7.5,
        (random() - 0.5) * 5 - 1.5,
      ],
    }
  })
}
