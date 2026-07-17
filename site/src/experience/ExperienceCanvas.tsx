import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Canvas, useThree } from '@react-three/fiber'
import { useStore } from 'zustand'

import { FallbackStage } from './fallback/FallbackStage'
import { useContextRecovery } from './lifecycle/useContextRecovery'
import { FrameGovernor } from './performance/FrameGovernor'
import { sceneStore } from './sceneStore'
import { SceneDirector } from './SceneDirector'
import { useExperience } from './useExperience'

function ContextRecoveryBridge() {
  const canvas = useThree((state) => state.gl.domElement)
  const { handleContextLoss } = useExperience()

  useContextRecovery(canvas, handleContextLoss)
  return null
}

export function ExperienceCanvas() {
  const { config, rendererEpoch, lowerTier } = useExperience()
  const active = useStore(sceneStore, (state) => state.active)
  const paused = useStore(sceneStore, (state) => state.paused)

  if (config.tier === 'fallback') {
    return <FallbackStage scene={active} />
  }

  const eventSource = document.getElementById('root') ?? undefined
  const shadowMapSize = config.shadows || 512

  return (
    <div
      aria-hidden="true"
      className="experience-canvas"
      data-experience-tier={config.tier}
    >
      <Canvas
        key={rendererEpoch}
        aria-hidden="true"
        tabIndex={-1}
        camera={{ position: [0, 1.1, 10.5], fov: 46, near: 0.1, far: 80 }}
        dpr={config.dpr}
        eventSource={eventSource}
        eventPrefix="client"
        fallback={<FallbackStage scene={active} />}
        frameloop={paused ? 'never' : config.continuous ? 'always' : 'demand'}
        gl={{
          alpha: false,
          antialias: config.tier !== 'low',
          powerPreference: 'high-performance',
        }}
        shadows={config.shadows !== false}
      >
        <color attach="background" args={['#080a0e']} />
        <fog attach="fog" args={['#080a0e', 11, 28]} />
        <ambientLight intensity={0.7} color="#c9d2e7" />
        <directionalLight
          castShadow={config.shadows !== false}
          color="#edf1f7"
          intensity={2.2}
          position={[5, 7, 6]}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
        />
        <pointLight color="#2be4d0" intensity={18} position={[-5, 1, 3]} />
        <pointLight color="#ff6b2c" intensity={14} position={[5, -2, 2]} />
        <SceneDirector />
        <ContextRecoveryBridge />
        <FrameGovernor tier={config.tier} onTierChange={lowerTier} />
        {config.postprocessing ? (
          <EffectComposer multisampling={0}>
            <Bloom intensity={0.22} luminanceThreshold={0.82} mipmapBlur />
          </EffectComposer>
        ) : null}
      </Canvas>
    </div>
  )
}
