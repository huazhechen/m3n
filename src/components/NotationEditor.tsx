import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m3nToAbc } from '../lib/m3n-abc'
import { validateM3N } from '../lib/m3n-validate'
import { sampleM3N } from '../lib/samples'
import { ScoreRenderer } from './ScoreRenderer'
import type { ScoreRendererRef } from './ScoreRenderer'

type NotationEditorProps = {
  initialSource?: string
  embedded?: boolean
}

export function NotationEditor({
  initialSource = sampleM3N,
  embedded = false,
}: NotationEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const [isAbcDialogOpen, setIsAbcDialogOpen] = useState(false)
  const lineNumberRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollWrapperRef = useRef<HTMLDivElement>(null)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)
  const result = useMemo(() => {
    const conv = m3nToAbc(source)
    conv.diagnostics.push(...validateM3N(source))
    return conv
  }, [source])
  const lineNumbers = useMemo(
    () =>
      Array.from({ length: source.split('\n').length }, (_item, index) => String(index + 1)).join(
        '\n',
      ),
    [source],
  )
  const abc = result.output
  const cursorScoreRange = useMemo(() => {
    const mappedRange = result.sourceMap
      ?.filter((item) => item.sourceStart < cursorPosition)
      .at(-1)
    return mappedRange
      ? { startChar: mappedRange.outputStart, endChar: mappedRange.outputEnd }
      : null
  }, [cursorPosition, result.sourceMap])
  const activeScoreRange = isCursorHighlightActive ? cursorScoreRange : null

  const updateCursorPosition = useCallback((position: number) => {
    setCursorPosition(position)
    setIsCursorHighlightActive(true)
  }, [])

  const syncTextareaSize = useCallback(() => {
    const textarea = textareaRef.current
    const wrapper = scrollWrapperRef.current
    if (!textarea || !wrapper) return
    // Auto-expand height to fit content
    textarea.style.height = '0px'
    const contentHeight = textarea.scrollHeight
    textarea.style.height = `${contentHeight}px`
    // Auto-expand width when content is wider than wrapper
    const wrapperWidth = wrapper.clientWidth
    textarea.style.width = '0px'
    const contentWidth = textarea.scrollWidth
    textarea.style.width = `${Math.max(contentWidth, wrapperWidth)}px`
  }, [])

  useEffect(() => {
    syncTextareaSize()
    const handleResize = () => syncTextareaSize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [syncTextareaSize, source])

  const placeCursorAfterScoreNote = useCallback(
    ({ startChar, endChar }: { startChar: number; endChar: number }) => {
      const textarea = textareaRef.current
      const sourcePosition = result.sourceMap?.find(
        (item) => startChar < item.outputEnd && endChar > item.outputStart,
      )?.sourceEnd
      if (sourcePosition === undefined) {
        return
      }

      textarea?.setSelectionRange(sourcePosition, sourcePosition)
      updateCursorPosition(sourcePosition)
    },
    [result.sourceMap, updateCursorPosition],
  )

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

      const mappedRange = result.sourceMap?.find(
        (item) => startChar < item.outputEnd && endChar > item.outputStart,
      )
      if (!mappedRange) {
        return
      }

      textarea.setSelectionRange(mappedRange.sourceStart, mappedRange.sourceEnd)
    },
    [result.sourceMap],
  )

  const copyAbc = async () => {
    await navigator.clipboard.writeText(result.output)
    setIsAbcDialogOpen(false)
  }

  return (
    <div className={embedded ? 'editor-container embedded' : 'editor-container'}>
      <header className="editor-header">
        <div className="editor-header-left">
          <h2>编辑器</h2>
        </div>
        <div className="editor-header-right">
          <button type="button" className="action-button" onClick={() => setIsAbcDialogOpen(true)}>ABC</button>
          <button type="button" className="action-button" onClick={() => scoreRendererRef.current?.openExport()}>打印</button>
        </div>
      </header>
      <div className="editor-body">
        <section className="editor-pane">
          <div className="source-editor">
            <div ref={lineNumberRef} className="line-numbers" aria-hidden="true">
              {lineNumbers}
            </div>
            <div ref={scrollWrapperRef} className="textarea-scroll-wrapper">
              <textarea
                ref={textareaRef}
                spellCheck={false}
                wrap="off"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                  updateCursorPosition(event.target.selectionStart)
                  syncTextareaSize()
                }}
                onSelect={(event) => updateCursorPosition(event.currentTarget.selectionStart)}
                onBlur={() => setIsCursorHighlightActive(false)}
                aria-label="M3N source"
              />
            </div>
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
          <ScoreRenderer
            ref={scoreRendererRef}
            abc={abc}
            compact={embedded}
            activeRange={activeScoreRange}
            onActiveRange={highlightSourceRange}
            onNoteClick={placeCursorAfterScoreNote}
            onPaperBlur={() => setIsCursorHighlightActive(false)}
            showPrintButton={false}
          />
        </section>
      </div>

      {isAbcDialogOpen && (
        <div className="converter-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsAbcDialogOpen(false)
        }}>
          <section className="converter-dialog" role="dialog" aria-modal="true" aria-labelledby="abc-result-title">
            <div className="converter-dialog-header">
              <h2 id="abc-result-title">ABC 内容</h2>
              <button type="button" className="action-button" aria-label="关闭" onClick={() => setIsAbcDialogOpen(false)}>关闭</button>
            </div>
            <textarea className="converter-result" readOnly spellCheck={false} value={result.output} aria-label="ABC 内容" />
            <div className="converter-dialog-actions">
              <button type="button" className="action-button" onClick={() => void copyAbc()}>一键复制</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
