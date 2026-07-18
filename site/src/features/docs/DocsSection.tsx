import { ExternalLink } from 'lucide-react'

import { CommandCopy } from '../../components/CommandCopy'
import type { DocsTopicContent } from '../../content/docs'
import type { SiteLocale } from '../../data/types'

interface DocsSectionLabels {
  readonly copyCommand: string
  readonly copied: string
  readonly fallback: string
  readonly outcome: string
  readonly selectedCommand: string
  readonly source: string
}

interface DocsSectionProps {
  readonly index: number
  readonly labels: DocsSectionLabels
  readonly locale: SiteLocale
  readonly topic: DocsTopicContent
}

export function DocsSection({
  index,
  labels,
  locale,
  topic,
}: DocsSectionProps) {
  const copy = topic.copy[locale]

  return (
    <section
      className="docs-section"
      data-docs-topic={topic.id}
      data-reveal
      id={topic.id}
    >
      <div className="docs-section__index" data-reveal-item aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="docs-section__body">
        <p className="eyebrow">{copy.step}</p>
        <h2>{copy.title}</h2>
        <p className="docs-section__summary">{copy.summary}</p>
        <p className="docs-section__detail">{copy.detail}</p>

        <div className="docs-section__outcome" data-reveal-item>
          <span>{labels.outcome}</span>
          <strong>{copy.outcome}</strong>
        </div>

        <div className="docs-commands" data-reveal-item>
          {topic.commands.map((command) => (
            <CommandCopy
              className="docs-command"
              command={command}
              copiedLabel={labels.copied}
              copyLabel={labels.copyCommand}
              fallbackLabel={labels.fallback}
              key={command}
              selectedCommandLabel={labels.selectedCommand}
              showPrompt
            />
          ))}
        </div>

        <a
          className="docs-section__source"
          href={topic.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {labels.source}
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
      <div className="docs-section__node" data-reveal-item aria-hidden="true">
        <span />
        {topic.id}
      </div>
    </section>
  )
}
