import { useContext } from 'react'

import { ExperienceContext } from './ExperienceContext'

export function useExperience() {
  const context = useContext(ExperienceContext)

  if (!context) {
    throw new Error('useExperience must be used inside ExperienceProvider.')
  }

  return context
}
