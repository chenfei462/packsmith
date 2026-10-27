import {
  Material,
  Texture,
  type BufferGeometry,
  type Object3D,
} from 'three'
import type { StoreApi } from 'zustand/vanilla'

import type { SceneStoreState } from '../sceneStore'
import type { RouteSceneInput } from '../types'

export type ScenePhase = 'loading' | 'transitioning' | 'stable'
export type SceneDisposer = () => void

export interface SceneDisposalRegistry {
  readonly register: (sceneKey: string, disposer: SceneDisposer) => () => void
  readonly dispose: (sceneKey: string) => void
  readonly size: (sceneKey: string) => number
}

export function routeSceneKey(scene: RouteSceneInput): string {
  return scene.scene === 'pack-detail'
    ? `${scene.scene}:${scene.packId}`
    : scene.scene
}

export function createSceneDisposalRegistry(): SceneDisposalRegistry {
  const disposers = new Map<string, Set<SceneDisposer>>()

  return {
    register(sceneKey, disposer) {
      const sceneDisposers = disposers.get(sceneKey) ?? new Set<SceneDisposer>()
      sceneDisposers.add(disposer)
      disposers.set(sceneKey, sceneDisposers)

      return () => {
        sceneDisposers.delete(disposer)
        if (sceneDisposers.size === 0) disposers.delete(sceneKey)
      }
    },
    dispose(sceneKey) {
      const sceneDisposers = disposers.get(sceneKey)
      if (!sceneDisposers) return

      disposers.delete(sceneKey)
      for (const disposer of sceneDisposers) disposer()
    },
    size(sceneKey) {
      return disposers.get(sceneKey)?.size ?? 0
    },
  }
}

export const sceneDisposalRegistry = createSceneDisposalRegistry()

export function settleSceneMotion(
  current: number,
  target: number,
  delta: number,
  reducedMotion: boolean,
  smoothing = 5.4,
): number {
  if (reducedMotion) return target
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0
  return target + (current - target) * Math.exp(-smoothing * safeDelta)
}

export function stableSceneProgress(
  scene: RouteSceneInput['scene'],
  progress: number,
  reducedMotion: boolean,
): number {
  if (!reducedMotion || scene === 'docs') return progress
  if (scene === 'home') return 0.38
  if (scene === 'registry') return 0.22
  return 0.5
}

export function completeSceneTransition(
  store: StoreApi<SceneStoreState>,
  registry: SceneDisposalRegistry = sceneDisposalRegistry,
): void {
  const outgoing = store.getState().outgoing
  store.getState().completeTransition()
  if (outgoing && !store.getState().outgoing) {
    registry.dispose(routeSceneKey(outgoing))
  }
}

export function disposeSceneGraph(root: Object3D | null): void {
  if (!root) return

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    const resource = object as Object3D & {
      readonly geometry?: BufferGeometry
      readonly material?: Material | readonly Material[]
    }
    if (resource.geometry) geometries.add(resource.geometry)
    const objectMaterials = Array.isArray(resource.material)
      ? resource.material
      : resource.material
        ? [resource.material]
        : []

    for (const material of objectMaterials) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}

export function markSceneHost(
  host: HTMLElement | null,
  ready: boolean,
  phase: ScenePhase,
): void {
  if (!host) return
  host.dataset.sceneReady = String(ready)
  host.dataset.scenePhase = phase
}
