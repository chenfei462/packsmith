import { createElement, useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSceneInput, sceneStore } from './sceneStore'
import { SceneDirector } from './SceneDirector'

const sceneStats = vi.hoisted(() => ({
  homeMounts: 0,
  homeUnmounts: 0,
}))

vi.mock('./lifecycle/sceneLifecycle', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('./lifecycle/sceneLifecycle')
  >()
  return { ...actual, disposeSceneGraph: vi.fn() }
})

vi.mock('./primitives/PackArtifact', () => ({ PackArtifact: () => null }))

vi.mock('./scenes/home/HomeScene', () => ({
  HomeScene: function HomeSceneProbe() {
    useEffect(() => {
      sceneStats.homeMounts += 1
      return () => {
        sceneStats.homeUnmounts += 1
      }
    }, [])
    return createElement('div', { 'data-testid': 'home-scene' })
  },
}))

vi.mock('./scenes/registry/RegistryScene', () => ({
  RegistryScene: () =>
    createElement('div', { 'data-testid': 'registry-scene' }),
}))

vi.mock('./scenes/pack-detail/PackDetailScene', () => ({
  PackDetailScene: () => null,
}))

vi.mock('./scenes/docs/DocsScene', () => ({ DocsScene: () => null }))

beforeEach(() => {
  sceneStats.homeMounts = 0
  sceneStats.homeUnmounts = 0
  sceneStore.setState({
    active: defaultSceneInput,
    incomingReady: true,
    outgoing: undefined,
  })
})

describe('SceneDirector', () => {
  it('preserves the active instance while it becomes the outgoing scene', async () => {
    render(<SceneDirector />)
    await screen.findByTestId('home-scene')
    expect(sceneStats).toMatchObject({ homeMounts: 1, homeUnmounts: 0 })

    act(() => {
      sceneStore.getState().setScene({
        scene: 'registry',
        packIds: ['senior-code-reviewer'],
        progress: 0,
      })
    })
    await screen.findByTestId('registry-scene')

    expect(sceneStats).toMatchObject({ homeMounts: 1, homeUnmounts: 0 })
    await waitFor(
      () => expect(sceneStats.homeUnmounts).toBe(1),
      { timeout: 1500 },
    )
  })
})
