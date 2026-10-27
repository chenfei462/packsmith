import type { CSSProperties } from 'react'

export function PackDetailFallback() {
  return (
    <div
      className="fallback-composition fallback-pack-passport"
      data-fallback-composition="pack-passport"
    >
      <div className="fallback-grid" />
      <div className="fallback-pack-passport__layers">
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            style={{ '--passport-layer': index } as CSSProperties}
          >
            <i />
            <b />
            <b />
            <b />
          </span>
        ))}
      </div>
      <div className="fallback-pack-passport__axis" />
    </div>
  )
}
