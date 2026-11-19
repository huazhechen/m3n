import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PLAYBACK_TONES, type PlaybackTone, type ToneGenerationProgress } from '@m3n/score-renderer/tones'

export function PlaybackLoadingDialog({ tone, progress, onCancelTone }: {
  tone?: PlaybackTone
  progress: ToneGenerationProgress | null
  onCancelTone: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const label = PLAYBACK_TONES.find(item => item.value === tone)?.label
  const current = tone && progress?.tone === tone ? progress : null
  const percent = tone ? current ? current.stage === 'ready' ? 98
    : current.stage === 'packing' ? 95 : Math.floor(current.completed / current.total * 94) : 0 : undefined
  const detail = tone
    ? current?.stage === 'ready' ? `正在准备${label}音色…`
      : current?.stage === 'packing' ? `正在整理${label}音色…`
        : `正在生成${label}音色… ${percent}%`
    : '正在准备乐谱与音频播放器…'
  return createPortal(
    <dialog ref={dialogRef} className="playback-loading-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{tone ? `生成${label}音色` : '准备播放'}</h2>
      <p id={descriptionId} role="status">{detail}</p>
      <progress aria-label={tone ? '音色生成进度' : '播放准备进度'} max={100} value={percent} />
      <div className="playback-loading-actions">
        {tone && <button type="button" onClick={onCancelTone}>取消生成</button>}
        <button type="button" onClick={() => dialogRef.current?.close()}>后台加载</button>
      </div>
    </dialog>, document.body,
  )
}
