import { render } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  type InitialEntry,
} from 'react-router-dom'

import { appRoutes } from '../app/routes'

export function renderAppRoute(
  initialEntry: InitialEntry,
  { width = 1440 }: { readonly width?: number } = {},
) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))

  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  })

  return {
    router,
    ...render(<RouterProvider router={router} />),
  }
}
