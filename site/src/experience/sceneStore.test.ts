import { describe, expect, it } from 'vitest'

import { createSceneStore } from './sceneStore'
import type { RouteSceneInput } from './types'

const homeScene = {
  scene: 'home',
  section: 'hero',
  packId: 'senior-code-reviewer',
  targetId: 'codex',
  demoStep: 0,
  progress: 0,
} satisfies RouteSceneInput

describe('scene store', () => {
  it('keeps exactly one active scene input', () => {
    const store = createSceneStore(homeScene)

    expect(store.getState().active).toEqual(homeScene)
    expect(store.getState().outgoing).toBeUndefined()
  })

  it('patches progress without recreating unrelated scene data', () => {
    const packIds = ['senior-code-reviewer', 'security-reviewer'] as const
    const store = createSceneStore({
      scene: 'registry',
      packIds,
      progress: 0,
    })

    store.getState().patchScene({ progress: 0.65 })

    const active = store.getState().active

    expect(active.progress).toBe(0.65)
    expect(
      active.scene === 'registry' ? active.packIds : undefined,
    ).toBe(packIds)
  })

  it('preserves outgoing state until the incoming scene is ready', () => {
    const store = createSceneStore(homeScene)
    const registryScene = {
      scene: 'registry',
      packIds: ['senior-code-reviewer'],
      focusedPackId: 'senior-code-reviewer',
      progress: 0.2,
    } satisfies RouteSceneInput

    store.getState().setScene(registryScene)
    expect(store.getState().active).toEqual(registryScene)
    expect(store.getState().outgoing).toEqual(homeScene)
    expect(store.getState().incomingReady).toBe(false)

    store.getState().markIncomingReady()
    expect(store.getState().outgoing).toEqual(homeScene)
    expect(store.getState().incomingReady).toBe(true)

    store.getState().completeTransition()
    expect(store.getState().outgoing).toBeUndefined()
  })

  it('tracks visibility pauses and context losses', () => {
    const store = createSceneStore(homeScene)

    store.getState().setPaused(true)
    store.getState().recordContextLoss()
    store.getState().recordContextLoss()

    expect(store.getState().paused).toBe(true)
    expect(store.getState().contextLosses).toBe(2)
  })
})
