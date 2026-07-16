import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function RouteFocusManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    function focusRouteHeading() {
      const heading = document.querySelector<HTMLElement>('#main-content h1')

      if (!heading) {
        return false
      }

      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
      return true
    }

    if (focusRouteHeading()) {
      return
    }

    const observer = new MutationObserver(() => {
      if (focusRouteHeading()) {
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [pathname])

  return null
}
