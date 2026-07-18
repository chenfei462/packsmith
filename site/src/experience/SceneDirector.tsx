import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'

import { PackArtifact } from './primitives/PackArtifact'
import { ScanGrid } from './primitives/ScanGrid'
import { TrailPath } from './primitives/TrailPath'
import { sceneStore } from './sceneStore'
import type { RouteSceneInput } from './types'

const HomeScene = lazy(() =>
  import('./scenes/home/HomeScene').then((module) => ({
    default: module.HomeScene,
  })),
)

const RegistryScene = lazy(() =>
  import('./scenes/registry/RegistryScene').then((module) => ({
    default: module.RegistryScene,
  })),
)

const PackDetailScene = lazy(() =>
  import('./scenes/pack-detail/PackDetailScene').then((module) => ({
    default: module.PackDetailScene,
  })),
)

function sceneKey(scene: RouteSceneInput): string {
  return scene.scene === 'pack-detail'
    ? `${scene.scene}:${scene.packId}`
    : scene.scene
}

function DocsComposition({ opacity }: { readonly opacity: number }) {
  const stages: readonly [number, number, number][] = [
    [-4.2, -1.1, 0],
    [-2.5, -0.25, -0.4],
    [-0.8, 0.55, 0],
    [0.9, 1.2, -0.35],
    [2.6, 0.45, 0],
    [4.3, -0.5, -0.25],
  ]

  return (
    <group>
      <ScanGrid opacity={opacity * 0.25} />
      <TrailPath points={stages} color="#2be4d0" opacity={opacity} />
      {stages.map((position, index) => (
        <mesh key={index} position={position} rotation={[0.2, 0.35, 0]}>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial
            color={index === 2 ? '#ff6b2c' : '#c9d2e7'}
            emissive={index === 2 ? '#ff6b2c' : '#2be4d0'}
            emissiveIntensity={0.25}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  )
}

function SceneComposition({
  input,
  opacity,
}: {
  readonly input: RouteSceneInput
  readonly opacity: number
}) {
  if (input.scene === 'registry') {
    return <RegistryScene scene={input} opacity={opacity} />
  }

  if (input.scene === 'pack-detail') {
    return <PackDetailScene scene={input} opacity={opacity} />
  }

  if (input.scene === 'docs') {
    return <DocsComposition opacity={opacity} />
  }

  return <HomeScene opacity={opacity} />
}

export function SceneDirector() {
  const active = useStore(sceneStore, (state) => state.active)
  const outgoing = useStore(sceneStore, (state) => state.outgoing)
  const activeKey = sceneKey(active)

  useEffect(() => {
    sceneStore.getState().markIncomingReady()
    const timeout = window.setTimeout(
      () => sceneStore.getState().completeTransition(),
      560,
    )
    return () => window.clearTimeout(timeout)
  }, [activeKey])

  return (
    <Suspense fallback={<PackArtifact position={[2.8, 0, 0]} opacity={0.8} />}>
      {outgoing ? (
        <group key={`outgoing-${sceneKey(outgoing)}`}>
          <SceneComposition input={outgoing} opacity={0.2} />
        </group>
      ) : null}
      <group key={`active-${activeKey}`}>
        <SceneComposition input={active} opacity={1} />
      </group>
    </Suspense>
  )
}
