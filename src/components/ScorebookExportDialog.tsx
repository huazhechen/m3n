import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createScorePdf, downloadBlob, preloadScorePdf, scoreFileName } from '@m3n/score-renderer/view'
import type { ScorebookProgress } from '../lib/online-scorebook'

type ReadyBook = { blob: Blob; title: string; scoreCount: number; pageCount: number; sharedPages: number }

export function ScorebookExportDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<ScorebookProgress>({ completed: 0, total: 0, title: '' })
  const [status, setStatus] = useState('正在准备谱集…')
  const [book, setBook] = useState<ReadyBook | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => { dialog?.close(); previousFocus?.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const check = () => controller.signal.throwIfAborted()
    setBook(null); setError(''); setProgress({ completed: 0, total: 0, title: '' }); setStatus('正在准备谱集…')
    void (async () => {
      // Let the dialog paint before starting layout and PDF work.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      check()
      const [{ buildOnlineScorebook, scorebookTitle }] = await Promise.all([import('../lib/online-scorebook'), preloadScorePdf()])
      check()
      const result = await buildOnlineScorebook(controller.signal, value => {
        check(); setProgress(value)
        const label = value.phase === 'preparing' ? '正在准备乐谱与字体' : value.phase === 'measuring' ? '正在计算排版' : '正在生成页面'
        setStatus(value.phase === 'packing' ? '正在安排章节与合页…' : `${label} ${Math.floor(value.completed)} / ${value.total} 首`)
      })
      check(); setProgress({ completed: 0, total: result.pages.length, title: '' })
      const blob = await createScorePdf(result.pages, (done, total) => {
        check(); setProgress({ completed: done, total, title: '' }); setStatus(`正在生成 PDF：${done}/${total} 页…`)
      }, { fullPage: true, signal: controller.signal, onPhase(phase) {
        check()
        setStatus({ loading: '正在加载导出模块…', fonts: '正在准备音乐字体…', pages: '正在生成 PDF 页面…', saving: '正在打包 PDF…' }[phase])
      } })
      check()
      setBook({ blob, title: scorebookTitle, scoreCount: result.scoreCount, pageCount: result.pages.length, sharedPages: result.sharedPages })
      setStatus('PDF 已准备好。')
    })().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '谱集生成失败，请重试。')
    })
    return () => controller.abort()
  }, [attempt])
  return createPortal(<dialog ref={dialogRef} className="pdf-export-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id={titleId}>导出全量谱集</h2>
    <p>全部内置乐谱按音乐类型编排，含封面与目录。</p>
    <div role="status" aria-live="polite">
      {book ? <p>PDF 已准备好：{book.scoreCount} 首，共 {book.pageCount} 页，含 {book.sharedPages} 个合页。</p>
        : <><p>{error ? '谱集生成已停止。' : status}</p><p className="scorebook-current-title">{progress.title}</p></>}
    </div>
    {!book && <progress aria-label="谱集生成进度" max={progress.total || 1} value={progress.total ? progress.completed : undefined} />}
    {error && <p role="alert">{error}</p>}
    <div className="pdf-export-actions">
      <button type="button" onClick={onClose}>{book || error ? '关闭' : '取消'}</button>
      {error && <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button>}
      {book && <button type="button" onClick={() => downloadBlob(book.blob, `${scoreFileName(book.title)}.pdf`)}>下载 PDF</button>}
    </div>
  </dialog>, document.body)
}
