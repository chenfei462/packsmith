import { useEffect, useReducer } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FastForward,
  RotateCcw,
} from 'lucide-react'

import { repositoryData } from '../../data/repositoryData'
import { getPackById } from '../../data/selectors'
import type { RuntimeId, SiteLocale } from '../../data/types'
import { sceneStore } from '../../experience/sceneStore'
import { useLanguage } from '../../i18n/useLanguage'
import {
  createDemoState,
  demoReducer,
  demoStepIds,
  deriveDemoCommand,
  type DemoState,
} from './demoMachine'

const stepLabels = {
  en: ['Search', 'Passport', 'Preview', 'Choose agent', 'Install', 'Use'],
  zh: ['搜索', '通行证', '预览', '选择智能体', '安装', '使用'],
} as const

interface DemoUiCopy {
  readonly browserWrite: string
  readonly next: string
  readonly pack: string
  readonly previous: string
  readonly quality: string
  readonly reset: string
  readonly risk: string
  readonly selected: (packCount: number, packName: string) => string
  readonly skip: string
  readonly stepCounter: (step: number, total: number) => string
  readonly targetRuntime: string
}

const demoUiCopy: Readonly<Record<SiteLocale, DemoUiCopy>> = {
  en: {
    browserWrite:
      'The source command is ready for your terminal. This browser has not written any files.',
    next: 'Next step',
    pack: 'Pack',
    previous: 'Previous step',
    quality: 'Quality',
    reset: 'Reset demo',
    risk: 'Risk',
    selected: (packCount, packName) =>
      `${packCount} official Packs. Selected: ${packName}.`,
    skip: 'Skip to install',
    stepCounter: (step, total) => `Step ${step} of ${total}`,
    targetRuntime: 'Target runtime',
  },
  zh: {
    browserWrite: '源命令已准备好，可在终端中运行。浏览器没有写入任何文件。',
    next: '下一步',
    pack: 'Pack',
    previous: '上一步',
    quality: '质量',
    reset: '重置演示',
    risk: '风险',
    selected: (packCount, packName) => `${packCount} 个官方 Pack，当前选择：${packName}。`,
    skip: '跳到安装',
    stepCounter: (step, total) => `第 ${step} 步，共 ${total} 步`,
    targetRuntime: '目标运行时',
  },
}

function DemoStage({
  copy,
  state,
}: {
  readonly copy: DemoUiCopy
  readonly state: DemoState
}) {
  const pack = getPackById(repositoryData.packs, state.packId)

  if (!pack) {
    return null
  }

  if (state.stepId === 'passport') {
    return (
      <div className="demo-stage__facts">
        <span>
          {copy.quality} {pack.passport.qualityScore}/100
        </span>
        <span>
          {copy.risk} {pack.passport.computedRisk}
        </span>
        <span>{pack.passport.checksumStatus}</span>
      </div>
    )
  }

  if (state.stepId === 'preview') {
    const preview = pack.previews[state.targetId]
    return (
      <ul className="demo-write-list">
        {preview.writes.slice(0, 4).map((writePath) => (
          <li key={writePath}>{writePath}</li>
        ))}
      </ul>
    )
  }

  if (state.stepId === 'target') {
    const target = repositoryData.targets.find(
      (candidate) => candidate.id === state.targetId,
    )
    return (
      <p>
        {target?.name}: {pack.previews[state.targetId].installPathTemplate}
      </p>
    )
  }

  if (state.stepId === 'install') {
    return (
      <pre className="demo-command">
        <code>{deriveDemoCommand(state)}</code>
      </pre>
    )
  }

  if (state.stepId === 'use') {
    return <p>{copy.browserWrite}</p>
  }

  return <p>{copy.selected(repositoryData.packs.length, pack.name)}</p>
}

export function DemoSequence() {
  const [state, dispatch] = useReducer(demoReducer, undefined, createDemoState)
  const { siteLocale, locale } = useLanguage()
  const labels = stepLabels[siteLocale]
  const copy = demoUiCopy[siteLocale]
  const pack = getPackById(repositoryData.packs, state.packId)

  useEffect(() => {
    const active = sceneStore.getState().active

    if (active.scene === 'home') {
      sceneStore.getState().patchScene({
        packId: state.packId,
        targetId: state.targetId,
        demoStep: state.stepIndex,
      })
    }
  }, [state.packId, state.stepIndex, state.targetId])

  return (
    <div className="demo-sequence">
      <div className="demo-sequence__controls">
        <label>
          <span>{copy.pack}</span>
          <select
            value={state.packId}
            onChange={(event) =>
              dispatch({ type: 'SELECT_PACK', packId: event.target.value })
            }
          >
            {repositoryData.packs.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.localizations[locale]?.name ?? candidate.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="target-segments">
          <legend>{copy.targetRuntime}</legend>
          {repositoryData.targets.map((target) => {
            const ready =
              pack?.previews[target.id]?.status === 'preview-ready'

            return (
              <button
                key={target.id}
                type="button"
                aria-pressed={target.id === state.targetId}
                disabled={!ready}
                onClick={() =>
                  dispatch({
                    type: 'SELECT_TARGET',
                    targetId: target.id as RuntimeId,
                  })
                }
              >
                {target.name}
              </button>
            )
          })}
        </fieldset>
      </div>

      <ol className="demo-steps">
        {demoStepIds.map((stepId, index) => (
          <li
            key={stepId}
            aria-current={index === state.stepIndex ? 'step' : undefined}
          >
            <span>{labels[index]}</span>
          </li>
        ))}
      </ol>

      <div className="demo-stage" aria-live="polite">
        <p className="demo-stage__counter">
          {copy.stepCounter(state.stepIndex + 1, demoStepIds.length)}
        </p>
        <DemoStage copy={copy} state={state} />
      </div>

      <div className="demo-navigation">
        <button
          type="button"
          disabled={state.stepIndex === 0}
          onClick={() => dispatch({ type: 'BACK' })}
        >
          <ChevronLeft aria-hidden="true" />
          {copy.previous}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'SKIP' })}>
          <FastForward aria-hidden="true" />
          {copy.skip}
        </button>
        {state.stepIndex === demoStepIds.length - 1 ? (
          <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
            <RotateCcw aria-hidden="true" />
            {copy.reset}
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: 'NEXT' })}>
            {copy.next}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
