import { createStore } from 'zustand/vanilla'

import type { RouteSceneInput, RouteScenePatch } from './types'

export interface SceneStoreState {
  readonly active: RouteSceneInput
  readonly outgoing?: RouteSceneInput
  readonly incomingReady: boolean
  readonly paused: boolean
  readonly contextLosses: number
  readonly setScene: (scene: RouteSceneInput) => void
  readonly patchScene: (patch: RouteScenePatch) => void
  readonly markIncomingReady: () => void
  readonly completeTransition: () => void
  readonly setPaused: (paused: boolean) => void
  readonly recordContextLoss: () => void
}

export const defaultSceneInput: RouteSceneInput = {
  scene: 'home',
  section: 'hero',
  packId: 'senior-code-reviewer',
  targetId: 'codex',
  demoStep: 0,
  progress: 0,
}

function sceneIdentity(scene: RouteSceneInput): string {
  return scene.scene === 'pack-detail'
    ? `${scene.scene}:${scene.packId}`
    : scene.scene
}

export function createSceneStore(initialScene: RouteSceneInput = defaultSceneInput) {
  return createStore<SceneStoreState>()((set) => ({
    active: initialScene,
    outgoing: undefined,
    incomingReady: true,
    paused: false,
    contextLosses: 0,
    setScene: (nextScene) =>
      set((state) => {
        if (sceneIdentity(state.active) === sceneIdentity(nextScene)) {
          return { active: nextScene }
        }

        return {
          active: nextScene,
          outgoing: state.active,
          incomingReady: false,
        }
      }),
    patchScene: (patch) =>
      set((state) => ({
        active: { ...state.active, ...patch } as RouteSceneInput,
      })),
    markIncomingReady: () => set({ incomingReady: true }),
    completeTransition: () =>
      set((state) =>
        state.incomingReady ? { outgoing: undefined } : state,
      ),
    setPaused: (paused) => set({ paused }),
    recordContextLoss: () =>
      set((state) => ({ contextLosses: state.contextLosses + 1 })),
  }))
}

export const sceneStore = createSceneStore()
