import { describe, expect, it } from 'vitest'

import {
  createDemoState,
  demoReducer,
  demoStepIds,
  deriveDemoCommand,
} from './demoMachine'

describe('guided demo machine', () => {
  it('uses the exact six-step product sequence', () => {
    expect(demoStepIds).toEqual([
      'search',
      'passport',
      'preview',
      'target',
      'install',
      'use',
    ])
  })

  it('moves forward, backward, skips to install, and resets', () => {
    const initial = createDemoState()
    const advanced = demoReducer(initial, { type: 'NEXT' })
    const returned = demoReducer(advanced, { type: 'BACK' })
    const skipped = demoReducer(returned, { type: 'SKIP' })

    expect(advanced.stepId).toBe('passport')
    expect(returned.stepId).toBe('search')
    expect(skipped.stepId).toBe('install')
    expect(demoReducer(skipped, { type: 'RESET' })).toEqual(initial)
  })

  it('derives a truthful source-tree command from Pack and target', () => {
    const state = demoReducer(createDemoState(), {
      type: 'SELECT_TARGET',
      targetId: 'codex',
    })

    expect(deriveDemoCommand(state)).toBe(
      'node src/cli.mjs install senior-code-reviewer --target codex --yes',
    )
    expect(state).not.toHaveProperty('installed')
  })

  it('rejects target previews that are not available for the selected Pack', () => {
    const accessibilityState = demoReducer(createDemoState(), {
      type: 'SELECT_PACK',
      packId: 'accessibility-auditor',
    })

    expect(() =>
      demoReducer(accessibilityState, {
        type: 'SELECT_TARGET',
        targetId: 'github-copilot',
      }),
    ).toThrow(/not available/i)
  })
})
