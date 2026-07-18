import type { DocsTopicId } from '../../../content/docs'
import { DOCS_TOPIC_IDS } from '../../../features/docs/docsManifest'

export type PipelinePoint = [number, number, number]

export interface PipelineNodeModel {
  readonly id: DocsTopicId
  readonly position: PipelinePoint
  readonly active: boolean
  readonly visited: boolean
}

export interface PipelinePathModel {
  readonly from: DocsTopicId
  readonly to: DocsTopicId
  readonly points: readonly PipelinePoint[]
  readonly traced: boolean
}

export interface PipelineModel {
  readonly nodes: readonly PipelineNodeModel[]
  readonly paths: readonly PipelinePathModel[]
  readonly activeIndex: number
}

const nodePositions: Readonly<Record<DocsTopicId, PipelinePoint>> = {
  install: [-4.2, -1.1, 0],
  author: [-2.5, -0.25, -0.4],
  publish: [-0.8, 0.55, 0],
  trust: [0.9, 1.2, -0.35],
  policy: [2.6, 0.45, 0],
  audit: [4.3, -0.5, -0.25],
}

export function pipelineModel(topic: DocsTopicId): PipelineModel {
  const activeIndex = DOCS_TOPIC_IDS.indexOf(topic)
  const nodes = DOCS_TOPIC_IDS.map((id, index) => ({
    id,
    position: nodePositions[id],
    active: index === activeIndex,
    visited: index <= activeIndex,
  }))
  const paths = DOCS_TOPIC_IDS.slice(0, -1).map((from, index) => {
    const to = DOCS_TOPIC_IDS[index + 1]
    const start = nodePositions[from]
    const end = nodePositions[to]
    const midpoint: PipelinePoint = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      Math.min(start[2], end[2]) - 0.45,
    ]

    return {
      from,
      to,
      points: [start, midpoint, end],
      traced: index < activeIndex,
    }
  })

  return { nodes, paths, activeIndex }
}
