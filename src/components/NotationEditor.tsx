import { EditorSplit } from './EditorSplit'
import { MOBILE_LAYOUT_QUERY } from '../lib/responsive-layout'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatM3N, formatScoreDiagnostic } from '@m3n/notation'
import { ScoreRenderer } from './ScoreRenderer'
import { SourceEditor, type SourceEditorHandle } from './SourceEditor'
import { useScoreDraft } from '../hooks/useScoreDraft'
import { useM3NAnalysis } from '../hooks/useM3NAnalysis'

const editorActionPaths = {
  format: 'M4 5h16M4 10h10M4 15h7M4 20h7m3-4 3 3 5-7',
  save: 'M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8',
  share: 'M12 16V3m-5 5 5-5 5 5M5 13H3v8h18v-8h-2',
}

function EditorActionIcon({ action }: { action: keyof typeof editorActionPaths }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={editorActionPaths[action]} /></svg>
}

type NotationEditorProps = {
  initialSource: string
  embedded?: boolean
  playbackOnly?: boolean
  previewWidth?: number
  simulatedSubmit?: boolean
  draftScope?: string
  scoreId?: string
  onBrowse?: (source: string) => Promise<void>
  onSubmit?: (source: string) => Promise<void>
}

export function NotationEditor({
  initialSource,
  embedded = false,
  playbackOnly = false,
  previewWidth,
  simulatedSubmit = false,
  scoreId,
  draftScope,
  onBrowse,
  onSubmit,
}: NotationEditorProps) {
  const { source, setSource, pauseDraft, resumeDraft, discardDraft } = useScoreDraft(initialSource, !embedded, draftScope ?? scoreId)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const [sharingAction, setSharingAction] = useState<'browse' | 'submit' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const textareaRef = useRef<SourceEditorHandle>(null)
  const playbackSelectionRef = useRef(false)
  const latestSource = useRef(source)
  useLayoutEffect(() => { latestSource.current = source }, [source])
  const [isComposing, setIsComposing] = useState(false)
  const { analysis, isAnalyzing, error: analysisError, retry: retryAnalysis } = useM3NAnalysis(source, { background: !embedded, suspended: isComposing })

  const { interaction: result, invalidMeasureIds } = analysis
  const cursorXmlId = useMemo(() => {
    if (analysis.source !== source) return null
    const containingRange = result.sourceMap.find((item) => (
      item.sourceStart <= cursorPosition && cursorPosition < item.sourceEnd
    ))
    return containingRange?.xmlId ?? result.sourceMap
      .filter((item) => item.sourceStart < cursorPosition)
      .at(-1)?.xmlId ?? null
  }, [analysis.source, source, cursorPosition, result.sourceMap])
  const activeXmlId = isCursorHighlightActive ? cursorXmlId : null

  const updateCursorPosition = useCallback((position: number) => {
    if (playbackSelectionRef.current) return
    setCursorPosition(position)
    setIsCursorHighlightActive(true)
  }, [])

  const selectScoreNoteInSource = useCallback((xmlId: string) => {
    if (analysis.source !== source) return
    const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
    const textarea = textareaRef.current
    if (!mappedRange || !textarea) return

    textarea.select(mappedRange.sourceStart, mappedRange.sourceEnd, !window.matchMedia(MOBILE_LAYOUT_QUERY).matches)
    updateCursorPosition(mappedRange.sourceEnd)
  }, [analysis.source, result.sourceMap, source, updateCursorPosition])

  const highlightSourceRange = useCallback((xmlId: string | null) => {
    if (analysis.source !== latestSource.current) return
    const textarea = textareaRef.current
    if (!textarea) return
    playbackSelectionRef.current = true
    try {
      if (!xmlId) textarea.select(textarea.selection(), undefined, false, { scrollIntoView: false })
      else {
        const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
        if (mappedRange) textarea.select(mappedRange.sourceStart, mappedRange.sourceEnd, false, { scrollIntoView: false })
      }
    } finally { playbackSelectionRef.current = false }
  }, [analysis.source, result.sourceMap])

  const formatSource = () => {
    const formatted = formatM3N(source, analysis.source === source ? analysis : undefined)
    setSource(formatted)
    updateCursorPosition(Math.min(cursorPosition, formatted.length))
  }

  const browseScore = async () => {
    if (!onBrowse) return
    setSharingAction('browse')
    setShareError(null)
    pauseDraft()
    try {
      await onBrowse(source)
      discardDraft()
    } catch (error) {
      resumeDraft()
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
          {simulatedSubmit && <span className="editor-mode-note">本地模拟提交</span>}
          <button type="button" className="action-button editor-action" aria-label="格式化" title="格式化" onClick={formatSource}><EditorActionIcon action="format" /><span>格式化</span></button>
          {onBrowse && <button type="button" className="action-button editor-action" aria-label="保存" title="保存" aria-busy={sharingAction === 'browse' || undefined} disabled={sharingAction !== null} onClick={() => void browseScore()}><EditorActionIcon action="save" /><span>{sharingAction === 'browse' ? '保存中' : '保存'}</span></button>}
          {onSubmit && <button type="button" className="action-button editor-action" aria-label="分享" title="生成保留 15 天的分享链接" aria-busy={sharingAction === 'submit' || undefined} disabled={sharingAction !== null} onClick={() => void submitScore()}><EditorActionIcon action="share" /><span>{sharingAction === 'submit' ? '生成中' : '分享'}</span></button>}
        </div>
      </header>
      )}
      <EditorSplit source={<SourceEditor
          editorRef={textareaRef}
          diagnostics={analysis.source === source ? analysis.diagnostics : undefined}
          value={source}
          ariaLabel="M3N source"
          readOnly={embedded}
          onChange={(value, position) => { setSource(value); updateCursorPosition(position) }}
          onSelect={updateCursorPosition}
          onBlur={() => setIsCursorHighlightActive(false)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />} preview={<ScoreRenderer
          scoreId={scoreId}
          scoreDocument={analysis.score}

          sourceMap={result.sourceMap}
          compact={embedded}
          playbackOnly={playbackOnly}
          previewWidth={previewWidth}
          isSourceUpdating={isAnalyzing}
          activeXmlId={activeXmlId}
          invalidMeasureIds={invalidMeasureIds}
          onActiveXmlId={highlightSourceRange}
          onNoteClick={selectScoreNoteInSource}
          onPaperBlur={() => setIsCursorHighlightActive(false)}
        />}>
        {analysis.diagnostics.length > 0 && (
          <ul className="diagnostics editor-render-diagnostics">{analysis.diagnostics.map((item) => <li key={`${item.code}:${item.message}`}><button type="button" className="diagnostic-link" disabled={!item.range || analysis.source !== source} onClick={() => { if (item.range) textareaRef.current?.select(item.range.start, item.range.end, true) }}>{formatScoreDiagnostic(item)}</button></li>)}</ul>
        )}
        {shareError && <p className="editor-share-error" role="alert">{shareError}</p>}
        {analysisError && <p className="editor-share-error" role="alert">{analysisError} <button type="button" className="action-button" onClick={retryAnalysis}>重试分析</button></p>}
        {isAnalyzing && <p className="editor-analysis-status" role="status" aria-label="乐谱分析状态">{isComposing ? '正在输入…' : '正在更新乐谱…'}</p>}
      </EditorSplit>
    </div>
  )
}
