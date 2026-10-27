import { describe, expect, it } from 'vitest'

import { createFragmentLayout } from './homeSceneModel'

describe('createFragmentLayout', () => {
  it('creates deterministic Pack-ID seeded assembly fragments', () => {
    const first = createFragmentLayout('senior-code-reviewer')
    const repeated = createFragmentLayout('senior-code-reviewer')
    const otherPack = createFragmentLayout('accessibility-auditor')

    expect(first).toEqual(repeated)
    expect(first).toHaveLength(72)
    expect(first).not.toEqual(otherPack)
    expect(first.every((fragment) => fragment.scatter.join(',') !== fragment.assembled.join(','))).toBe(true)
  })
})
