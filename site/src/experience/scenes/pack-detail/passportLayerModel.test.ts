import { describe, expect, it } from 'vitest'

import {
  passportLayerModel,
  passportLayers,
  settlePassportMotion,
} from './passportLayerModel'

describe('exploded Passport layer model', () => {
  it.each([0, 0.5, 1])(
    'returns finite transforms at progress %s',
    (progress) => {
      passportLayers.forEach((layer) => {
        const transform = passportLayerModel(layer, progress)
        const values = [
          ...transform.position,
          ...transform.rotation,
          transform.scale,
          transform.opacity,
        ]

        expect(values.every(Number.isFinite)).toBe(true)
        expect(transform.scale).toBeGreaterThan(0)
        expect(transform.opacity).toBeGreaterThanOrEqual(0)
        expect(transform.opacity).toBeLessThanOrEqual(1)
      })
    },
  )

  it('separates every Passport layer at the inspection midpoint', () => {
    passportLayers.forEach((layer) => {
      const transform = passportLayerModel(layer, 0.5)

      expect(transform.position.some((value) => value !== 0)).toBe(true)
      expect(transform.rotation.some((value) => value !== 0)).toBe(true)
    })
  })

  it('fully reassembles every layer for the install section', () => {
    passportLayers.forEach((layer) => {
      expect(passportLayerModel(layer, 1)).toEqual({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
        opacity: 1,
      })
    })
  })

  it('snaps to stable transforms when reduced motion is requested', () => {
    expect(settlePassportMotion(0, 3.2, 1 / 60, true)).toBe(3.2)
    expect(settlePassportMotion(-1.4, 0, 1 / 60, true)).toBe(0)
  })

  it('smoothly approaches transforms during full motion', () => {
    const next = settlePassportMotion(0, 3.2, 1 / 60, false)

    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(3.2)
  })
})
