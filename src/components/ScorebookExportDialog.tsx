import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createScorePdf, downloadBlob, preloadScorePdf, scoreFileName } from '@m3n/score-renderer/view'
import { readRendererSetting } from '../lib/renderer-settings'
import type { ScorebookProgress } from '../lib/online-scorebook'

type ReadyBook = { blob: Blob; title: string; scoreCount: number; pageCount: number; sharedPages: number }

export function ScorebookExportDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [attempt, setAttempt] = useState(0)
  const [notationMode, setNotationMode] = useState<'staff' | 'movable' | null>(null)
  const [measureNumbers] = useState(() => readRendererSetting('m3n:measure-numbers', 0, 0, 1) === 1)
  const [progress, setProgress] = useState<ScorebookProgress>({ completed: 0, total: 0, title: '' })
  const [status, setStatus] = useState('正在加载排版模块…')
  const [stage, setStage] = useState(2)
  const [book, setBook] = useState<ReadyBook | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => { dialog?.close(); previousFocus?.focus() }
  }, [])
  useEffect(() => {
    if (!notationMode) return
    const controller = new AbortController()
    const check = () => controller.signal.throwIfAborted()
    setBook(null); setError(''); setStage(2); setProgress({ completed: 0, total: 0, title: '' }); setStatus('正在加载排版模块…')
    void (async () => {
      // Let the dialog paint before starting layout and PDF work.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      check()
      // Fetch PDF code in parallel without delaying layout. PDF generation
      // awaits it and reports any load failure in its own stage.
      void preloadScorePdf().catch(() => {})
      const { buildOnlineScorebook, scorebookTitle } = await import('../lib/online-scorebook')
      check()
      const result = await buildOnlineScorebook(controller.signal, value => {
        check()
        if (value.phase === 'downloading') {
          // The toolbar already awaits shared resources. A cached completion
          // snapshot must not put the dialog back into the download stage.
          if (value.total > 0 && value.completed >= value.total && !value.indeterminate) return
          setStage(1); setProgress(value)
          setStatus(value.indeterminate ? '正在安装字体…' : `正在下载乐谱与字体 ${Math.floor(100 * value.completed / (value.total || 1))}%`)
        } else {
          setStage(2)
          setProgress({ ...value, total: value.total * 3,
            completed: value.completed + (value.phase === 'measuring' ? value.total : value.phase === 'rendering' || value.phase === 'packing' ? 2 * value.total : 0),
            indeterminate: value.phase === 'packing' })
          const label = value.phase === 'preparing' ? '正在解析乐谱' : value.phase === 'measuring' ? '正在计算排版' : '正在绘制页面'
          setStatus(value.phase === 'packing' ? '正在安排章节与合页…' : `${label} ${Math.floor(value.completed)} / ${value.total} 首`)
        }
      }, { notationMode, measureNumbers })
      check(); setStage(3); setProgress({ completed: 0, total: result.pages.length, title: '' })
      const blob = await createScorePdf(result.pages, (done, total) => {
        check(); setProgress({ completed: done, total, title: '' }); setStatus(`正在生成 PDF：${done}/${total} 页…`)
      }, { fullPage: true, signal: controller.signal, onPhase(phase) {
        check()
        if (phase === 'saving' || phase === 'fonts' || phase === 'loading') {
          setProgress(value => ({ ...value, indeterminate: true }))
        } else if (phase === 'pages') {
          setProgress({ completed: 0, total: result.pages.length, title: '' })
        }
        setStatus({ loading: '正在加载导出模块…', fonts: '正在准备音乐字体…', pages: '正在生成 PDF 页面…', saving: '正在打包 PDF…' }[phase])
      } })
      check()
      setBook({ blob, title: scorebookTitle, scoreCount: result.scoreCount, pageCount: result.pages.length, sharedPages: result.sharedPages })
      setStatus('PDF 已准备好。')
    })().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '谱集生成失败，请重试。')
    })
    return () => controller.abort()
  }, [attempt, notationMode, measureNumbers])
  return createPortal(<dialog ref={dialogRef} className="pdf-export-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id={titleId}>导出全量谱集</h2>
    <p>全部内置乐谱按音乐类型编排，含封面与目录。</p>
    {!notationMode ? <>
      <p>请选择全量谱集的记谱方式，选择后开始生成 PDF。</p>
      <div className="pdf-export-actions">
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={() => setNotationMode('staff')}>五线谱</button>
        <button type="button" onClick={() => setNotationMode('movable')}>简谱</button>
      </div>
    </> : <>
      <p>记谱方式：{notationMode === 'staff' ? '五线谱' : '简谱'}。</p>
      <div role="status" aria-live="polite">
        {book ? <p>PDF 已准备好：{book.scoreCount} 首，共 {book.pageCount} 页，含 {book.sharedPages} 个合页。</p>
          : <><p>第 {stage}/3 阶段：{['下载乐谱与字体', '排版乐谱', '生成 PDF'][stage - 1]}</p><p>{error ? '谱集生成已停止。' : status}</p><p className="scorebook-current-title">{progress.phase === 'downloading' ? '' : progress.title}</p></>}
      </div>
      {!book && <progress aria-label="谱集生成进度" max={progress.total || 1} value={progress.total && !progress.indeterminate ? progress.completed : undefined} />}
      {error && <p role="alert">{error}</p>}
      <div className="pdf-export-actions">
        <button type="button" onClick={onClose}>{book || error ? '关闭' : '取消'}</button>
        {error && <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button>}
        {book && <button type="button" onClick={() => downloadBlob(book.blob, `${scoreFileName(book.title)}.pdf`)}>下载 PDF</button>}
      </div>
    </>}
  </dialog>, document.body)
}
