import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
} from 'react'
import { useStore } from 'zustand'

import { ExperienceErrorBoundary } from './ExperienceErrorBoundary'
import { FallbackStage } from './fallback/FallbackStage'
import { sceneStore } from './sceneStore'

type ModuleState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly Component: ComponentType }
  | { readonly status: 'failed'; readonly error: unknown }

function ExperienceModule({ scene }: { readonly scene: ReturnType<typeof sceneStore.getState>['active'] }) {
  const [moduleState, setModuleState] = useState<ModuleState>({
    status: 'loading',
  })

  useEffect(() => {
    let current = true

    void import('./ExperienceCanvas').then(
      (module) => {
        if (current) {
          setModuleState({
            status: 'ready',
            Component: module.ExperienceCanvas,
          })
        }
      },
      (error: unknown) => {
        if (current) {
          setModuleState({ status: 'failed', error })
        }
      },
    )

    return () => {
      current = false
    }
  }, [])

  if (moduleState.status === 'failed') {
    throw moduleState.error
  }

  return moduleState.status === 'ready'
    ? createElement(moduleState.Component)
    : <FallbackStage scene={scene} />
}

export function ExperienceSlot() {
  const [retryKey, setRetryKey] = useState(0)
  const active = useStore(sceneStore, (state) => state.active)

  return (
    <ExperienceErrorBoundary
      scene={active}
      onRetry={() => setRetryKey((current) => current + 1)}
    >
      <ExperienceModule key={retryKey} scene={active} />
    </ExperienceErrorBoundary>
  )
}
