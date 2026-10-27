import { describe, expect, it } from 'vitest'

import {
  DOCS_TOPIC_IDS,
  docsManifest,
  docsTopicFromHash,
} from './docsManifest'

const EXPECTED_TOPICS = [
  'install',
  'author',
  'publish',
  'trust',
  'policy',
  'audit',
] as const

describe('documentation manifest', () => {
  it('keeps the documentation topics unique and in pipeline order', () => {
    expect(DOCS_TOPIC_IDS).toEqual(EXPECTED_TOPICS)
    expect(new Set(docsManifest.map((topic) => topic.id)).size).toBe(
      EXPECTED_TOPICS.length,
    )
  })

  it('provides English and Chinese titles and summaries for every topic', () => {
    for (const topic of docsManifest) {
      expect(topic.copy.en.title.trim()).not.toBe('')
      expect(topic.copy.en.summary.trim()).not.toBe('')
      expect(topic.copy.zh.title.trim()).not.toBe('')
      expect(topic.copy.zh.summary.trim()).not.toBe('')
    }
  })

  it('provides at least one real Packsmith command for every topic', () => {
    for (const topic of docsManifest) {
      expect(topic.commands.length).toBeGreaterThan(0)
      expect(topic.commands.every((command) => command.startsWith('node src/cli.mjs '))).toBe(
        true,
      )
    }
  })

  it('links every topic to Markdown documentation in the Packsmith repository', () => {
    for (const topic of docsManifest) {
      const source = new URL(topic.sourceUrl)

      expect(source.origin).toBe('https://github.com')
      expect(source.pathname).toMatch(
        /^\/chenfei462\/packsmith\/blob\/main\/(?:README\.md|docs\/[a-z0-9-]+\.md)$/,
      )
    }
  })

  it('falls back to install for empty and unknown hashes', () => {
    expect(docsTopicFromHash('')).toBe('install')
    expect(docsTopicFromHash('#')).toBe('install')
    expect(docsTopicFromHash('#not-a-topic')).toBe('install')
    expect(docsTopicFromHash('#policy')).toBe('policy')
  })
})
