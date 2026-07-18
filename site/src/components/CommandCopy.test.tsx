import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandCopy } from './CommandCopy'

const command = 'node src/cli.mjs audit --ci'
const manualCopyMessage =
  'Command selected. Press Ctrl+C or Command+C to copy.'
const writeText = vi.fn(() => Promise.resolve())

function renderCommandCopy() {
  return render(
    <CommandCopy
      command={command}
      copiedLabel="Command copied"
      copyLabel="Copy command"
      fallbackLabel={manualCopyMessage}
      selectedCommandLabel="Selected command"
    />,
  )
}

function commandCopy(commandValue: string) {
  return (
    <CommandCopy
      command={commandValue}
      copiedLabel="Command copied"
      copyLabel="Copy command"
      fallbackLabel={manualCopyMessage}
      selectedCommandLabel="Selected command"
    />
  )
}

beforeEach(() => {
  writeText.mockReset()
  writeText.mockResolvedValue(undefined)
})

describe('CommandCopy', () => {
  it('copies with the Clipboard API and announces success without replacing the button', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderCommandCopy()
    const button = screen.getByRole('button', { name: 'Copy command' })

    await user.click(button)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(command))
    expect(screen.getByRole('button', { name: 'Command copied' })).toBe(button)
    expect(screen.getByRole('status')).toHaveTextContent('Command copied')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('focuses and selects a readonly command when Clipboard permission is rejected', async () => {
    const user = userEvent.setup()
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderCommandCopy()

    await user.click(screen.getByRole('button', { name: 'Copy command' }))

    const fallback = await screen.findByRole('textbox', {
      name: 'Selected command',
    })
    expect(fallback).toHaveAttribute('readonly')
    expect(fallback).toHaveValue(command)
    expect(fallback).toHaveFocus()
    expect(fallback).toHaveProperty('selectionStart', 0)
    expect(fallback).toHaveProperty('selectionEnd', command.length)
    expect(screen.getByRole('status')).toHaveTextContent(manualCopyMessage)
  })

  it('uses the same selection fallback when the Clipboard API is unavailable', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    renderCommandCopy()

    await user.click(screen.getByRole('button', { name: 'Copy command' }))

    expect(
      await screen.findByRole('textbox', { name: 'Selected command' }),
    ).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent(manualCopyMessage)
  })

  it('resets copied feedback when the command changes', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const view = render(commandCopy(command))

    await user.click(screen.getByRole('button', { name: 'Copy command' }))
    await screen.findByRole('button', { name: 'Command copied' })

    view.rerender(commandCopy('node src/cli.mjs audit --target claude'))

    expect(screen.getByRole('button', { name: 'Copy command' })).toBeEnabled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    view.rerender(commandCopy(command))

    expect(screen.getByRole('button', { name: 'Copy command' })).toBeEnabled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('dismisses manual selection when the command changes', async () => {
    const user = userEvent.setup()
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const view = render(commandCopy(command))

    await user.click(screen.getByRole('button', { name: 'Copy command' }))
    await screen.findByRole('textbox', { name: 'Selected command' })

    view.rerender(commandCopy('node src/cli.mjs audit --target claude'))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    view.rerender(commandCopy(command))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('ignores a clipboard result after the command changes', async () => {
    const user = userEvent.setup()
    let resolveCopy: () => void = () => undefined
    writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCopy = () => resolve()
      }),
    )
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const view = render(commandCopy(command))

    await user.click(screen.getByRole('button', { name: 'Copy command' }))
    view.rerender(commandCopy('node src/cli.mjs audit --target claude'))
    await act(async () => resolveCopy())
    view.rerender(commandCopy(command))

    expect(screen.getByRole('button', { name: 'Copy command' })).toBeEnabled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
