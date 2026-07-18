import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useContextRecovery } from './useContextRecovery'

function RecoveryHarness({
  epoch,
  onContextLoss,
}: {
  readonly epoch: number
  readonly onContextLoss: () => void
}) {
  const recoveryRef = useContextRecovery(onContextLoss)

  return <canvas data-testid="recovery-canvas" key={epoch} ref={recoveryRef} />
}

describe('useContextRecovery', () => {
  it('handles context loss immediately across canvas replacements', () => {
    const onContextLoss = vi.fn()
    const view = render(
      <RecoveryHarness epoch={0} onContextLoss={onContextLoss} />,
    )

    const firstCanvas = screen.getByTestId('recovery-canvas')
    expect(
      firstCanvas.dispatchEvent(
        new Event('webglcontextlost', { cancelable: true }),
      ),
    ).toBe(false)

    view.rerender(<RecoveryHarness epoch={1} onContextLoss={onContextLoss} />)
    const secondCanvas = screen.getByTestId('recovery-canvas')
    expect(secondCanvas).not.toBe(firstCanvas)
    expect(
      secondCanvas.dispatchEvent(
        new Event('webglcontextlost', { cancelable: true }),
      ),
    ).toBe(false)
    expect(onContextLoss).toHaveBeenCalledTimes(2)
  })
})
