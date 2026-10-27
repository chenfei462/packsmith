import { docsContent } from '../../content/docs'
import type { DocsTopicContent, DocsTopicId } from '../../content/docs'

export const DOCS_TOPIC_IDS = [
  'install',
  'author',
  'publish',
  'trust',
  'policy',
  'audit',
] as const satisfies readonly DocsTopicId[]

export const docsManifest: readonly DocsTopicContent[] = DOCS_TOPIC_IDS.map(
  (id) => docsContent[id],
)

const topicIds = new Set<string>(DOCS_TOPIC_IDS)

export function docsTopicFromHash(hash: string): DocsTopicId {
  const candidate = hash.replace(/^#/, '')

  return topicIds.has(candidate) ? (candidate as DocsTopicId) : 'install'
}
