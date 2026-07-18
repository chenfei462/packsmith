import { createElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from 'three'
import { useStore } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderAppRoute } from '../../test/render'
import { FallbackStage } from '../fallback/FallbackStage'
import { derivePerformanceTier } from '../performance/derivePerformanceTier'
import { createSceneStore, defaultSceneInput, sceneStore } from '../sceneStore'
import type { RouteSceneInput } from '../types'
import { useVisibilityPause } from './useVisibilityPause'
import { contextLossAction } from './useContextRecovery'
import {
  completeSceneTransition,
  createSceneDisposalRegistry,
  disposeSceneGraph,
  markSceneHost,
  settleSceneMotion,
  stableSceneProgress,
} from './sceneLifecycle'

function VisibilityHarness() {
  useVisibilityPause()
  const paused = useStore(sceneStore, (state) => state.paused)

  return createElement('div', {
    'data-testid': 'visibility-state',
    'data-paused': String(paused),
  })
}

const fallbackScenes = [
  [
    defaultSceneInput,
    'home-forge',
  ],
  [
    {
      scene: 'registry',
      packIds: ['senior-code-reviewer'],
      progress: 0,
    },
    'registry-field',
  ],
  [
    {
      scene: 'pack-detail',
      packId: 'senior-code-reviewer',
      targetId: 'codex',
      layer: 'manifest',
      progress: 0,
    },
    'pack-passport',
  ],
  [
    {
      scene: 'docs',
      topic: 'install',
      progress: 0,
    },
    'docs-pipeline',
  ],
] as const satisfies readonly (readonly [RouteSceneInput, string])[]

beforeEach(() => {
  window.localStorage.clear()
  sceneStore.getState().setScene(defaultSceneInput)
  sceneStore.getState().completeTransition()
  sceneStore.getState().setPaused(false)
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
})

describe('scene lifecycle', () => {
  it('disposes outgoing scene resources once after a transition', () => {
    const registry = createSceneDisposalRegistry()
    const store = createSceneStore(defaultSceneInput)
    const firstDisposer = vi.fn()
    const secondDisposer = vi.fn()

    registry.register('home', firstDisposer)
    registry.register('home', secondDisposer)
    expect(registry.size('home')).toBe(2)
    store.getState().setScene({
      scene: 'docs',
      topic: 'install',
      progress: 0,
    })

    completeSceneTransition(store, registry)
    expect(firstDisposer).not.toHaveBeenCalled()
    expect(store.getState().outgoing).toEqual(defaultSceneInput)

    store.getState().markIncomingReady()
    completeSceneTransition(store, registry)
    completeSceneTransition(store, registry)

    expect(firstDisposer).toHaveBeenCalledTimes(1)
    expect(secondDisposer).toHaveBeenCalledTimes(1)
    expect(registry.size('home')).toBe(0)
    expect(store.getState().outgoing).toBeUndefined()
  })

  it('disposes geometry, material, and texture resources in a scene graph', () => {
    const geometry = new BoxGeometry()
    const texture = new Texture()
    const material = new MeshStandardMaterial({ map: texture })
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')
    const root = new Group()
    root.add(new Mesh(geometry, material))

    disposeSceneGraph(root)

    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(textureDispose).toHaveBeenCalledOnce()
  })

  it('marks scene readiness and transition phase on the canvas host', () => {
    const host = document.createElement('div')

    markSceneHost(host, false, 'loading')
    expect(host).toHaveAttribute('data-scene-ready', 'false')
    expect(host).toHaveAttribute('data-scene-phase', 'loading')

    markSceneHost(host, true, 'stable')
    expect(host).toHaveAttribute('data-scene-ready', 'true')
    expect(host).toHaveAttribute('data-scene-phase', 'stable')
  })

  it('snaps reduced motion and damps full-motion scene transforms', () => {
    expect(settleSceneMotion(0, 4, 1 / 60, true)).toBe(4)
    const animated = settleSceneMotion(0, 4, 1 / 60, false)
    expect(animated).toBeGreaterThan(0)
    expect(animated).toBeLessThan(4)
  })

  it('uses fixed route compositions instead of scrub progress when reduced', () => {
    expect(stableSceneProgress('home', 0.9, true)).toBe(0.38)
    expect(stableSceneProgress('registry', 0.9, true)).toBe(0.22)
    expect(stableSceneProgress('pack-detail', 0.9, true)).toBe(0.5)
    expect(stableSceneProgress('docs', 0.9, true)).toBe(0.9)
    expect(stableSceneProgress('pack-detail', 0.9, false)).toBe(0.9)
  })

  it.each(fallbackScenes)('renders the %s route composition', (scene, name) => {
    const { unmount } = render(createElement(FallbackStage, { scene }))

    expect(
      document.querySelector(`[data-fallback-composition="${name}"]`),
    ).toBeInTheDocument()
    unmount()
  })

  it('keeps one canvas through repeated route changes', async () => {
    const { router } = renderAppRoute('/')

    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const route of [
        '/registry',
        '/registry/senior-code-reviewer',
        '/docs',
        '/',
      ]) {
        await act(async () => router.navigate(route))
        expect(document.querySelectorAll('#experience-root')).toHaveLength(1)
        expect(document.querySelectorAll('canvas').length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('pauses and resumes the canvas with document visibility', async () => {
    render(createElement(VisibilityHarness))
    const state = screen.getByTestId('visibility-state')
    expect(state).toHaveAttribute('data-paused', 'false')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() =>
      expect(state).toHaveAttribute('data-paused', 'true'),
    )

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() =>
      expect(state).toHaveAttribute('data-paused', 'false'),
    )
  })

  it('uses a static 3D composition on the first reduced-motion render', () => {
    expect(
      derivePerformanceTier({
        width: 1440,
        coarsePointer: false,
        saveData: false,
        hardwareConcurrency: 12,
        deviceMemory: 16,
        reducedMotion: true,
        webgl: true,
      }),
    ).toMatchObject({
      tier: 'high',
      particles: 0,
      continuous: false,
    })
  })

  it('recovers the first context loss and falls back after the second', () => {
    expect(contextLossAction(0)).toBe('recover')
    expect(contextLossAction(1)).toBe('fallback')
    expect(contextLossAction(2)).toBe('fallback')
  })
})
