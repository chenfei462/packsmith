import { Outlet, useLocation } from 'react-router-dom'

import { Navigation } from '../components/Navigation'
import { ExperienceSlot } from '../experience/ExperienceSlot'
import { useLanguage } from '../i18n/useLanguage'
import { RouteFocusManager } from './RouteFocusManager'

export function AppShell() {
  const { pathname } = useLocation()
  const { t } = useLanguage()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <Navigation />
      <div id="experience-root">
        <ExperienceSlot />
      </div>
      <RouteFocusManager />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <p className="sr-only" role="status" aria-live="polite">
        {pathname}
      </p>
    </div>
  )
}
