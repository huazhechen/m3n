import { useLayoutEffect, useRef } from 'react'
import type { ChangeEventHandler, FocusEventHandler, ReactEventHandler, ReactNode, RefObject } from 'react'

type SourceEditorProps = {
  value: string
  ariaLabel: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  onFocus?: FocusEventHandler<HTMLTextAreaElement>
  onSelect?: ReactEventHandler<HTMLTextAreaElement>
  onBlur?: FocusEventHandler<HTMLTextAreaElement>
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  invalidBarEnds?: number[]
}

function highlightedSource(value: string, invalidBarEnds: number[]) {
  const ends = new Set(invalidBarEnds)
  const fragments: ReactNode[] = []
  let index = 0
  let key = 0
  while (index < value.length) {
    const barStart = value.indexOf('|', index)
    if (barStart === -1) {
      fragments.push(value.slice(index))
      break
    }
    if (barStart > index) fragments.push(value.slice(index, barStart))
    let barEnd = barStart + 1
    while (value[barEnd] === '|') barEnd += 1
    const bar = value.slice(barStart, barEnd)
    fragments.push(ends.has(barEnd)
      ? <mark className="invalid-barline" key={key++}>{bar}</mark>
      : bar)
    index = barEnd
  }
  return fragments
}

export function SourceEditor({
  value,
  ariaLabel,
  onChange,
  onFocus,
  onSelect,
  onBlur,
  textareaRef,
  invalidBarEnds = [],
}: SourceEditorProps) {
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const lines = Array.from(
    { length: value.split('\n').length },
    (_item, index) => String(index + 1),
  ).join('\n')

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const portraitQuery = window.matchMedia('(orientation: portrait)')
    const resize = () => {
      if (!portraitQuery.matches) {
        editor.style.height = ''
        return
      }

      editor.style.height = 'auto'
      editor.style.height = `${editor.scrollHeight}px`
    }

    resize()
    portraitQuery.addEventListener('change', resize)
    window.addEventListener('resize', resize)
    return () => {
      portraitQuery.removeEventListener('change', resize)
      window.removeEventListener('resize', resize)
    }
  }, [value])

  return (
    <div className="source-editor">
      <div ref={lineNumbersRef} className="line-numbers" aria-hidden="true">{lines}</div>
      <div className="source-editor-stack">
      <pre ref={highlightRef} className="source-highlight" aria-hidden="true">{highlightedSource(value, invalidBarEnds)}</pre>
      <textarea
        ref={(element) => {
          editorRef.current = element
          if (textareaRef) {
            textareaRef.current = element
          }
        }}
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onSelect={onSelect}
        onScroll={(event) => {
          if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop
          }
          if (highlightRef.current) {
            highlightRef.current.style.transform = `translate(${-event.currentTarget.scrollLeft}px, ${-event.currentTarget.scrollTop}px)`
          }
        }}
        onBlur={onBlur}
        aria-label={ariaLabel}
      />
      </div>
    </div>
  )
}
