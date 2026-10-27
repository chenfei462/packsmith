import type { KeyboardEvent } from 'react'

import type { DocsTopicId } from '../../content/docs'
import type { DocsTopicContent } from '../../content/docs'
import type { SiteLocale } from '../../data/types'

interface DocsNavProps {
  readonly activeTopic: DocsTopicId
  readonly label: string
  readonly mobileLabel: string
  readonly locale: SiteLocale
  readonly topics: readonly DocsTopicContent[]
  readonly onSelect: (topic: DocsTopicId) => void
}

export function DocsNav({
  activeTopic,
  label,
  mobileLabel,
  locale,
  topics,
  onSelect,
}: DocsNavProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const links = [
      ...event.currentTarget.querySelectorAll<HTMLAnchorElement>(
        '[data-docs-topic-link]',
      ),
    ]
    const currentIndex = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (currentIndex < 0) return

    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? links.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % links.length
            : (currentIndex - 1 + links.length) % links.length
    links[nextIndex]?.focus()
  }

  return (
    <aside
      aria-label={label}
      className="docs-nav"
      onKeyDown={handleKeyDown}
    >
      <label className="docs-nav__mobile">
        <span>{mobileLabel}</span>
        <select
          aria-label={mobileLabel}
          onChange={(event) =>
            onSelect(event.currentTarget.value as DocsTopicId)
          }
          value={activeTopic}
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.copy[locale].title}
            </option>
          ))}
        </select>
      </label>

      <div className="docs-nav__desktop">
        <p className="docs-nav__label">{label}</p>
        <ol>
          {topics.map((topic, index) => (
            <li key={topic.id}>
              <a
                aria-current={
                  activeTopic === topic.id ? 'location' : undefined
                }
                data-docs-topic-link
                href={`#${topic.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  onSelect(topic.id)
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {topic.copy[locale].title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}
