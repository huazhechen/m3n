import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ScoreDocument, ScoreHeaderMetadata } from '@m3n/notation'
import { a4ImagePlacement, downloadBlob, renderScoreCanvas, scoreFileName, stackScoreCanvases } from '@m3n/score-renderer/view'
import { renderScoreInto } from '../lib/render-score'
import { readRendererSetting, writeRendererSetting } from '../lib/renderer-settings'

type ExportFormat = 'png' | 'pdf' | 'svg'
type ScoreExportDialogProps = {
  mei: string | (() => string)
  scoreDocument?: ScoreDocument
  numberedNotation: boolean
  title: string
  width: number
  hasBassStaff: boolean
  headerMetadata: ScoreHeaderMetadata[]
  onError: (message: string) => void
}
export type ScoreExportDialogRef = { open: () => void }

export const ScoreExportDialog = forwardRef<ScoreExportDialogRef, ScoreExportDialogProps>(
  function ScoreExportDialog({ mei, scoreDocument, numberedNotation, title, width, hasBassStaff, headerMetadata, onError }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const [format, setFormat] = useState<ExportFormat>('pdf')
    const [includeBass, setIncludeBass] = useState(true)
    const [printWidth, setPrintWidth] = useState(() => readRendererSetting('m3n:print-width', width, 320, 2560))
    const [isOpen, setIsOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [previewAttempt, setPreviewAttempt] = useState(0)
    const [previewError, setPreviewError] = useState('')
    useImperativeHandle(ref, () => ({ open() { setIncludeBass(hasBassStaff); setIsOpen(true); dialogRef.current?.showModal() } }), [hasBassStaff])
    useEffect(() => {
      const preview = previewRef.current
      if (!isOpen || !preview) return
      const controller = new AbortController()
      setIsPreviewing(true); setPreviewError('')
      void renderScoreInto(preview, { mei, scoreDocument, numberedNotation, headerMetadata, width: printWidth,
        paged: format === 'pdf', includeBass, sheetClass: 'export-preview-page', signal: controller.signal,
      }).catch((error: unknown) => { if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : '打印预览失败。') })
        .finally(() => { if (!controller.signal.aborted) setIsPreviewing(false) })
      return () => controller.abort()
    }, [format, headerMetadata, includeBass, isOpen, mei, numberedNotation, printWidth, scoreDocument, previewAttempt])

    const exportScore = async () => {
      setIsExporting(true); onError('')
      const paper = document.createElement('div')
      paper.style.cssText = `position:fixed;left:-20000px;top:0;width:${printWidth}px;pointer-events:none;`
      document.body.append(paper)
      try {
        await renderScoreInto(paper, { mei, scoreDocument, numberedNotation, headerMetadata, width: printWidth, paged: format === 'pdf', includeBass })
        const svgs = [...paper.querySelectorAll<SVGSVGElement>(':scope > svg')]
        if (!svgs.length) throw new Error('当前没有可导出的乐谱。')
        const { outlineSvgText } = await import('../lib/vector-export')
        for (const svg of svgs) await outlineSvgText(svg)
        const fileName = scoreFileName(title)
        if (format === 'svg') {
          // Continuous layout produces a single complete SVG in both notations.
          if (svgs.length !== 1) throw new Error('连续 SVG 排版意外产生多页，请重试。')
          downloadBlob(new Blob([new XMLSerializer().serializeToString(svgs[0])], { type: 'image/svg+xml;charset=utf-8' }), `${fileName}.svg`)
        } else if (format === 'png') {
          const canvases = []
          for (const svg of svgs) canvases.push(await renderScoreCanvas(svg, printWidth, 2))
          const canvas = stackScoreCanvases(canvases)
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
      } catch (error) { onError(error instanceof Error ? error.message : '导出失败。') }
      finally { paper.remove(); setIsExporting(false) }
    }
    return <dialog ref={dialogRef} className="export-dialog" onClose={() => setIsOpen(false)}>
      <form onSubmit={event => { event.preventDefault(); void exportScore() }}>
        <div className="export-header"><h2>打印{numberedNotation && scoreDocument ? '简谱' : '五线谱'}</h2><span>{format === 'pdf' ? 'A4 纵向 · 页边距 10mm · 矢量 PDF' : format === 'svg' ? 'SVG 矢量图片' : 'PNG 连续图片'}</span></div>
        <div className="export-content">
          <div className="export-settings">
            <label>打印宽度 <input type="number" min={320} max={2560} step={10} aria-label="打印宽度" value={printWidth} onChange={event => { const value = Number(event.currentTarget.value); if (value >= 320 && value <= 2560) { setPrintWidth(value); writeRendererSetting('m3n:print-width', value) } }} /> px</label>
            <fieldset><legend>格式</legend>
              <label><input type="radio" name="export-format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />PDF（A4 分页）</label>
              <label><input type="radio" name="export-format" checked={format === 'png'} onChange={() => setFormat('png')} />PNG 图片（连续）</label>
              <label><input type="radio" name="export-format" checked={format === 'svg'} onChange={() => setFormat('svg')} />SVG 矢量图（连续）</label>
            </fieldset>
            {hasBassStaff && <fieldset><legend>低音谱表</legend><label><input type="checkbox" checked={includeBass} onChange={event => setIncludeBass(event.currentTarget.checked)} />包含低音谱表</label></fieldset>}
            {isPreviewing && <p role="status">正在排版预览…</p>}
            {previewError && <p role="alert">{previewError} <button type="button" className="action-button" onClick={() => setPreviewAttempt(value => value + 1)}>重试预览</button></p>}
          </div>
          <div className="export-preview" aria-label="打印预览" aria-busy={isPreviewing}><div className="export-preview-paper"><div ref={previewRef} /></div></div>
        </div>
        <div className="export-actions"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isExporting}>取消</button><button type="submit" disabled={isExporting || isPreviewing || Boolean(previewError)}>{isExporting ? '正在生成' : '确认并下载'}</button></div>
      </form>
    </dialog>
  },
)
