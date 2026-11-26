import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

/** Shared progress presentation, including inside an existing export dialog. */
export function ResourceLoadingProgress({ description, progressLabel, value, max = 100 }: {
  description: string
  progressLabel: string
  value?: number
  max?: number
}) {
  return <div className="resource-loading-progress">
    <p role="status" aria-live="polite">{description}</p>
    <progress aria-label={progressLabel} max={max} value={value} />
  </div>
}

/** Delay fast/cache hits; keep an opened dialog through subsequent preparation. */
type LoadingTask = {
  title: string
  description: string
  progressLabel: string
  value?: number
  onCancel?: () => void
  active?: boolean
  loading?: boolean
  error?: string
  onRetry?: () => void
  backgroundLabel?: string
}
const tasks = new Map<string, LoadingTask>()
const listeners = new Set<() => void>()
let snapshot: LoadingTask[] = []
const empty: LoadingTask[] = []
function publish() {
  snapshot = [...tasks.values()]
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Register resources here so source, render and audio stages share one modal. */
export function ResourceLoadingDialog(props: LoadingTask) {
  const id = useId()
  useEffect(() => {
    if (props.active === false) tasks.delete(id)
    else tasks.set(id, props)
    publish()
  }, [id, props])
  useEffect(() => () => { tasks.delete(id); publish() }, [id])
  return null
}

/** Lives outside route Suspense, retaining dismissal and focus across stages. */
export function ResourceLoadingHost() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => empty)
  const selected = current.find(task => task.loading !== false) ?? current[0]
  const [retained, setRetained] = useState<LoadingTask | null>(null)
  useEffect(() => {
    if (selected) { setRetained(selected); return }
    // Allow a completed source request to hand off to rendering without reopening.
    const timer = setTimeout(() => setRetained(null), 150)
    return () => clearTimeout(timer)
  }, [selected])
  const task = selected ?? retained
  return task ? <ResourceLoadingModal {...task} active loading={Boolean(selected && selected.loading !== false)} /> : null
}

function ResourceLoadingModal({ title, description, progressLabel, value, onCancel,
  active = true, loading = true, error, onRetry, backgroundLabel = '后台加载',
}: LoadingTask) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!active) { setVisible(false); setDismissed(false); return }
    if (dismissed || !loading) return
    const timer = setTimeout(() => setVisible(true), 350)
    return () => clearTimeout(timer)
  }, [active, loading, dismissed])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!visible || !active || dismissed || !dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus() }
  }, [visible, active, dismissed])
  const dismiss = () => { setDismissed(true); setVisible(false) }
  return visible && active && !dismissed ? createPortal(
    <dialog ref={dialogRef} className="playback-loading-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); dismiss() }}>
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId}>{error ? <p role="alert">{error}</p> : <ResourceLoadingProgress description={description} progressLabel={progressLabel} value={value} />}</div>
      <div className="playback-loading-actions">
        {onCancel && <button type="button" onClick={onCancel}>取消加载</button>}
        {error && onRetry && <button type="button" onClick={onRetry}>重试加载</button>}
        <button type="button" onClick={dismiss}>{error ? '关闭' : backgroundLabel}</button>
      </div>
    </dialog>, document.body,
  ) : null
}
