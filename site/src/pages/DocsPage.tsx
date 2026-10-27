import { useCallback, useEffect, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useSectionTimeline } from '../animation/useSectionTimeline'
import type { DocsTopicId } from '../content/docs'
import { sceneStore } from '../experience/sceneStore'
import { DocsNav } from '../features/docs/DocsNav'
import { DocsSection } from '../features/docs/DocsSection'
import {
  DOCS_TOPIC_IDS,
  docsManifest,
  docsTopicFromHash,
} from '../features/docs/docsManifest'
import '../features/docs/docs.css'
import { useLanguage } from '../i18n/useLanguage'

const pageCopy = {
  en: {
    eyebrow: 'Pipeline / Source to runtime',
    title: 'Documentation',
    lede:
      'Build, inspect, publish, and govern a Pack through one evidence-first workflow.',
    statement: 'One Pack. Six gates. Every write accounted for.',
    start: 'Start with inspection',
    topics: 'Documentation topics',
    chooseTopic: 'Choose a topic',
    copyCommand: 'Copy command',
    copied: 'Command copied',
    fallback: 'Command selected. Press Ctrl+C or Command+C to copy.',
    outcome: 'Output',
    selectedCommand: 'Selected command',
    source: 'Read source documentation',
  },
  zh: {
    eyebrow: '流程 / 从源码到运行时',
    title: '文档',
    lede: '通过一套证据优先的工作流，构建、检查、发布并治理 Pack。',
    statement: '一个 Pack，六道门禁，每次写入都有依据。',
    start: '从检查开始',
    topics: '文档主题',
    chooseTopic: '选择主题',
    copyCommand: '复制命令',
    copied: '命令已复制',
    fallback: '命令已选中。请按 Ctrl+C 或 Command+C 复制。',
    outcome: '输出',
    selectedCommand: '已选中的命令',
    source: '阅读源文档',
  },
} as const

export function DocsPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { siteLocale } = useLanguage()
  const copy = pageCopy[siteLocale]
  const root = useSectionTimeline<HTMLElement>()
  const [activeTopic, setActiveTopic] = useState<DocsTopicId>(() =>
    docsTopicFromHash(hash),
  )

  const activateTopic = useCallback((topic: DocsTopicId) => {
    setActiveTopic(topic)
    const active = sceneStore.getState().active
    if (active.scene === 'docs') {
      sceneStore.getState().patchScene({
        topic,
        progress: DOCS_TOPIC_IDS.indexOf(topic) / (DOCS_TOPIC_IDS.length - 1),
      })
    }
  }, [])

  const scrollToTopic = useCallback((topic: DocsTopicId) => {
    document.getElementById(topic)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    })
  }, [])

  const selectTopic = useCallback(
    (topic: DocsTopicId) => {
      activateTopic(topic)
      const nextHash = `#${topic}`
      if (hash === nextHash) {
        scrollToTopic(topic)
        return
      }
      void navigate({ hash: nextHash })
    },
    [activateTopic, hash, navigate, scrollToTopic],
  )

  useEffect(() => {
    const topic = docsTopicFromHash(hash)
    if (hash) {
      scrollToTopic(topic)
    }
  }, [hash, scrollToTopic])

  useEffect(() => {
    const handleHashChange = () => {
      activateTopic(docsTopicFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [activateTopic])

  useEffect(() => {
    if (!root.current || typeof window.IntersectionObserver === 'undefined') {
      return
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
        const topic = current?.target.getAttribute('data-docs-topic')

        if (topic && DOCS_TOPIC_IDS.includes(topic as DocsTopicId)) {
          activateTopic(topic as DocsTopicId)
        }
      },
      {
        rootMargin: '-28% 0px -55%',
        threshold: [0.15, 0.35, 0.6],
      },
    )

    root.current
      .querySelectorAll<HTMLElement>('[data-docs-topic]')
      .forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [activateTopic, root])

  return (
    <article ref={root} className="route-page route-page--docs">
      <section className="docs-hero" data-reveal>
        <div className="docs-hero__content">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="route-lede">{copy.lede}</p>
          <p className="docs-hero__statement" data-reveal-item>
            {copy.statement}
          </p>
        </div>
        <ol className="docs-hero__flow" data-reveal-item aria-hidden="true">
          {docsManifest.map((topic, index) => (
            <li key={topic.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span>{topic.id}</span>
              <span>{index === docsManifest.length - 1 ? 'proof' : 'flow'}</span>
            </li>
          ))}
        </ol>
        <a
          className="docs-hero__jump"
          href="#install"
          onClick={(event) => {
            event.preventDefault()
            selectTopic('install')
          }}
        >
          <ArrowDown aria-hidden="true" />
          {copy.start}
        </a>
      </section>

      <div className="docs-layout">
        <DocsNav
          activeTopic={activeTopic}
          label={copy.topics}
          locale={siteLocale}
          mobileLabel={copy.chooseTopic}
          onSelect={selectTopic}
          topics={docsManifest}
        />
        <div className="docs-sections">
          {docsManifest.map((topic, index) => (
            <DocsSection
              index={index}
              key={topic.id}
              labels={{
                copied: copy.copied,
                copyCommand: copy.copyCommand,
                fallback: copy.fallback,
                outcome: copy.outcome,
                selectedCommand: copy.selectedCommand,
                source: copy.source,
              }}
              locale={siteLocale}
              topic={topic}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

export { DocsPage as Component }
