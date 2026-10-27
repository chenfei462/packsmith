import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import type { PerformanceTier } from '../types'
import {
  createFrameGovernorState,
  reduceFrameSample,
} from './frameGovernorState'

type GovernedTier = Exclude<PerformanceTier, 'fallback'>

export function FrameGovernor({
  tier,
  onTierChange,
}: {
  readonly tier: GovernedTier
  readonly onTierChange: (tier: GovernedTier) => void
}) {
  const governor = useRef(createFrameGovernorState(tier))

  useFrame((_state, delta) => {
    const next = reduceFrameSample(governor.current, delta * 1000)

    if (next.tier !== governor.current.tier) {
      onTierChange(next.tier)
    }

    governor.current = next
  })

  return null
}
