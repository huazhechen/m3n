import { useCallback, useMemo, useRef, useState } from 'react'
import { analyzeM3N, formatM3N, formatScoreDiagnostic } from '@m3n/notation'
import defaultScore from '../scores/huan_le_song_01.m3n?raw'
import { ScoreRenderer } from './ScoreRenderer'
import { SourceEditor } from './SourceEditor'

type NotationEditorProps = {
  initialSource?: string
  embedded?: boolean
  onBrowse?: (source: string) => Promise<void>
  onSubmit?: (source: string) => Promise<void>
}

export function NotationEditor({ initialSource = defaultScore, embedded = false, onBrowse, onSubmit }: NotationEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const [isMeiDialogOpen, setIsMeiDialogOpen] = useState(false)
  const [isComplexityDialogOpen, setIsComplexityDialogOpen] = useState(false)
  const [sharingAction, setSharingAction] = useState<'browse' | 'submit' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const analysis = useMemo(() => analyzeM3N(source), [source])
  const { conversion: result, complexity, invalidMeasureIds } = analysis
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

  const formatSource = () => {
    const formatted = formatM3N(source, analysis)
    setSource(formatted)
    updateCursorPosition(Math.min(cursorPosition, formatted.length))
  }

  const browseScore = async () => {
    if (!onBrowse) return
    setSharingAction('browse')
    setShareError(null)
    try {
      await onBrowse(source)
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to create the shared score.')
    } finally {
      setSharingAction(null)
    }
  }

  const submitScore = async () => {
    if (!onSubmit) return
    setSharingAction('submit')
    setShareError(null)
    try {
      await onSubmit(source)
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to submit the score.')
    } finally {
      setSharingAction(null)
    }
  }

  return (
    <div className={embedded ? 'embedded-editor' : 'editor-container'}>
      {!embedded && (
      <header className="editor-header">
        <div className="editor-header-left"><h2>编辑器</h2></div>
        <div className="editor-header-right">
          <button type="button" className="action-button" onClick={formatSource}>格式化</button>
          <button type="button" className="action-button" onClick={() => setIsComplexityDialogOpen(true)}>复杂度</button>
          <button type="button" className="action-button" onClick={() => setIsMeiDialogOpen(true)}>MEI</button>
          {onBrowse && <button type="button" className="action-button" disabled={sharingAction !== null} onClick={() => void browseScore()}>{sharingAction === 'browse' ? '保存中' : '浏览'}</button>}
          {onSubmit && <button type="button" className="action-button" disabled={sharingAction !== null} onClick={() => void submitScore()}>{sharingAction === 'submit' ? '提交中' : '提交'}</button>}
        </div>
      </header>
      )}
      <div className={embedded ? 'editor-body embedded-editor-body' : 'editor-body'}>
        <SourceEditor
          textareaRef={textareaRef}
          value={source}
          ariaLabel="M3N source"
          readOnly={embedded}
          onChange={(event) => {
            setSource(event.currentTarget.value)
            updateCursorPosition(event.currentTarget.selectionStart)
          }}
          onFocus={(event) => updateCursorPosition(event.currentTarget.selectionEnd)}
          onSelect={(event) => updateCursorPosition(event.currentTarget.selectionEnd)}
          onBlur={() => setIsCursorHighlightActive(false)}
        />
        <ScoreRenderer
          mei={result.mei}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          compact={embedded}
          activeXmlId={activeXmlId}
          invalidMeasureIds={invalidMeasureIds}
          onActiveXmlId={highlightSourceRange}
          onNoteClick={selectScoreNoteInSource}
          onPaperBlur={() => setIsCursorHighlightActive(false)}
        />
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics editor-render-diagnostics">{result.diagnostics.map((item) => <li key={`${item.code}:${item.message}`}>{formatScoreDiagnostic(item)}</li>)}</ul>
        )}
        {shareError && <p className="editor-share-error" role="alert">{shareError}</p>}
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

      {isComplexityDialogOpen && (
        <div className="converter-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsComplexityDialogOpen(false)
        }}>
          <section className="complexity-dialog" role="dialog" aria-modal="true" aria-labelledby="complexity-result-title">
            <div className="converter-dialog-header">
              <h2 id="complexity-result-title">高音旋律复杂度</h2>
              <button type="button" className="action-button" aria-label="关闭" onClick={() => setIsComplexityDialogOpen(false)}>关闭</button>
            </div>
            <div className="complexity-result">
              <p className="complexity-score"><strong>{complexity.score.toFixed(1)}</strong><span>/ 5.0</span></p>
              <p className="complexity-label">{complexity.label}</p>
              <dl className="complexity-metrics">
                <div><dt>音符数</dt><dd>{complexity.metrics.noteCount}</dd></div>
                <div><dt>演奏密度</dt><dd>{complexity.metrics.notesPerSecond} 音/秒</dd></div>
                <div><dt>峰值密度</dt><dd>{complexity.metrics.peakNotesPerBeat} 音/拍</dd></div>
                <div><dt>音域</dt><dd>{complexity.metrics.pitchRange} 半音</dd></div>
                <div><dt>最大跳进</dt><dd>{complexity.metrics.maximumLeap} 半音</dd></div>
                <div><dt>弱拍进入</dt><dd>{Math.round(complexity.metrics.offbeatRatio * 100)}%</dd></div>
                <div><dt>节奏与装饰</dt><dd>{complexity.metrics.rhythmicValues} 种 / {complexity.metrics.ornamentCount}</dd></div>
                <div><dt>变音、和弦、连音</dt><dd>{complexity.metrics.accidentalCount} / {complexity.metrics.chordCount} / {complexity.metrics.tieCount}</dd></div>
              </dl>
              <p className="complexity-note">评分仅分析高音谱表的书写旋律，不计入低音谱表。</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
