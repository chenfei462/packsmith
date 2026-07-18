import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'

import { PackArtifact } from './primitives/PackArtifact'
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

const DocsScene = lazy(() =>
  import('./scenes/docs/DocsScene').then((module) => ({
    default: module.DocsScene,
  })),
)

function sceneKey(scene: RouteSceneInput): string {
  return scene.scene === 'pack-detail'
    ? `${scene.scene}:${scene.packId}`
    : scene.scene
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
    return <DocsScene scene={input} opacity={opacity} />
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
