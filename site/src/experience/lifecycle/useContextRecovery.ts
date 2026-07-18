import { useCallback, useRef, type RefCallback } from 'react'

export type ContextLossAction = 'recover' | 'fallback'

export function contextLossAction(previousLosses: number): ContextLossAction {
  return previousLosses === 0 ? 'recover' : 'fallback'
}

export function useContextRecovery(
  onContextLoss: () => void,
): RefCallback<HTMLCanvasElement> {
  const detach = useRef<() => void>(() => undefined)

  return useCallback((canvas) => {
    detach.current()
    detach.current = () => undefined
    if (!canvas) return

    function handleLoss(event: Event) {
      event.preventDefault()
      onContextLoss()
    }

    canvas.addEventListener('webglcontextlost', handleLoss)
    detach.current = () =>
      canvas.removeEventListener('webglcontextlost', handleLoss)
  }, [onContextLoss])
}
