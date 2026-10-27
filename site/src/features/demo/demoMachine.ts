import { buildInstallCommand } from '../../data/commands'
import { repositoryData } from '../../data/repositoryData'
import { getPackById } from '../../data/selectors'
import type { RuntimeId, SitePack } from '../../data/types'

export const demoStepIds = [
  'search',
  'passport',
  'preview',
  'target',
  'install',
  'use',
] as const

export type DemoStepId = (typeof demoStepIds)[number]

export interface DemoState {
  readonly stepIndex: number
  readonly stepId: DemoStepId
  readonly packId: string
  readonly targetId: RuntimeId
}

export type DemoAction =
  | { readonly type: 'NEXT' }
  | { readonly type: 'BACK' }
  | { readonly type: 'SKIP' }
  | { readonly type: 'SELECT_PACK'; readonly packId: string }
  | { readonly type: 'SELECT_TARGET'; readonly targetId: RuntimeId }
  | { readonly type: 'RESET' }

function requirePack(packId: string): SitePack {
  const pack = getPackById(repositoryData.packs, packId)

  if (!pack) {
    throw new Error(`Unknown Pack: ${packId}`)
  }

  return pack
}

function readyTarget(pack: SitePack, preferred?: RuntimeId): RuntimeId {
  if (preferred && pack.previews[preferred]?.status === 'preview-ready') {
    return preferred
  }

  const targetId = repositoryData.supportedTargetIds.find(
    (candidate) => pack.previews[candidate]?.status === 'preview-ready',
  )

  if (!targetId) {
    throw new Error(`No install preview is available for ${pack.id}.`)
  }

  return targetId
}

function withStep(state: DemoState, stepIndex: number): DemoState {
  const boundedIndex = Math.max(0, Math.min(demoStepIds.length - 1, stepIndex))
  return {
    ...state,
    stepIndex: boundedIndex,
    stepId: demoStepIds[boundedIndex],
  }
}

export function createDemoState(
  packId = 'senior-code-reviewer',
  targetId: RuntimeId = 'codex',
): DemoState {
  const pack = requirePack(packId)
  const validatedTarget = readyTarget(pack, targetId)

  return {
    stepIndex: 0,
    stepId: demoStepIds[0],
    packId,
    targetId: validatedTarget,
  }
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'NEXT') {
    return withStep(state, state.stepIndex + 1)
  }

  if (action.type === 'BACK') {
    return withStep(state, state.stepIndex - 1)
  }

  if (action.type === 'SKIP') {
    return withStep(state, demoStepIds.indexOf('install'))
  }

  if (action.type === 'SELECT_PACK') {
    const pack = requirePack(action.packId)
    return {
      ...state,
      packId: pack.id,
      targetId: readyTarget(pack, state.targetId),
    }
  }

  if (action.type === 'SELECT_TARGET') {
    const pack = requirePack(state.packId)
    buildInstallCommand(pack, action.targetId)
    return { ...state, targetId: action.targetId }
  }

  return createDemoState()
}

export function deriveDemoCommand(state: DemoState): string {
  return buildInstallCommand(requirePack(state.packId), state.targetId)
}
