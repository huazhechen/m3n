import { recordRecentEdit } from '../lib/recent-edits'
import { EditorSplit } from './EditorSplit'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatM3N, formatMeiXml, formatScoreDiagnostic } from '@m3n/notation'
import defaultScore from '../scores/huan_le_song_01.m3n?raw'
import { ScoreRenderer } from './ScoreRenderer'
import { SourceEditor, type SourceEditorHandle } from './SourceEditor'
import { useScoreDraft } from '../hooks/useScoreDraft'
import { SourceFileActions } from './SourceFileActions'
import { useM3NAnalysis } from '../hooks/useM3NAnalysis'

type NotationEditorProps = {
  initialSource?: string
  embedded?: boolean
  numberedNotation?: boolean
  simulatedSubmit?: boolean
  draftScope?: string
  scoreId?: string
  onBrowse?: (source: string) => Promise<void>
  onNumberedNotationChange?: (enabled: boolean) => void
  onSubmit?: (source: string) => Promise<void>
}

export function NotationEditor({
  initialSource = defaultScore,
  embedded = false,
  numberedNotation,
  simulatedSubmit = false,
  scoreId,
  draftScope,
  onBrowse,
  onNumberedNotationChange,
  onSubmit,
}: NotationEditorProps) {
  const { source, setSource, draftStatus, pauseDraft, resumeDraft, discardDraft } = useScoreDraft(initialSource, !embedded, draftScope ?? scoreId)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isCursorHighlightActive, setIsCursorHighlightActive] = useState(false)
  const [isMeiDialogOpen, setIsMeiDialogOpen] = useState(false)
  const [sharingAction, setSharingAction] = useState<'browse' | 'submit' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const textareaRef = useRef<SourceEditorHandle>(null)
  const latestSource = useRef(source)
  useLayoutEffect(() => { latestSource.current = source }, [source])
  const [isComposing, setIsComposing] = useState(false)
  const { analysis, isAnalyzing, error: analysisError, retry: retryAnalysis } = useM3NAnalysis(source, { background: !embedded, suspended: isComposing })
  useEffect(() => {
    if (!embedded && !draftScope && analysis.source === source && source !== initialSource) recordRecentEdit(scoreId ?? '', analysis.score.title || '未命名草稿')
  }, [analysis, draftScope, embedded, initialSource, scoreId, source])
  const { interaction: result, invalidMeasureIds } = analysis
  const formattedMei = useMemo(() => isMeiDialogOpen ? formatMeiXml(analysis.conversion.mei) : '', [analysis, isMeiDialogOpen])
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
    setCursorPosition(position)
    setIsCursorHighlightActive(true)
  }, [])

  const selectScoreNoteInSource = useCallback((xmlId: string) => {
    if (analysis.source !== source) return
    const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
    const textarea = textareaRef.current
    if (!mappedRange || !textarea) return

    textarea.select(mappedRange.sourceStart, mappedRange.sourceEnd, !window.matchMedia('(max-width: 720px)').matches)
    updateCursorPosition(mappedRange.sourceEnd)
  }, [analysis.source, result.sourceMap, source, updateCursorPosition])

  const highlightSourceRange = useCallback((xmlId: string | null) => {
    if (analysis.source !== latestSource.current) return
    const textarea = textareaRef.current
    if (!textarea) return
    if (!xmlId) {
      textarea.select(textarea.selection())
      return
    }
    const mappedRange = result.sourceMap.find((item) => item.xmlId === xmlId)
    if (mappedRange) textarea.select(mappedRange.sourceStart, mappedRange.sourceEnd)
  }, [analysis.source, result.sourceMap])

  const copyMei = async () => {
    await navigator.clipboard.writeText(formattedMei)
    setIsMeiDialogOpen(false)
  }

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
          <SourceFileActions source={source} title={analysis.score.title} onImport={value => { setSource(value); updateCursorPosition(0) }} onError={setShareError} />
          <button type="button" className="action-button" onClick={formatSource}>格式化</button>
          <button type="button" className="action-button" onClick={() => setIsMeiDialogOpen(true)}>MEI</button>
          {onBrowse && <button type="button" className="action-button" disabled={sharingAction !== null} onClick={() => void browseScore()}>{sharingAction === 'browse' ? '保存中' : '保存并预览'}</button>}
          {onSubmit && <button type="button" className="action-button" title="生成保留 15 天的分享链接" disabled={sharingAction !== null} onClick={() => void submitScore()}>{sharingAction === 'submit' ? '生成中' : '临时分享'}</button>}
        </div>
      </header>
      )}
      {!embedded && <p className="editor-save-status" role="status" aria-label="草稿保存状态">{draftStatus || '作品保存在此浏览器；下载 M3N 可备份或在其他设备打开。'}</p>}
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
          mei={analysis.getMei}
          scoreDocument={analysis.score}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          compact={embedded}
          isSourceUpdating={isAnalyzing}
          numberedNotation={numberedNotation}
          activeXmlId={activeXmlId}
          invalidMeasureIds={invalidMeasureIds}
          onActiveXmlId={highlightSourceRange}
          onNoteClick={selectScoreNoteInSource}
          onNumberedNotationChange={onNumberedNotationChange}
          onPaperBlur={() => setIsCursorHighlightActive(false)}
        />}>
        {analysis.diagnostics.length > 0 && (
          <ul className="diagnostics editor-render-diagnostics">{analysis.diagnostics.map((item) => <li key={`${item.code}:${item.message}`}><button type="button" className="diagnostic-link" disabled={!item.range || analysis.source !== source} onClick={() => { if (item.range) textareaRef.current?.select(item.range.start, item.range.end, true) }}>{formatScoreDiagnostic(item)}</button></li>)}</ul>
        )}
        {shareError && <p className="editor-share-error" role="alert">{shareError}</p>}
        {analysisError && <p className="editor-share-error" role="alert">{analysisError} <button type="button" className="action-button" onClick={retryAnalysis}>重试分析</button></p>}
        {isAnalyzing && <p className="editor-analysis-status" role="status" aria-label="乐谱分析状态">{isComposing ? '正在输入…' : '正在更新乐谱…'}</p>}
      </EditorSplit>

      {isMeiDialogOpen && (
        <div className="converter-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsMeiDialogOpen(false)
        }}>
          <section className="converter-dialog" role="dialog" aria-modal="true" aria-labelledby="mei-result-title">
            <div className="converter-dialog-header">
              <h2 id="mei-result-title">MEI 内容</h2>
              <button type="button" className="action-button" aria-label="关闭" onClick={() => setIsMeiDialogOpen(false)}>关闭</button>
            </div>
            <textarea className="converter-result" readOnly spellCheck={false} value={formattedMei} aria-label="MEI 内容" />
            <div className="converter-dialog-actions">
              <button type="button" className="action-button" onClick={() => void copyMei()}>一键复制</button>
            </div>
          </section>
        </div>
      )}

    </div>
  )
}
