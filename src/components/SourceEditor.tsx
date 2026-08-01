import { useLayoutEffect, useRef } from 'react'
import type { ChangeEventHandler, FocusEventHandler, ReactEventHandler, RefObject } from 'react'

type SourceEditorProps = {
  value: string
  ariaLabel: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  onFocus?: FocusEventHandler<HTMLTextAreaElement>
  onSelect?: ReactEventHandler<HTMLTextAreaElement>
  onBlur?: FocusEventHandler<HTMLTextAreaElement>
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  readOnly?: boolean
}

export function SourceEditor({
  value,
  ariaLabel,
  onChange,
  onFocus,
  onSelect,
  onBlur,
  textareaRef,
  readOnly = false,
}: SourceEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null)

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
      <textarea
        ref={(element) => {
          editorRef.current = element
          if (textareaRef) {
            textareaRef.current = element
          }
        }}
        spellCheck={false}
        readOnly={readOnly}
        wrap="off"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onSelect={onSelect}
        onBlur={onBlur}
        aria-label={ariaLabel}
      />
    </div>
  )
}
