import { describe, expect, it } from 'vitest'

import { buildInstallCommand } from './commands'
import { repositoryData } from './repositoryData'
import { getPackById } from './selectors'
import type { SitePack } from './types'

describe('install command builder', () => {
  it('builds only a truthful source-tree command for ready targets', () => {
    const pack = getPackById(repositoryData.packs, 'senior-code-reviewer')

    expect(pack).toBeDefined()
    expect(buildInstallCommand(pack!, 'codex')).toBe(
      'node src/cli.mjs install senior-code-reviewer --target codex --yes',
    )
  })

  it('rejects a target not declared by the Pack', () => {
    const pack = getPackById(repositoryData.packs, 'accessibility-auditor')

    expect(pack).toBeDefined()
    expect(() => buildInstallCommand(pack!, 'github-copilot')).toThrow(
      /not available/i,
    )
  })

  it('rejects a declared target whose preview is not ready', () => {
    const pack = getPackById(repositoryData.packs, 'senior-code-reviewer')
    const unavailablePack = {
      ...pack,
      previews: {
        ...pack?.previews,
        codex: {
          targetId: 'codex',
          status: 'not-ready',
          writes: [],
          bridgeFiles: [],
          warnings: [],
          reason: 'Preview failed.',
        },
      },
    } as SitePack

    expect(() => buildInstallCommand(unavailablePack, 'codex')).toThrow(
      /not available/i,
    )
  })
})
