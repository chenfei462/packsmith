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

function sceneKey(scene: RouteSceneInput): string {
  return scene.scene === 'pack-detail'
    ? `${scene.scene}:${scene.packId}`
    : scene.scene
}

function stringSeed(value: string): number {
  return [...value].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    2166136261,
  )
}

function RegistryComposition({
  scene,
  opacity,
}: {
  readonly scene: Extract<RouteSceneInput, { scene: 'registry' }>
  readonly opacity: number
}) {
  return (
    <group rotation={[-0.12, 0.2, 0]}>
      <ScanGrid opacity={opacity * 0.45} />
      {scene.packIds.slice(0, 24).map((packId, index) => {
        const seed = stringSeed(packId)
        const column = index % 6
        const row = Math.floor(index / 6)
        const height = ((seed % 7) - 3) * 0.16
        const focused = packId === scene.focusedPackId

        return (
          <mesh
            key={packId}
            position={[
              (column - 2.5) * 1.35,
              height,
              (row - 1.5) * 1.35,
            ]}
            rotation={[0, (seed % 11) * 0.07, 0]}
            scale={focused ? 1.35 : 1}
            castShadow
          >
            <boxGeometry args={[0.82, 0.48, 0.82]} />
            <meshStandardMaterial
              color={focused ? '#ff6b2c' : '#26313a'}
              emissive={focused ? '#ff6b2c' : '#2be4d0'}
              emissiveIntensity={focused ? 0.42 : 0.08}
              metalness={0.55}
              roughness={0.32}
              transparent={opacity < 1}
              opacity={opacity}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function PackDetailComposition({ opacity }: { readonly opacity: number }) {
  return (
    <group position={[2.7, 0, -0.5]}>
      <PackArtifact position={[0, 0, 0]} scale={1.05} opacity={opacity} />
      {[-1, 0, 1].map((offset) => (
        <mesh key={offset} position={[offset * 1.45, offset * 0.3, offset * -0.55]}>
          <boxGeometry args={[1.15, 0.72, 0.08]} />
          <meshStandardMaterial
            color={offset === 0 ? '#c9d2e7' : '#1b2229'}
            emissive={offset === 0 ? '#2be4d0' : '#ff6b2c'}
            emissiveIntensity={0.18}
            transparent
            opacity={opacity * 0.78}
          />
        </mesh>
      ))}
      <TrailPath
        points={[
          [-4.8, -1.5, 0],
          [-2.6, -0.7, 0],
          [-1.2, 0, 0],
        ]}
        opacity={opacity}
      />
    </group>
  )
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
    return <RegistryComposition scene={input} opacity={opacity} />
  }

  if (input.scene === 'pack-detail') {
    return <PackDetailComposition opacity={opacity} />
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
