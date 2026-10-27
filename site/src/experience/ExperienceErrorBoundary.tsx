import { Component, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'

import { FallbackStage } from './fallback/FallbackStage'
import type { RouteSceneInput } from './types'

interface ExperienceErrorBoundaryProps {
  readonly children: ReactNode
  readonly scene: RouteSceneInput
  readonly onRetry: () => void
}

interface ExperienceErrorBoundaryState {
  readonly failed: boolean
}

export class ExperienceErrorBoundary extends Component<
  ExperienceErrorBoundaryProps,
  ExperienceErrorBoundaryState
> {
  state: ExperienceErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ExperienceErrorBoundaryState {
    return { failed: true }
  }

  private retry = () => {
    this.props.onRetry()
    this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <>
        <FallbackStage scene={this.props.scene} />
        {createPortal(
          <div className="experience-error" role="status">
            <span>3D scene unavailable.</span>
            <button type="button" onClick={this.retry}>
              <RefreshCw aria-hidden="true" size={16} />
              Retry 3D
            </button>
          </div>,
          document.body,
        )}
      </>
    )
  }
}
