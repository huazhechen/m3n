import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ScoreDocument } from '@m3n/notation'
import { a4ImagePlacement, downloadBlob, renderScoreCanvas, scoreFileName, frameScoreImage } from '@m3n/score-renderer/view'
import { renderScoreInto, type ScoreDisplaySettings } from '../lib/render-score'

type ExportFormat = 'png' | 'pdf' | 'svg'
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
    const [isOpen, setIsOpen] = useState(false)
    const [exportError, setExportError] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [previewError, setPreviewError] = useState('')
    useImperativeHandle(ref, () => ({ open() { setExportError(''); setIsOpen(true); dialogRef.current?.showModal() } }), [])
    useEffect(() => {
      const preview = previewRef.current
      if (!isOpen || !preview) return
      const controller = new AbortController()
      setIsPreviewing(true); setPreviewError('')
      void renderScoreInto(preview, { scoreDocument, ...settings, sheetClass: 'export-preview-page', signal: controller.signal,
      }).catch((error: unknown) => { if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : '打印预览失败。') })
        .finally(() => { if (!controller.signal.aborted) setIsPreviewing(false) })
      return () => controller.abort()
    }, [isOpen, settings, scoreDocument])

    const exportScore = async (format: ExportFormat) => {
      setIsExporting(true); setExportError(''); onError('')
      const paper = document.createElement('div')
      paper.style.cssText = `position:fixed;left:-20000px;top:0;width:${settings.width}px;pointer-events:none;`
      document.body.append(paper)
      try {
        await renderScoreInto(paper, { scoreDocument, ...settings })
        const svgs = [...paper.querySelectorAll<SVGSVGElement>(':scope > svg')]
        if (!svgs.length) throw new Error('当前没有可导出的乐谱。')
        const { outlineSvgText } = await import('../lib/vector-export')
        for (const svg of svgs) await outlineSvgText(svg)
        const fileName = scoreFileName(title)
        if (format === 'svg') {
          const root = frameScoreImage(svgs)
          downloadBlob(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml;charset=utf-8' }), `${fileName}.svg`)
        } else if (format === 'png') {
          const framed = frameScoreImage(svgs)
          const canvas = await renderScoreCanvas(framed, framed.viewBox.baseVal.width, 2)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
          if (!blob) throw new Error('PNG 生成失败。')
          downloadBlob(blob, `${fileName}.png`)
        } else {
          const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
          const pdf = new jsPDF({ format: 'a4', unit: 'mm' })
          for (const [index, svg] of svgs.entries()) {
            if (index) pdf.addPage('a4', 'portrait')
            const viewBox = svg.viewBox.baseVal
            const placement = a4ImagePlacement(viewBox.width, viewBox.height)
            await svg2pdf(svg, pdf, { x: placement.x, y: placement.y, width: placement.width, height: placement.height })
          }
          pdf.save(`${fileName}.pdf`)
        }
        dialogRef.current?.close()
      } catch (error) { const message = error instanceof Error ? error.message : '导出失败。'; setExportError(message); onError(message) }
      finally { paper.remove(); setIsExporting(false) }
    }
    return <dialog ref={dialogRef} className="export-dialog" onClose={() => setIsOpen(false)}>
      <div className="export-body">
        <div className="export-header"><h2>打印简谱</h2><button type="button" className="action-button" aria-label="关闭打印" onClick={() => dialogRef.current?.close()} disabled={isExporting}>×</button></div>
        <div className="export-actions" role="group" aria-label="导出格式">
          {(['svg', 'png', 'pdf'] as const).map(format => <button key={format} type="button" disabled={isExporting || isPreviewing || Boolean(previewError)} onClick={() => void exportScore(format)}>{format.toUpperCase()}</button>)}
        </div>
        <div className="export-content">
          {isPreviewing && <p role="status">正在排版预览…</p>}
          {isExporting && <p role="status">正在生成…</p>}
          {previewError && <p role="alert">{previewError}</p>}
          {exportError && <p className="export-error" role="alert">{exportError} 请重试下载。</p>}
          <div className="export-preview" aria-label="打印预览" aria-busy={isPreviewing}><div className="export-preview-paper"><div ref={previewRef} /></div></div></div>
      </div>
    </dialog>
  },
)
