import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

import type { DocsTopicContent } from '../../content/docs'
import type { SiteLocale } from '../../data/types'

interface DocsSectionLabels {
  readonly copyCommand: string
  readonly copied: string
  readonly outcome: string
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
  const [copiedCommand, setCopiedCommand] = useState<string>()
  const resetTimer = useRef<number>(0)

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
    },
    [],
  )

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(command)
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(
        () => setCopiedCommand(undefined),
        1800,
      )
    } catch {
      setCopiedCommand(undefined)
    }
  }

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
          {topic.commands.map((command) => {
            const copied = command === copiedCommand

            return (
              <div className="docs-command" key={command}>
                <span aria-hidden="true" className="docs-command__prompt">
                  $
                </span>
                <code>{command}</code>
                <button
                  aria-label={labels.copyCommand}
                  className="docs-command__copy"
                  onClick={() => void copyCommand(command)}
                  title={labels.copyCommand}
                  type="button"
                >
                  {copied ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </button>
                <span
                  className={`docs-command__feedback${copied ? ' is-visible' : ''}`}
                  role="status"
                >
                  {copied ? labels.copied : ''}
                </span>
              </div>
            )
          })}
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
