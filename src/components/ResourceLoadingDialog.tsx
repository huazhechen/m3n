import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Shared loading dialog for optional resources, including tones and notation. */
export function ResourceLoadingDialog({ title, description, progressLabel, value, onCancel }: {
  title: string
  description: string
  progressLabel: string
  value?: number
  onCancel?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return createPortal(
    <dialog ref={dialogRef} className="playback-loading-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId} role="status">{description}</p>
      <progress aria-label={progressLabel} max={100} value={value} />
      <div className="playback-loading-actions">
        {onCancel && <button type="button" onClick={onCancel}>取消加载</button>}
        <button type="button" onClick={() => dialogRef.current?.close()}>后台加载</button>
      </div>
    </dialog>, document.body,
  )
}
