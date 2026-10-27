import { buildInstallCommand } from '../../data/commands'
import type { RuntimeId, SitePack, TargetPreview } from '../../data/types'

export interface PackDetailModel {
  readonly pack: SitePack
  readonly targetId: RuntimeId
  readonly preview: TargetPreview
  readonly available: boolean
  readonly installCommand?: string
}

function isPackTarget(
  pack: SitePack,
  targetId: string,
): targetId is RuntimeId {
  return Object.prototype.hasOwnProperty.call(pack.previews, targetId)
}

export function createPackDetailModel(
  packs: readonly SitePack[],
  packId: string,
  requestedTargetId?: string | null,
): PackDetailModel {
  const pack = packs.find((candidate) => candidate.id === packId)

  if (!pack) {
    throw new Response('Pack not found', { status: 404 })
  }

  const requestedTarget =
    requestedTargetId && isPackTarget(pack, requestedTargetId)
      ? requestedTargetId
      : undefined
  const firstReadyTarget = Object.values(pack.previews).find(
    (preview) => preview.status === 'preview-ready',
  )?.targetId
  const targetId = requestedTarget ?? firstReadyTarget

  if (!targetId) {
    throw new Error(`Pack "${pack.id}" has no preview-ready targets.`)
  }

  const preview = pack.previews[targetId]
  const available = preview.status === 'preview-ready'

  return {
    pack,
    targetId,
    preview,
    available,
    installCommand: available
      ? buildInstallCommand(pack, targetId)
      : undefined,
  }
}
