import type { ReactNode } from 'react'

import { ExperienceProvider } from '../experience/ExperienceProvider'
import { LanguageProvider } from '../i18n/LanguageProvider'

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <LanguageProvider>
      <ExperienceProvider>{children}</ExperienceProvider>
    </LanguageProvider>
  )
}
