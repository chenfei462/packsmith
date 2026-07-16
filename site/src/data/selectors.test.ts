import { describe, expect, it } from 'vitest'

import { repositoryData } from './repositoryData'
import { filterPacks, getPackById } from './selectors'

describe('repository selectors', () => {
  it('filters from one authoritative Pack collection', () => {
    const results = filterPacks(repositoryData.packs, {
      q: 'review',
      category: '',
      target: 'codex',
      risk: '',
      sort: 'name',
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((pack) => pack.targetIds.includes('codex'))).toBe(true)
  })

  it('matches localized names and descriptions case-insensitively', () => {
    const pack = getPackById(repositoryData.packs, 'senior-code-reviewer')
    const localizedName = pack?.localizations.zh?.name

    expect(localizedName).toBeTruthy()
    expect(
      filterPacks(repositoryData.packs, {
        q: localizedName?.toUpperCase() ?? '',
        category: '',
        target: '',
        risk: '',
        sort: 'name',
      }).map((result) => result.id),
    ).toContain('senior-code-reviewer')
  })

  it('sorts quality and update time from highest to lowest', () => {
    const qualityResults = filterPacks(repositoryData.packs, {
      q: '',
      category: '',
      target: '',
      risk: '',
      sort: 'quality',
    })
    const updatedResults = filterPacks(repositoryData.packs, {
      q: '',
      category: '',
      target: '',
      risk: '',
      sort: 'updated',
    })

    expect(qualityResults.map((pack) => pack.passport.qualityScore)).toEqual(
      qualityResults
        .map((pack) => pack.passport.qualityScore)
        .sort((left, right) => right - left),
    )
    expect(updatedResults.map((pack) => pack.updatedAt)).toEqual(
      updatedResults
        .map((pack) => pack.updatedAt)
        .sort()
        .reverse(),
    )
  })

  it('returns undefined for an unknown exact id', () => {
    expect(getPackById(repositoryData.packs, 'does-not-exist')).toBeUndefined()
  })
})
