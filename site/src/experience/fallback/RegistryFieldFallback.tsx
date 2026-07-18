import type { CSSProperties } from 'react'

const fieldNodes = [
  [-44, -30, 0.72], [-30, -12, 0.9], [-15, -34, 0.62], [0, -18, 1.1],
  [18, -38, 0.7], [35, -16, 0.92], [47, -32, 0.58], [-40, 4, 0.66],
  [-25, 20, 1.08], [-8, 5, 0.78], [10, 18, 0.94], [28, 4, 0.7],
  [44, 24, 1.02], [-36, 42, 0.78], [-18, 36, 0.64], [2, 48, 0.9],
  [22, 38, 0.72], [40, 48, 0.84],
] as const

export function RegistryFieldFallback() {
  return (
    <div
      className="fallback-composition fallback-registry-field"
      data-fallback-composition="registry-field"
    >
      <div className="fallback-grid" />
      <div className="fallback-registry-field__plane">
        <i className="fallback-registry-field__axis fallback-registry-field__axis--a" />
        <i className="fallback-registry-field__axis fallback-registry-field__axis--b" />
        <i className="fallback-registry-field__axis fallback-registry-field__axis--c" />
        {fieldNodes.map(([x, y, scale], index) => (
          <span
            className={index % 7 === 0 ? 'is-risk' : index % 5 === 0 ? 'is-focus' : ''}
            key={index}
            style={
              {
                '--field-x': `${x}%`,
                '--field-y': `${y}%`,
                '--field-scale': scale,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}
