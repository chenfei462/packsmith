import { describe, expect, it } from 'vitest'

import { repositoryData } from '../../data/repositoryData'
import type { SitePack } from '../../data/types'
import { createPackDetailModel } from './packDetailModel'

describe('Pack detail model', () => {
  it('looks up a Pack by its exact Registry ID', () => {
    const detail = createPackDetailModel(
      repositoryData.packs,
      'senior-code-reviewer',
      'codex',
    )

    expect(detail.pack.id).toBe('senior-code-reviewer')
  })

  it('throws a route Response for an unknown Pack ID', () => {
    try {
      createPackDetailModel(repositoryData.packs, 'Senior-Code-Reviewer')
      throw new Error('Expected createPackDetailModel to throw.')
    } catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(404)
      expect((error as Response).statusText).toBe('')
    }
  })

  it('defaults to the first preview-ready target', () => {
    const detail = createPackDetailModel(
      repositoryData.packs,
      'senior-code-reviewer',
    )

    expect(detail.targetId).toBe('claude-code')
    expect(detail.preview.status).toBe('preview-ready')
  })

  it('preserves an explicitly requested unavailable target', () => {
    const detail = createPackDetailModel(
      repositoryData.packs,
      'accessibility-auditor',
      'github-copilot',
    )

    expect(detail.targetId).toBe('github-copilot')
    expect(detail.preview.status).toBe('not-declared')
    expect(detail.available).toBe(false)
  })

  it('uses target-specific writes and checksum data', () => {
    const detail = createPackDetailModel(
      repositoryData.packs,
      'senior-code-reviewer',
      'codex',
    )

    expect(detail.preview.writes).toEqual([
      '<home>/.codex/skills/senior-code-reviewer/AGENTS.md',
      '<home>/.codex/skills/senior-code-reviewer/README.md',
      '<home>/.codex/skills/senior-code-reviewer/bundle.json',
      '<home>/.codex/skills/senior-code-reviewer/catalog.json',
      '<home>/.codex/skills/senior-code-reviewer/manifest.json',
      '<home>/.codex/skills/senior-code-reviewer/prompts/review-current-change.md',
      '<home>/.codex/skills/senior-code-reviewer/skills/senior-code-review/SKILL.md',
    ])
    expect(detail.preview.checksum).toBe(
      'sha256-2af630c235f10bcc9297dfea4bd5e01b59e210620f68276753f65054b2e6cf60',
    )
    expect(detail.preview.checksum).not.toBe(detail.pack.passport.checksum)
  })

  it('omits the install command for a not-declared target', () => {
    const detail = createPackDetailModel(
      repositoryData.packs,
      'accessibility-auditor',
      'github-copilot',
    )

    expect(detail.installCommand).toBeUndefined()
  })

  it('omits the install command for a not-ready target', () => {
    const sourcePack = repositoryData.packs.find(
      (pack) => pack.id === 'senior-code-reviewer',
    )
    expect(sourcePack).toBeDefined()

    const pack = {
      ...sourcePack,
      previews: {
        ...sourcePack?.previews,
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

    const detail = createPackDetailModel([pack], pack.id, 'codex')

    expect(detail.preview.status).toBe('not-ready')
    expect(detail.installCommand).toBeUndefined()
  })
})
