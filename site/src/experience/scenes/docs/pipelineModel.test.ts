import { describe, expect, it } from 'vitest'

import { DOCS_TOPIC_IDS } from '../../../features/docs/docsManifest'
import { pipelineModel } from './pipelineModel'

describe('documentation pipeline model', () => {
  it.each(DOCS_TOPIC_IDS)('keeps a finite stable topology for %s', (topic) => {
    const model = pipelineModel(topic)
    const repeated = pipelineModel(topic)

    expect(model).toEqual(repeated)
    expect(model.nodes.map((node) => node.id)).toEqual(DOCS_TOPIC_IDS)
    expect(model.paths).toHaveLength(DOCS_TOPIC_IDS.length - 1)
    expect(
      model.nodes.every((node) => node.position.every(Number.isFinite)),
    ).toBe(true)
    expect(new Set(model.nodes.map((node) => node.position.join(','))).size).toBe(
      DOCS_TOPIC_IDS.length,
    )
  })

  it('connects adjacent topics in pipeline order', () => {
    const model = pipelineModel('install')

    expect(model.paths.map((path) => [path.from, path.to])).toEqual([
      ['install', 'author'],
      ['author', 'publish'],
      ['publish', 'trust'],
      ['trust', 'policy'],
      ['policy', 'audit'],
    ])
    expect(
      model.paths.every((path) =>
        path.points.every((point) => point.every(Number.isFinite)),
      ),
    ).toBe(true)
  })

  it('marks the current node and the traced path through the active topic', () => {
    const model = pipelineModel('trust')

    expect(model.nodes.filter((node) => node.active).map((node) => node.id)).toEqual([
      'trust',
    ])
    expect(model.nodes.filter((node) => node.visited).map((node) => node.id)).toEqual([
      'install',
      'author',
      'publish',
      'trust',
    ])
    expect(model.paths.map((path) => path.traced)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })
})
