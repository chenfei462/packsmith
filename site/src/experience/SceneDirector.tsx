import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { useStore } from 'zustand'

import {
  completeSceneTransition,
  disposeSceneGraph,
  routeSceneKey,
  sceneDisposalRegistry,
} from './lifecycle/sceneLifecycle'
import { PackArtifact, type PackArtifactProps } from './primitives/PackArtifact'
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

function artifactVariant(scene: RouteSceneInput): PackArtifactProps {
  if (scene.scene === 'registry') {
    return {
      position: [2.2, 0.15, -1.15],
      rotation: [0.08, -0.2, 0.08],
      scale: 0.38,
      accent: '#ff6b2c',
      opacity: 0.1,
    }
  }

  if (scene.scene === 'pack-detail') {
    return {
      position: [2.4, 0, -0.85],
      rotation: [0.16, -0.34, 0],
      scale: 0.5,
      accent: '#f0b94f',
      opacity: 0.1,
    }
  }

  if (scene.scene === 'docs') {
    return {
      position: [0.4, -0.15, -1.4],
      rotation: [0.04, 0.1, -0.05],
      scale: 0.34,
      accent: '#2be4d0',
      opacity: 0.08,
    }
  }

  return {
    position: [2.75, 0.15, -0.45],
    rotation: [0.18, -0.45, 0],
    scale: 0.62,
    accent: '#2be4d0',
    opacity: 0.1,
  }
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

function SceneInstance({
  input,
  opacity,
}: {
  readonly input: RouteSceneInput
  readonly opacity: number
}) {
  const root = useRef<Group>(null)
  const key = routeSceneKey(input)

  useEffect(() => {
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      disposeSceneGraph(root.current)
    }
    const unregister = sceneDisposalRegistry.register(key, dispose)

    return () => {
      unregister()
      dispose()
    }
  }, [key])

  return (
    <group ref={root}>
      <SceneComposition input={input} opacity={opacity} />
    </group>
  )
}

function SceneReadyMarker({ activeKey }: { readonly activeKey: string }) {
  useEffect(() => {
    sceneStore.getState().markIncomingReady()
    const timeout = window.setTimeout(
      () => completeSceneTransition(sceneStore),
      560,
    )
    return () => window.clearTimeout(timeout)
  }, [activeKey])

  return null
}

export function SceneDirector() {
  const active = useStore(sceneStore, (state) => state.active)
  const outgoing = useStore(sceneStore, (state) => state.outgoing)
  const activeKey = routeSceneKey(active)
  const artifact = artifactVariant(active)

  useLayoutEffect(() => {
    sceneStore.getState().markIncomingLoading()
  }, [activeKey])

  return (
    <>
      <PackArtifact {...artifact} />
      <Suspense fallback={null}>
        {outgoing ? (
          <SceneInstance
            key={routeSceneKey(outgoing)}
            input={outgoing}
            opacity={0.2}
          />
        ) : null}
        <SceneInstance key={activeKey} input={active} opacity={1} />
        <SceneReadyMarker activeKey={activeKey} />
      </Suspense>
    </>
  )
}
