import type { RouteObject } from 'react-router-dom'
import { createBrowserRouter } from 'react-router-dom'

import { AppProviders } from './AppProviders'
import { AppShell } from './AppShell'
import { RouteErrorPage } from './RouteErrorPage'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AppProviders>
        <AppShell />
      </AppProviders>
    ),
    errorElement: (
      <AppProviders>
        <RouteErrorPage />
      </AppProviders>
    ),
    children: [
      { index: true, lazy: () => import('../pages/HomePage') },
      { path: 'registry', lazy: () => import('../pages/RegistryPage') },
      {
        path: 'registry/:packId',
        lazy: () => import('../pages/PackDetailPage'),
      },
      { path: 'docs', lazy: () => import('../pages/DocsPage') },
    ],
  },
]

export function normalizeBasename(baseUrl: string): string {
  const normalized = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
  return normalized.replace(/\/+$/, '') || '/'
}

export function createAppRouter() {
  return createBrowserRouter(appRoutes, {
    basename: normalizeBasename(import.meta.env.BASE_URL),
  })
}
