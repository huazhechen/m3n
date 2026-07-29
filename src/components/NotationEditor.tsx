import { useCallback, useMemo, useRef, useState } from 'react'
import { convertNotation, type NotationMode } from '../lib/m3n-abc'
import { sampleM3N } from '../lib/samples'
import { ScoreRenderer } from './ScoreRenderer'

type NotationEditorProps = {
  initialMode?: NotationMode
  initialSource?: string
  embedded?: boolean
}

export function NotationEditor({
  initialMode = 'm3n',
  initialSource = sampleM3N,
  embedded = false,
}: NotationEditorProps) {
  const [mode, setMode] = useState<NotationMode>(initialMode)
  const [source, setSource] = useState(initialSource)
  const lineNumberRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const result = useMemo(() => convertNotation(source, mode), [source, mode])
  const lineNumbers = useMemo(
    () =>
      Array.from({ length: source.split('\n').length }, (_item, index) => String(index + 1)).join(
        '\n',
      ),
    [source],
  )
  const abc = mode === 'm3n' ? result.output : source
  const otherMode: NotationMode = mode === 'm3n' ? 'abc' : 'm3n'

  const switchMode = () => {
    const converted = convertNotation(source, mode)
    setMode(otherMode)
    setSource(converted.output)
  }

  const highlightSourceRange = useCallback(
    (range: { startChar?: number; endChar?: number } | null) => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      if (!range || range.startChar === undefined || range.endChar === undefined) {
        textarea.setSelectionRange(textarea.selectionStart, textarea.selectionStart)
        return
      }
      const { startChar, endChar } = range

      if (mode === 'abc') {
        textarea.focus({ preventScroll: true })
        textarea.setSelectionRange(startChar, endChar)
        return
      }

      const mappedRange = result.sourceMap?.find(
        (item) => startChar < item.outputEnd && endChar > item.outputStart,
      )
      if (!mappedRange) {
        return
      }

      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(mappedRange.sourceStart, mappedRange.sourceEnd)
    },
    [mode, result.sourceMap],
  )

  return (
    <div className={embedded ? 'editor-grid embedded' : 'editor-grid'}>
      <section className="editor-pane">
        <div className="pane-toolbar">
          <div>
            <span className="eyebrow">文本编辑器</span>
            <h2>{mode === 'm3n' ? 'M3N' : 'ABC Notation'}</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button" onClick={switchMode}>
              转为 {otherMode === 'm3n' ? 'M3N' : 'ABC'}
            </button>
          </div>
        </div>
        <div className="source-editor">
          <div ref={lineNumberRef} className="line-numbers" aria-hidden="true">
            {lineNumbers}
          </div>
          <textarea
            ref={textareaRef}
            spellCheck={false}
            wrap="off"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onScroll={(event) => {
              if (lineNumberRef.current) {
                lineNumberRef.current.scrollTop = event.currentTarget.scrollTop
              }
            }}
            aria-label={`${mode} source`}
          />
        </div>
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics">
            {result.diagnostics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="render-pane">
        <div className="pane-toolbar">
          <div>
            <span className="eyebrow">abcjs 渲染</span>
            <h2>标准五线谱</h2>
          </div>
        </div>
        <ScoreRenderer abc={abc} compact={embedded} onActiveRange={highlightSourceRange} />
      </section>
    </div>
  )
}
