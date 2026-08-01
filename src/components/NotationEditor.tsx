import { useCallback, useMemo, useRef, useState } from 'react'
import { m3nToMei } from '../lib/m3n-mei'
import { invalidMeasureIds as findInvalidMeasureIds, validateM3N } from '../lib/m3n-validate'
import defaultScore from '../scores/07_00001.m3n?raw'
import { ScoreRenderer } from './ScoreRenderer'
import type { ScoreRendererRef } from './ScoreRenderer'
import { SourceEditor } from './SourceEditor'

type NotationEditorProps = {
  initialSource?: string
  embedded?: boolean
}

export function NotationEditor({ initialSource = defaultScore, embedded = false }: NotationEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const [isMeiDialogOpen, setIsMeiDialogOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)
  const result = useMemo(() => {
    const conversion = m3nToMei(source)
    return {
      ...conversion,
      diagnostics: [...conversion.diagnostics, ...validateM3N(source)],
    }
  }, [source])
  const invalidMeasureIds = useMemo(() => findInvalidMeasureIds(source), [source])
  const cursorXmlId = useMemo(() => {
    const containingRange = result.sourceMap.find((item) => (
      item.sourceStart <= cursorPosition && cursorPosition < item.sourceEnd
    ))
    return containingRange?.xmlId ?? result.sourceMap
      .filter((item) => item.sourceStart < cursorPosition)
      .at(-1)?.xmlId ?? null
  }, [cursorPosition, result.sourceMap])
  const activeXmlId = isCursorHighlightActive ? cursorXmlId : null

  const updateCursorPosition = useCallback((position: number) => {
    setCursorPosition(position)
    setIsCursorHighlightActive(true)
  }, [])

  const selectScoreNoteInSource = useCallback((xmlId: string) => {
    const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
    const textarea = textareaRef.current
    if (!mappedRange || !textarea) return

    const sourceLine = source.slice(0, mappedRange.sourceStart).split('\n').length - 1
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20
    textarea.scrollTop = Math.max(0, (sourceLine - 2) * lineHeight)

    if (window.matchMedia('(max-width: 720px)').matches) {
      updateCursorPosition(mappedRange.sourceEnd)
      return
    }

    textarea.setSelectionRange(mappedRange.sourceStart, mappedRange.sourceEnd)
    textarea.focus({ preventScroll: true })
  }, [result.sourceMap, source, updateCursorPosition])

  const highlightSourceRange = useCallback((xmlId: string | null) => {
    const textarea = textareaRef.current
    if (!textarea) return
    if (!xmlId) {
      textarea.setSelectionRange(textarea.selectionStart, textarea.selectionStart)
      return
    }
    const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
    if (mappedRange) textarea.setSelectionRange(mappedRange.sourceStart, mappedRange.sourceEnd)
  }, [result.sourceMap])

  const copyMei = async () => {
    await navigator.clipboard.writeText(result.mei)
    setIsMeiDialogOpen(false)
  }

  return (
    <div className={embedded ? 'editor-container embedded' : 'editor-container'}>
      <header className="editor-header">
        <div className="editor-header-left"><h2>编辑器</h2></div>
        <div className="editor-header-right">
          <button type="button" className="action-button" onClick={() => setIsMeiDialogOpen(true)}>MEI</button>
          <button type="button" className="action-button" onClick={() => scoreRendererRef.current?.openExport()}>打印</button>
        </div>
      </header>
      <div className="editor-body">
        <SourceEditor
          textareaRef={textareaRef}
          value={source}
          ariaLabel="M3N source"
          onChange={(event) => {
            setSource(event.currentTarget.value)
            updateCursorPosition(event.currentTarget.selectionStart)
          }}
          onFocus={(event) => updateCursorPosition(event.currentTarget.selectionEnd)}
          onSelect={(event) => updateCursorPosition(event.currentTarget.selectionEnd)}
          onBlur={() => setIsCursorHighlightActive(false)}
        />
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics editor-source-diagnostics">{result.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
        <ScoreRenderer
          ref={scoreRendererRef}
          mei={result.mei}
          title={result.title}
          hasBassStaff={result.hasBassStaff}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          accompaniment={result.accompaniment}
          tempoChanges={result.tempoChanges}
          tempo={result.tempo}
          compact={embedded}
          activeXmlId={activeXmlId}
          invalidMeasureIds={invalidMeasureIds}
          onActiveXmlId={highlightSourceRange}
          onNoteClick={selectScoreNoteInSource}
          onPaperBlur={() => setIsCursorHighlightActive(false)}
          showPrintButton={false}
        />
      </div>

      {isMeiDialogOpen && (
        <div className="converter-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsMeiDialogOpen(false)
        }}>
          <section className="converter-dialog" role="dialog" aria-modal="true" aria-labelledby="mei-result-title">
            <div className="converter-dialog-header">
              <h2 id="mei-result-title">MEI 内容</h2>
              <button type="button" className="action-button" aria-label="关闭" onClick={() => setIsMeiDialogOpen(false)}>关闭</button>
            </div>
            <textarea className="converter-result" readOnly spellCheck={false} value={result.mei} aria-label="MEI 内容" />
            <div className="converter-dialog-actions">
              <button type="button" className="action-button" onClick={() => void copyMei()}>一键复制</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
