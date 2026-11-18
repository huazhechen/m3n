import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ToneDownloadProgress } from '@m3n/score-renderer/tones'

export function PlaybackLoadingDialog({ downloading, progress }: {
  downloading: boolean
  progress: ToneDownloadProgress
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const percent = downloading && progress.total
    ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : undefined
  const detail = downloading
    ? percent === 100 ? '正在准备钢琴音色…'
      : `正在下载钢琴音色…${percent === undefined ? '' : ` ${percent}%`}`
    : '正在准备乐谱与音频播放器…'
  return createPortal(
    <dialog ref={dialogRef} className="playback-loading-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{downloading ? '加载钢琴音色' : '准备播放'}</h2>
      <p id={descriptionId} role="status">{detail}</p>
      <progress aria-label={downloading ? '音色下载进度' : '播放准备进度'} max={100} value={percent} />
      <button type="button" onClick={() => dialogRef.current?.close()}>后台加载</button>
    </dialog>, document.body,
  )
}
