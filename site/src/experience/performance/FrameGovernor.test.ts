import { describe, expect, it } from 'vitest'

import {
  createFrameGovernorState,
  reduceFrameSample,
} from './frameGovernorState'

function sampleFrames(
  state: ReturnType<typeof createFrameGovernorState>,
  milliseconds: number,
  count = 120,
) {
  let current = state

  for (let index = 0; index < count; index += 1) {
    current = reduceFrameSample(current, milliseconds)
  }

  return current
}

describe('FrameGovernor sample reducer', () => {
  it('lowers one tier when the 120-frame p95 exceeds 24ms', () => {
    const result = sampleFrames(createFrameGovernorState('high'), 30)

    expect(result.tier).toBe('balanced')
    expect(result.samples).toEqual([])
  })

  it('never promotes during the same session', () => {
    const lowered = sampleFrames(createFrameGovernorState('high'), 30)
    const recovered = sampleFrames(lowered, 8)

    expect(recovered.tier).toBe('balanced')
  })

  it('never lowers past the low tier', () => {
    const result = sampleFrames(createFrameGovernorState('low'), 40)

    expect(result.tier).toBe('low')
  })
})
