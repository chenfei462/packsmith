import type { RouteSceneInput } from '../types'
import '../experience.css'

export function FallbackStage({ scene }: { readonly scene: RouteSceneInput }) {
  return (
    <div
      aria-hidden="true"
      className={`fallback-stage fallback-stage--${scene.scene}`}
      data-experience-tier="fallback"
      data-experience-scene={scene.scene}
    >
      <div className="fallback-grid" />
      <div className="fallback-artifact">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="fallback-scan" />
    </div>
  )
}
