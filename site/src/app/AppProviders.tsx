import type { ReactNode } from 'react'

import { LanguageProvider } from '../i18n/LanguageProvider'

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
