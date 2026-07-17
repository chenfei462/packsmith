import { describe, expect, it } from 'vitest'

import { derivePerformanceTier } from './derivePerformanceTier'

const highEndDevice = {
  width: 1440,
  coarsePointer: false,
  saveData: false,
  hardwareConcurrency: 12,
  deviceMemory: 16,
  reducedMotion: false,
  webgl: true,
}

describe('derivePerformanceTier', () => {
  it('selects a high tier only for capable fine-pointer devices', () => {
    expect(derivePerformanceTier(highEndDevice)).toEqual({
      tier: 'high',
      dpr: 2,
      particles: 160,
      shadows: 1024,
      postprocessing: true,
      continuous: true,
    })
  })

  it('selects balanced for capable mid-size devices', () => {
    expect(
      derivePerformanceTier({
        ...highEndDevice,
        width: 900,
        hardwareConcurrency: 6,
        deviceMemory: 6,
      }).tier,
    ).toBe('balanced')
  })

  it.each([
    { width: 480 },
    { coarsePointer: true },
    { saveData: true },
    { hardwareConcurrency: 4 },
    { deviceMemory: 4 },
  ])('selects low for constrained input %o', (constraint) => {
    expect(derivePerformanceTier({ ...highEndDevice, ...constraint }).tier).toBe(
      'low',
    )
  })

  it('preserves a static 3D composition for reduced motion', () => {
    expect(
      derivePerformanceTier({ ...highEndDevice, reducedMotion: true }),
    ).toMatchObject({
      tier: 'high',
      particles: 0,
      continuous: false,
    })
  })

  it('uses the route fallback when WebGL is unavailable', () => {
    expect(derivePerformanceTier({ ...highEndDevice, webgl: false })).toEqual({
      tier: 'fallback',
      dpr: 1,
      particles: 0,
      shadows: false,
      postprocessing: false,
      continuous: false,
    })
  })
})
