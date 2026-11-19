import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { createScorePdf, downloadBlob, renderScoreCanvas, scoreFileName, frameScoreImage, wrapScorePagesIntoSheets } from '@m3n/score-renderer/view'
import { prepareScoreExport, type ScoreDisplaySettings } from '../lib/render-score'

type ExportFormat = 'png' | 'pdf'
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
    const [exportError, setExportError] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [previewError, setPreviewError] = useState('')
    const [progress, setProgress] = useState('')
    useImperativeHandle(ref, () => ({ open() { setExportError(''); setIsOpen(true); dialogRef.current?.showModal() } }), [])
    useEffect(() => {
      const preview = previewRef.current
      if (!isOpen || !preview) return
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

    const exportScore = async (format: ExportFormat) => {
      setIsExporting(true); setExportError(''); setProgress('正在生成…'); onError('')
      try {
        const paged = format === 'pdf'
        const svgs = paged === settings.paged ? previewPagesRef.current : renderPagesRef.current?.(paged) ?? []
        if (!svgs.length) throw new Error('当前没有可导出的乐谱。')
        const fileName = scoreFileName(title)
        if (format === 'png') {
          const framed = frameScoreImage(svgs)
          const canvas = await renderScoreCanvas(framed, framed.viewBox.baseVal.width, 2)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
          if (!blob) throw new Error('PNG 生成失败。')
          downloadBlob(blob, `${fileName}.png`)
        } else {
          const blob = await createScorePdf(svgs, (done, total) => setProgress(`正在生成 PDF：${done}/${total} 页…`))
          downloadBlob(blob, `${fileName}.pdf`)
        }
        dialogRef.current?.close()
      } catch (error) { const message = error instanceof Error ? error.message : '导出失败。'; setExportError(message); onError(message) }
      finally { setIsExporting(false) }
    }
    return <dialog ref={dialogRef} className="export-dialog" onClose={() => setIsOpen(false)}>
      <div className="export-body">
        <div className="export-header"><h2>打印简谱</h2><button type="button" className="action-button" aria-label="关闭打印" onClick={() => dialogRef.current?.close()} disabled={isExporting}>×</button></div>
        <div className="export-actions" role="group" aria-label="导出格式">
          {(['png', 'pdf'] as const).map(format => <button key={format} type="button" disabled={isExporting || isPreviewing || Boolean(previewError)} title={format === 'pdf' ? '下载 A4 PDF' : undefined} onClick={() => void exportScore(format)}>{format.toUpperCase()}</button>)}
        </div>
        <div className="export-content">
          {isPreviewing && <p role="status">正在排版预览…</p>}
          {isExporting && <p role="status">{progress}</p>}
          {previewError && <p role="alert">{previewError}</p>}
          {exportError && <p className="export-error" role="alert">{exportError} 请重试下载。</p>}
          <div className="export-preview" aria-label="打印预览" aria-busy={isPreviewing}><div className="export-preview-paper"><div ref={previewRef} /></div></div></div>
      </div>
    </dialog>
  },
)
