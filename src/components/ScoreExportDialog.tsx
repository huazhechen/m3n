import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ScoreHeaderMetadata } from '@m3n/notation'
import {
  a4ImagePlacement,
  a4SourcePageHeight,
  addScoreHeaderToPaper,
  downloadBlob,
  renderScoreCanvas,
  resolveLyricCollisions,
  scoreFileName,
  scoreHeaderHeight,
  stackScoreCanvases,
  wrapScorePagesIntoSheets,
  type VerovioScore,
} from '@m3n/score-renderer'

type ExportFormat = 'png' | 'pdf'

type ScoreExportDialogProps = {
  mei: string
  title: string
  width: number
  hasBassStaff: boolean
  headerMetadata: ScoreHeaderMetadata[]
  onError: (message: string) => void
}

export type ScoreExportDialogRef = {
  open: () => void
}

async function createVerovioScore(mei: string) {
  const { VerovioScore } = await import('@m3n/score-renderer')
  return VerovioScore.create(mei)
}

function cloneScorePages(paper: HTMLElement) {
  return [...paper.querySelectorAll<SVGSVGElement>(':scope > svg')]
    .map((svg) => svg.cloneNode(true) as SVGSVGElement)
}

function pdfNotationPageHeight(width: number, headerMetadata: readonly ScoreHeaderMetadata[]) {
  return Math.max(1, a4SourcePageHeight(width) - scoreHeaderHeight(headerMetadata))
}

export const ScoreExportDialog = forwardRef<ScoreExportDialogRef, ScoreExportDialogProps>(
  function ScoreExportDialog({ mei, title, width, hasBassStaff, headerMetadata, onError }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const [format, setFormat] = useState<ExportFormat>('pdf')
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
            width: Math.max(320, width),
            pageHeight: format === 'pdf' ? pdfNotationPageHeight(width, headerMetadata) : undefined,
            scale: 42,
            includeBass: includeBass || !hasBassStaff,
          })
          addScoreHeaderToPaper(preview, headerMetadata)
          resolveLyricCollisions(preview)
          if (format === 'pdf') wrapScorePagesIntoSheets(preview, 'export-preview-page')
        }
        score.destroy()
      }).catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : '打印预览失败。')
      })
      return () => { cancelled = true }
    }, [format, hasBassStaff, headerMetadata, includeBass, isOpen, mei, onError, width])

    const exportScore = async () => {
      setIsExporting(true)
      onError('')
      let score: VerovioScore | null = null
      try {
        const targetWidth = Math.round(width)
        if (!Number.isFinite(targetWidth) || targetWidth < 320 || targetWidth > 8000) {
          throw new Error('导出宽度需介于 320 和 8000 像素之间。')
        }
        score = await createVerovioScore(mei)
        const exportPaper = document.createElement('div')
        exportPaper.innerHTML = score.layout({
          width: targetWidth,
          pageHeight: format === 'pdf' ? pdfNotationPageHeight(targetWidth, headerMetadata) : undefined,
          scale: 42,
          includeBass: includeBass || !hasBassStaff,
        })
        exportPaper.style.cssText = 'position:fixed; visibility:hidden; pointer-events:none; inset:0;'
        document.body.append(exportPaper)
        let svgs: SVGSVGElement[] = []
        try {
          addScoreHeaderToPaper(exportPaper, headerMetadata)
          resolveLyricCollisions(exportPaper)
          svgs = cloneScorePages(exportPaper)
        } finally {
          exportPaper.remove()
        }
        if (svgs.length === 0) throw new Error('当前没有可导出的五线谱。')

        const canvases: HTMLCanvasElement[] = []
        for (const svg of svgs) canvases.push(await renderScoreCanvas(svg, targetWidth))

        const fileName = scoreFileName(title)
        if (format === 'png') {
          const canvas = stackScoreCanvases(canvases)
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
          if (!blob) throw new Error('PNG 生成失败。')
          downloadBlob(blob, `${fileName}.png`)
        } else {
          const margin = 10
          const { jsPDF } = await import('jspdf')
          const pdf = new jsPDF({ format: 'a4', unit: 'mm' })
          for (let page = 0; page < canvases.length; page += 1) {
            if (page > 0) pdf.addPage('a4', 'portrait')
            const canvas = canvases[page]
            const placement = a4ImagePlacement(canvas.width, canvas.height, margin)
            pdf.addImage(canvas, 'PNG', placement.x, placement.y, placement.width, placement.height, undefined, 'FAST')
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
          <div className="export-header"><h2>打印五线谱</h2><span>{format === 'pdf' ? 'A4 纵向 · 页边距 10mm' : 'PNG 连续图片'}</span></div>
          <div className="export-content">
            <div className="export-settings">
              <p className="export-width-summary">乐谱宽度 <output>{width}px</output></p>
              <fieldset>
                <legend>格式</legend>
                <label><input type="radio" name="export-format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />PDF（A4 分页）</label>
                <label><input type="radio" name="export-format" checked={format === 'png'} onChange={() => setFormat('png')} />PNG 图片（连续）</label>
              </fieldset>
              {hasBassStaff && <fieldset><legend>低音谱表</legend><label><input type="checkbox" checked={includeBass} onChange={(event) => setIncludeBass(event.currentTarget.checked)} />包含低音谱表</label></fieldset>}
            </div>
            <div className="export-preview" aria-label="打印预览"><div className="export-preview-paper"><div ref={previewRef} /></div></div>
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
