import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { preloadScorePdf } from '@m3n/score-renderer/view'
import { PdfDownloadPanel } from './PdfDownloadPanel'
import type { OnlineScorebook, ScorebookProgress } from '../lib/online-scorebook'

export function ScorebookExportDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<ScorebookProgress>({ completed: 0, total: 0, title: '' })
  const [book, setBook] = useState<OnlineScorebook | null>(null)
  const [error, setError] = useState('')
  const [pdfMode, setPdfMode] = useState(false)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => { dialog?.close(); previousFocus?.focus() }
  }, [])
  useEffect(() => {
    void preloadScorePdf().catch(() => {})
    const controller = new AbortController()
    setBook(null); setError(''); setProgress({ completed: 0, total: 0, title: '' })
    void import('../lib/online-scorebook').then(({ buildOnlineScorebook }) => {
      controller.signal.throwIfAborted()
      return buildOnlineScorebook(controller.signal, value => { if (!controller.signal.aborted) setProgress(value) })
    }).then(result => { if (!controller.signal.aborted) setBook(result) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '谱集生成失败，请重试。') })
    return () => controller.abort()
  }, [attempt])
  const preparePdf = useCallback(async (signal: AbortSignal) => {
    signal.throwIfAborted()
    if (!book) throw new Error('谱集尚未准备完成。')
    const { scorebookTitle } = await import('../lib/online-scorebook')
    return { pages: book.pages, title: scorebookTitle, fullPage: true }
  }, [book])
  const percent = progress.total ? Math.floor(progress.completed / progress.total * 100) : 0
  return createPortal(<dialog ref={dialogRef} className="scorebook-export-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}>
    {pdfMode ? <PdfDownloadPanel prepare={preparePdf} onClose={onClose} titleId={titleId} /> : <>
    <h2 id={titleId}>导出全量谱集</h2>
    <p>全部内置乐谱按音乐类型编排，含封面与目录。</p>
    <div role="status" aria-live="polite">
      {book ? <p>已生成 {book.scoreCount} 首，共 {book.pages.length} 页，含 {book.sharedPages} 个合页。</p> : error ? <p>谱集生成已停止。</p>
        : <><p>{progress.total ? progress.phase === 'packing' ? '正在优化合页…' : `${progress.phase === 'measuring' ? '正在计算排版' : '正在生成页面'} ${Math.floor(progress.completed)} / ${progress.total} 首（${percent}%）` : '正在准备谱集…'}</p>
          <p className="scorebook-current-title">{progress.title || '加载乐谱与排版工具'}</p></>}
    </div>
    <progress aria-label="谱集生成进度" max={progress.total || 1} value={progress.completed} />
    {book && <p>点击“保存 PDF”直接下载。</p>}
    {error && <p role="alert">{error}</p>}
    <div className="scorebook-export-actions">
      <button type="button" onClick={onClose}>{book || error ? '关闭' : '取消'}</button>
      {error && !book && <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button>}
      {book && <button type="button" onClick={() => setPdfMode(true)}>保存 PDF</button>}
    </div></>}
  </dialog>, document.body)
}
