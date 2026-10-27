import { expect, type ConsoleMessage, type Page } from '@playwright/test'

export interface BrowserError {
  readonly kind: 'console' | 'pageerror'
  readonly message: string
}

export interface ConsoleGuard {
  readonly errors: readonly BrowserError[]
  readonly expectNoErrors: () => void
}

function consoleError(message: ConsoleMessage): BrowserError {
  const location = message.location()
  const source = location.url
    ? ` (${location.url}:${location.lineNumber ?? 0})`
    : ''

  return {
    kind: 'console',
    message: `${message.text()}${source}`,
  }
}

export function installConsoleGuard(page: Page): ConsoleGuard {
  const errors: BrowserError[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(consoleError(message))
  })
  page.on('pageerror', (error) => {
    errors.push({ kind: 'pageerror', message: error.stack ?? error.message })
  })

  return {
    errors,
    expectNoErrors() {
      expect(errors, errors.map(({ kind, message }) => `${kind}: ${message}`).join('\n')).toEqual([])
    },
  }
}
