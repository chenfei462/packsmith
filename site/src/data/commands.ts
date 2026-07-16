import type { RuntimeId, SitePack } from './types'

export function buildInstallCommand(
  pack: SitePack,
  targetId: RuntimeId,
): string {
  if (pack.previews[targetId]?.status !== 'preview-ready') {
    throw new Error(
      `Install command is not available for ${pack.id} on ${targetId}.`,
    )
  }

  return `node src/cli.mjs install ${pack.id} --target ${targetId} --yes`
}
