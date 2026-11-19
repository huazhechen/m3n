import { ResourceLoadingDialog } from './ResourceLoadingDialog'
import { PLAYBACK_TONES, type PlaybackTone, type ToneLoadProgress } from '@m3n/score-renderer/tones'

export function PlaybackLoadingDialog({ tone, progress, onCancelTone }: {
  tone?: PlaybackTone
  progress: ToneLoadProgress | null
  onCancelTone: () => void
}) {
  const label = PLAYBACK_TONES.find(item => item.value === tone)?.label
  const current = tone && progress?.tone === tone ? progress : null
  const percent = tone ? current?.stage === 'ready' ? 98
    : current && current.total > 0 ? Math.min(94, Math.floor(current.completed / current.total * 94))
      : undefined : undefined
  const detail = tone
    ? current?.stage === 'ready' ? `正在准备${label}音色…`
      : `正在下载${label}音色…${percent === undefined ? '' : ` ${percent}%`}`
    : '正在准备乐谱与音频播放器…'
  return <ResourceLoadingDialog
    title={tone ? `加载${label}音色` : '准备播放'}
    description={detail}
    progressLabel={tone ? '音色下载进度' : '播放准备进度'}
    value={percent}
    onCancel={tone ? onCancelTone : undefined}
  />
}
