import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

type CopyState = 'idle' | 'copied' | 'fallback'

export interface CommandCopyProps {
  readonly command: string
  readonly copiedLabel: string
  readonly copyLabel: string
  readonly fallbackLabel: string
  readonly selectedCommandLabel: string
  readonly className?: string
  readonly showPrompt?: boolean
}

function CommandCopyControl({
  command,
  copiedLabel,
  copyLabel,
  fallbackLabel,
  selectedCommandLabel,
  className = '',
  showPrompt = false,
}: CommandCopyProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const selection = useRef<HTMLInputElement>(null)
  const resetTimer = useRef<number>(0)
  const requestVersion = useRef(0)

  useLayoutEffect(() => {
    if (copyState !== 'fallback') return
    selection.current?.focus()
    selection.current?.select()
  }, [copyState])

  useEffect(
    () => () => {
      requestVersion.current += 1
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
    },
    [],
  )

  const copyCommand = async () => {
    const requestId = requestVersion.current + 1
    requestVersion.current = requestId

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(command)
      if (requestVersion.current !== requestId) return
      setCopyState('copied')
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = 0
        setCopyState('idle')
      }, 1800)
    } catch {
      if (requestVersion.current !== requestId) return
      if (resetTimer.current) window.clearTimeout(resetTimer.current)
      resetTimer.current = 0
      setCopyState('fallback')
    }
  }

  const copied = copyState === 'copied'
  const fallback = copyState === 'fallback'
  const announcement = copied ? copiedLabel : fallback ? fallbackLabel : ''

  return (
    <div
      className={`command-copy ${className}`.trim()}
      data-copy-state={copyState}
    >
      {showPrompt ? (
        <span aria-hidden="true" className="command-copy__prompt">
          $
        </span>
      ) : null}
      <div className="command-copy__value">
        {fallback ? (
          <input
            aria-label={selectedCommandLabel}
            className="command-copy__selection"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            ref={selection}
            value={command}
          />
        ) : (
          <code>{command}</code>
        )}
      </div>
      <button
        aria-label={copied ? copiedLabel : copyLabel}
        className="command-copy__button"
        onClick={() => void copyCommand()}
        title={copyLabel}
        type="button"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span
        aria-live="polite"
        className="command-copy__feedback"
        role="status"
      >
        {announcement}
      </span>
    </div>
  )
}

export function CommandCopy(props: CommandCopyProps) {
  return <CommandCopyControl key={props.command} {...props} />
}
