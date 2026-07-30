import { useLayoutEffect, useRef } from 'react'
import type { ChangeEventHandler, FocusEventHandler, ReactEventHandler, RefObject } from 'react'

type SourceEditorProps = {
  value: string
  ariaLabel: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  onSelect?: ReactEventHandler<HTMLTextAreaElement>
  onBlur?: FocusEventHandler<HTMLTextAreaElement>
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export function SourceEditor({
  value,
  ariaLabel,
  onChange,
  onSelect,
  onBlur,
  textareaRef,
}: SourceEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const lines = Array.from(
    { length: value.split('\n').length },
    (_item, index) => String(index + 1),
  ).join('\n')

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const textarea = internalTextareaRef.current
    if (!wrapper || !textarea) {
      return
    }

    const resize = () => {
      textarea.style.height = '0px'
      textarea.style.height = `${textarea.scrollHeight}px`
      textarea.style.width = '0px'
      textarea.style.width = `${Math.max(textarea.scrollWidth, wrapper.clientWidth)}px`
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [value])

  return (
    <div className="source-editor">
      <div className="line-numbers" aria-hidden="true">{lines}</div>
      <div ref={wrapperRef} className="textarea-scroll-wrapper">
        <textarea
          ref={(element) => {
            internalTextareaRef.current = element
            if (textareaRef) {
              textareaRef.current = element
            }
          }}
          spellCheck={false}
          wrap="off"
          value={value}
          onChange={onChange}
          onSelect={onSelect}
          onBlur={onBlur}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  )
}
