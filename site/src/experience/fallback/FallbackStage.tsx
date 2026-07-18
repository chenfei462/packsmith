import type { RouteSceneInput } from '../types'
import { DocsPipelineFallback } from './DocsPipelineFallback'
import { HomeForgeFallback } from './HomeForgeFallback'
import { PackDetailFallback } from './PackDetailFallback'
import { RegistryFieldFallback } from './RegistryFieldFallback'
import '../experience.css'

function RouteFallback({ scene }: { readonly scene: RouteSceneInput }) {
  if (scene.scene === 'registry') return <RegistryFieldFallback />
  if (scene.scene === 'pack-detail') return <PackDetailFallback />
  if (scene.scene === 'docs') return <DocsPipelineFallback />
  return <HomeForgeFallback />
}

export function FallbackStage({ scene }: { readonly scene: RouteSceneInput }) {
  return (
    <div
      aria-hidden="true"
      className={`fallback-stage fallback-stage--${scene.scene}`}
      data-experience-tier="fallback"
      data-experience-scene={scene.scene}
      data-scene-phase="stable"
      data-scene-ready="true"
    >
      <RouteFallback scene={scene} />
    </div>
  )
}
