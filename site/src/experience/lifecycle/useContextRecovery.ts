import { useEffect } from 'react'

export function useContextRecovery(
  canvas: HTMLCanvasElement | null,
  onContextLoss: () => void,
) {
  useEffect(() => {
    if (!canvas) {
      return
    }

    function handleLoss(event: Event) {
      event.preventDefault()
      onContextLoss()
    }

    canvas.addEventListener('webglcontextlost', handleLoss)
    return () => canvas.removeEventListener('webglcontextlost', handleLoss)
  }, [canvas, onContextLoss])
}
