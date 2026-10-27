import type { ReactNode } from 'react'

export function Status({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return <span className={`status status--${tone}`}>{children}</span>
}
