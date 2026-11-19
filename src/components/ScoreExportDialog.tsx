import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { preloadScorePdf, downloadBlob, renderScoreCanvas, scoreFileName, frameScoreImage, wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'
import { PdfDownloadPanel } from './PdfDownloadPanel'
import { prepareScoreExport, type ScoreDisplaySettings } from '../lib/render-score'

type ExportFormat = 'png' | 'pdf' | 'midi'
type ScoreExportDialogProps = {
  scoreDocument: ScoreDocument
  title: string
  settings: ScoreDisplaySettings
  onError: (message: string) => void
}
export type ScoreExportDialogRef = { open: () => void }

export const ScoreExportDialog = forwardRef<ScoreExportDialogRef, ScoreExportDialogProps>(
  function ScoreExportDialog({ scoreDocument, title, settings, onError }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const previewPagesRef = useRef<SVGSVGElement[]>([])
    const renderPagesRef = useRef<((paged: boolean) => SVGSVGElement[]) | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [pdfMode, setPdfMode] = useState(false)
    const [exportError, setExportError] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [previewError, setPreviewError] = useState('')
    const [progress, setProgress] = useState('')
    useImperativeHandle(ref, () => ({ open() { setExportError(''); setIsOpen(true); dialogRef.current?.showModal() } }), [])
    useEffect(() => {
      const preview = previewRef.current
      if (!isOpen || !preview) return
      void preloadScorePdf().catch(() => {})
      const controller = new AbortController()
      previewPagesRef.current = []
      renderPagesRef.current = null
      setIsPreviewing(true); setPreviewError('')
      void prepareScoreExport(scoreDocument, settings, controller.signal).then(renderPages => {
        if (controller.signal.aborted) return
        renderPagesRef.current = renderPages
        const pages = renderPages(settings.paged)
        preview.replaceChildren(...pages)
        previewPagesRef.current = pages.map(page => page.cloneNode(true) as SVGSVGElement)
        if (settings.paged) wrapScorePagesIntoSheets(preview, 'export-preview-page')
        else if (pages.length) preview.replaceChildren(frameScoreImage(pages))
      }).catch((error: unknown) => { if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : '打印预览失败。') })
        .finally(() => { if (!controller.signal.aborted) setIsPreviewing(false) })
      return () => { controller.abort(); renderPagesRef.current = null; previewPagesRef.current = [] }
    }, [isOpen, settings, scoreDocument])

    const preparePdf = useCallback(async (signal: AbortSignal) => {
      signal.throwIfAborted()
      const pages = settings.paged ? previewPagesRef.current : renderPagesRef.current?.(true) ?? []
      return { pages, title }
    }, [settings.paged, title])

    const exportScore = async (format: ExportFormat) => {
      if (format === 'pdf') { setPdfMode(true); return }
      setIsExporting(true); setExportError(''); setProgress('正在生成…'); onError('')
      try {
        const fileName = scoreFileName(title)
        if (format === 'midi') {
          const { exportScoreMidi } = await import('@m3n/score-renderer/playback')
          const midi = exportScoreMidi(scoreDocument, { transpose: settings.transpose, tempoScale: settings.tempoScale })
          downloadBlob(new Blob([midi], { type: 'audio/midi' }), `${fileName}.mid`)
          dialogRef.current?.close()
          return
        }
        const paged = false
        const svgs = paged === settings.paged ? previewPagesRef.current : renderPagesRef.current?.(paged) ?? []
        if (!svgs.length) throw new Error('当前没有可导出的乐谱。')
        if (format === 'png') {
          const framed = frameScoreImage(svgs)
          const canvas = await renderScoreCanvas(framed, framed.viewBox.baseVal.width, 2)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
          if (!blob) throw new Error('PNG 生成失败。')
          downloadBlob(blob, `${fileName}.png`)
        }
        dialogRef.current?.close()
      } catch (error) { const message = error instanceof Error ? error.message : '导出失败。'; setExportError(message); onError(message) }
      finally { setIsExporting(false) }
    }
    return <dialog ref={dialogRef} className={pdfMode ? 'scorebook-export-dialog' : 'export-dialog'} aria-label={pdfMode ? '导出 PDF' : '导出乐谱'} onClose={() => { setIsOpen(false); setPdfMode(false) }}>
      {pdfMode ? <PdfDownloadPanel prepare={preparePdf} onClose={() => dialogRef.current?.close()} closeOnSuccess /> :
      <div className="export-body">
        <div className="export-header"><h2>导出乐谱</h2><button type="button" className="action-button" aria-label="关闭导出" onClick={() => dialogRef.current?.close()} disabled={isExporting}>×</button></div>
        <div className="export-actions" role="group" aria-label="导出格式">
          {(['png', 'pdf', 'midi'] as const).map(format => <button key={format} type="button" disabled={isExporting || (format !== 'midi' && (isPreviewing || Boolean(previewError)))} title={format === 'pdf' ? '下载 A4 PDF' : format === 'midi' ? '下载 MIDI' : undefined} onClick={() => void exportScore(format)}>{format.toUpperCase()}</button>)}
        </div>
        <div className="export-content">
          {isPreviewing && <p role="status">正在排版预览…</p>}
          {isExporting && <p role="status">{progress}</p>}
          {previewError && <p role="alert">{previewError}</p>}
          {exportError && <p className="export-error" role="alert">{exportError} 请重试下载。</p>}
          <div className="export-preview" aria-label="打印预览" aria-busy={isPreviewing}><div className="export-preview-paper"><div ref={previewRef} /></div></div></div>
      </div>}
    </dialog>
  },
)
