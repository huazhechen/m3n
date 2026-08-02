import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { scoreFileName } from '../features/score-renderer/score-document'
import { addScoreTitle, downloadBlob, renderScoreCanvas } from '../features/score-renderer/score-export'
import type { VerovioScore } from '../features/score-renderer/verovio-score'

type ExportFormat = 'png' | 'pdf'

const DEFAULT_EXPORT_WIDTH = 800

type ScoreExportDialogProps = {
  mei: string
  title: string
  hasBassStaff: boolean
  onError: (message: string) => void
}

export type ScoreExportDialogRef = {
  open: () => void
}

async function createVerovioScore(mei: string) {
  const { VerovioScore } = await import('../features/score-renderer/verovio-score')
  return VerovioScore.create(mei)
}

export const ScoreExportDialog = forwardRef<ScoreExportDialogRef, ScoreExportDialogProps>(
  function ScoreExportDialog({ mei, title, hasBassStaff, onError }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const [format, setFormat] = useState<ExportFormat>('png')
    const [width, setWidth] = useState(DEFAULT_EXPORT_WIDTH)
    const [pdfScale, setPdfScale] = useState(100)
    const [includeBass, setIncludeBass] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    useImperativeHandle(ref, () => ({
      open() {
        setIncludeBass(hasBassStaff)
        setIsOpen(true)
        dialogRef.current?.showModal()
      },
    }), [hasBassStaff])

    useEffect(() => {
      const preview = previewRef.current
      if (!isOpen || !preview) return
      let cancelled = false
      preview.innerHTML = ''
      void createVerovioScore(mei).then((score) => {
        if (!cancelled) {
          preview.innerHTML = score.layout({
            width: format === 'png' ? Math.max(320, width) : DEFAULT_EXPORT_WIDTH,
            scale: format === 'pdf' ? 42 * pdfScale / 100 : 42,
            includeBass: includeBass || !hasBassStaff,
          })
          const svg = preview.querySelector('svg')
          if (svg) addScoreTitle(svg, title)
        }
        score.destroy()
      }).catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : '打印预览失败。')
      })
      return () => { cancelled = true }
    }, [format, hasBassStaff, includeBass, isOpen, mei, onError, pdfScale, title, width])

    const exportScore = async () => {
      setIsExporting(true)
      onError('')
      let score: VerovioScore | null = null
      try {
        const scale = format === 'pdf' ? pdfScale / 100 : 1
        if (format === 'pdf' && (!Number.isFinite(scale) || scale < 0.5 || scale > 2)) {
          throw new Error('PDF 缩放需介于 50% 和 200% 之间。')
        }
        const targetWidth = format === 'png' ? Math.max(320, width) : DEFAULT_EXPORT_WIDTH
        score = await createVerovioScore(mei)
        const exportPaper = document.createElement('div')
        exportPaper.innerHTML = score.layout({
          width: targetWidth,
          scale: 42 * scale,
          includeBass: includeBass || !hasBassStaff,
        })
        const svg = exportPaper.querySelector('svg')
        if (!svg) throw new Error('当前没有可导出的五线谱。')
        addScoreTitle(svg, title)

        const fileName = scoreFileName(title)
        if (format === 'png') {
          const pngWidth = Math.round(width)
          if (!Number.isFinite(pngWidth) || pngWidth < 320 || pngWidth > 8000) {
            throw new Error('PNG 宽度需介于 320 和 8000 像素之间。')
          }
          const canvas = await renderScoreCanvas(svg, pngWidth)
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
          if (!blob) throw new Error('PNG 生成失败。')
          downloadBlob(blob, `${fileName}.png`)
        } else {
          const canvas = await renderScoreCanvas(svg, 1600)
          const documentWidth = 210
          const documentHeight = 297
          const margin = 10
          const imageWidth = documentWidth - margin * 2
          const contentHeight = documentHeight - margin * 2
          const sourcePageHeight = Math.floor(canvas.width * contentHeight / imageWidth)
          const { jsPDF } = await import('jspdf')
          const pdf = new jsPDF({ format: 'a4', unit: 'mm' })
          for (let offset = 0, page = 0; offset < canvas.height; offset += sourcePageHeight, page += 1) {
            if (page > 0) pdf.addPage('a4', 'portrait')
            const pageHeight = Math.min(sourcePageHeight, canvas.height - offset)
            const pageCanvas = document.createElement('canvas')
            pageCanvas.width = canvas.width
            pageCanvas.height = pageHeight
            const context = pageCanvas.getContext('2d')
            if (!context) throw new Error('无法创建 PDF 页面。')
            context.fillStyle = '#fffef9'
            context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
            context.drawImage(canvas, 0, -offset)
            pdf.addImage(pageCanvas, 'PNG', margin, margin, imageWidth, pageHeight * imageWidth / canvas.width, undefined, 'FAST')
          }
          pdf.save(`${fileName}.pdf`)
        }
        dialogRef.current?.close()
      } catch (error) {
        onError(error instanceof Error ? error.message : '导出失败。')
      } finally {
        score?.destroy()
        setIsExporting(false)
      }
    }

    return (
      <dialog ref={dialogRef} className="export-dialog" onClose={() => setIsOpen(false)}>
        <form onSubmit={(event) => { event.preventDefault(); void exportScore() }}>
          <div className="export-header"><h2>打印五线谱</h2><span>{format === 'pdf' ? 'A4 纵向' : 'PNG 图片'}</span></div>
          <div className="export-content">
            <div className="export-settings">
              <fieldset>
                <legend>格式</legend>
                <label><input type="radio" name="export-format" checked={format === 'png'} onChange={() => setFormat('png')} />PNG 图片</label>
                <label><input type="radio" name="export-format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />PDF（A4）</label>
              </fieldset>
              {hasBassStaff && <fieldset><legend>低音谱表</legend><label><input type="checkbox" checked={includeBass} onChange={(event) => setIncludeBass(event.currentTarget.checked)} />包含低音谱表</label></fieldset>}
              {format === 'png'
                ? <label className="export-field">宽度<input type="number" min="320" max="8000" step="10" value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /><span>px</span></label>
                : <label className="export-field">缩放<input type="number" min="50" max="200" step="1" value={pdfScale} onChange={(event) => setPdfScale(Number(event.currentTarget.value))} /><span>%</span></label>}
            </div>
            <div className="export-preview" aria-label="打印预览"><div ref={previewRef} className="export-preview-paper" /></div>
          </div>
          <div className="export-actions">
            <button type="button" onClick={() => dialogRef.current?.close()} disabled={isExporting}>取消</button>
            <button type="submit" disabled={isExporting}>{isExporting ? '正在生成' : '确认并下载'}</button>
          </div>
        </form>
      </dialog>
    )
  },
)
