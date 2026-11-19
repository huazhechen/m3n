import { useEffect, useRef, useState } from 'react'
import { createScorePdf, downloadBlob, preloadScorePdf, scoreFileName } from '@m3n/score-renderer/view'
import { loadBuiltinPdfFont } from '../lib/builtin-pdf-font'

export type PdfPages = { pages: SVGSVGElement[]; title: string; fullPage?: boolean }

/** Single scores and scorebooks use the same visible, cancellable download flow. */
export function PdfDownloadPanel({ prepare, onClose, closeOnSuccess = false, titleId }: {
  prepare: (signal: AbortSignal) => Promise<PdfPages>
  onClose: () => void
  closeOnSuccess?: boolean
  titleId?: string
}) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('正在加载导出模块…')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const activeController = useRef<AbortController | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const controller = new AbortController()
    activeController.current = controller
    const check = () => controller.signal.throwIfAborted()
    setError(''); setFinished(false); setProgress({ done: 0, total: 0 }); setStatus('正在加载导出模块…')
    void (async () => {
      // Paint the progress panel before doing synchronous layout or font work.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      check()
      await preloadScorePdf()
      check(); setStatus('正在准备分页…')
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      check()
      const result = await prepare(controller.signal)
      check(); setProgress({ done: 0, total: result.pages.length })
      let textFont: Uint8Array | undefined
      setStatus('正在准备 PDF 文字字体…')
      try { textFont = await loadBuiltinPdfFont(controller.signal) }
      catch { check() /* Font retrieval must not prevent the existing PDF fallback. */ }
      check()
      const blob = await createScorePdf(result.pages, (done, total) => {
        check(); setProgress({ done, total }); setStatus(`正在生成 PDF：${done}/${total} 页…`)
      }, { fullPage: result.fullPage, textFont, signal: controller.signal, onPhase(phase) {
        check()
        setStatus({ loading: '正在加载导出模块…', fonts: '正在准备音乐字体…', pages: '正在生成 PDF 页面…', saving: '正在打包 PDF…' }[phase])
      } })
      check(); downloadBlob(blob, `${scoreFileName(result.title)}.pdf`)
      setStatus('下载已开始。'); setFinished(true)
      if (closeOnSuccess) closeRef.current()
    })().catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'PDF 生成失败，请重试。')
    })
    return () => controller.abort()
  }, [prepare, attempt, closeOnSuccess])
  return <>
    <h2 id={titleId}>导出 PDF</h2>
    <p role="status" aria-live="polite">{error ? 'PDF 生成已停止。' : status}</p>
    <progress aria-label="PDF 生成进度" max={progress.total || 1} value={progress.total ? progress.done : undefined} />
    {error && <p role="alert">{error}</p>}
    <div className="scorebook-export-actions">
      <button type="button" onClick={() => { activeController.current?.abort(); onClose() }}>{finished || error ? '关闭' : '取消'}</button>
      {error && <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button>}
    </div>
  </>
}
