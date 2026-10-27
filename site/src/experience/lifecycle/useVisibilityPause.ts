import { useEffect } from 'react'

import { sceneStore } from '../sceneStore'

export function useVisibilityPause() {
  useEffect(() => {
    function syncVisibility() {
      sceneStore.getState().setPaused(document.visibilityState === 'hidden')
    }

    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () =>
      document.removeEventListener('visibilitychange', syncVisibility)
  }, [])
}
