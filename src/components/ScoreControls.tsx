import { useEffect, useState, type ReactNode } from 'react'
import type { PlaybackTone } from '@m3n/score-renderer/tones'
import { PLAYBACK_BPM_MIN, PLAYBACK_BPM_MAX, PLAYBACK_TRANSPOSE_MIN, PLAYBACK_TRANSPOSE_MAX, SCORE_WIDTH_MIN, SCORE_WIDTH_MAX } from '../lib/renderer-settings'

type ScoreControlsProps = {
  isPlaying: boolean
  isLoading: boolean
  progress: number
  bpm: number
  width: number
  transpose: number
  metronomeEnabled: boolean
  measureNumbers: boolean
  tone: PlaybackTone
  toneLoading: boolean
  toneError: string
  onToneChange: (tone: PlaybackTone) => void
  onToneRetry: () => void
  onTogglePlayback: () => void
  onSeekStart: () => void
  onSeek: (progress: number) => void
  onSeekCommit: () => void
  onBpmChange: (bpm: number) => void
  onResetBpm: () => void
  onWidthChange: (width: number) => void
  onResetWidth: () => void
  onTransposeChange: (transpose: number) => void
  onMetronomeChange: (enabled: boolean) => void
  onMeasureNumbersChange: (enabled: boolean) => void
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}
const resetIcon = <Icon><path d="M9 4 5 8l4 4M5 8h8a7 7 0 1 1-6.5 9.6" /></Icon>

export function ScoreControls(props: ScoreControlsProps) {
  const [bpmDraft, setBpmDraft] = useState(String(props.bpm))
  useEffect(() => { setBpmDraft(String(props.bpm)) }, [props.bpm])
  const commitBpm = () => {
    const value = bpmDraft.trim() === '' ? props.bpm : Number(bpmDraft)
    const next = Number.isFinite(value) ? Math.max(PLAYBACK_BPM_MIN, Math.min(PLAYBACK_BPM_MAX, Math.round(value))) : props.bpm
    setBpmDraft(String(next)); props.onBpmChange(next)
  }
  const playLabel = props.isPlaying ? '暂停' : '播放'
  return <div className="audio-controls" role="group" aria-label="乐谱控制">
    <div className="control-sliders">
      <div className="control-slider-row">
        <span className="control-row-label">进度<output>{Math.round(props.progress * 100)}%</output></span>
        <input type="range" min="0" max="1000" value={Math.round(props.progress * 1000)} aria-label="播放位置"
          onPointerDown={props.onSeekStart} onKeyDown={props.onSeekStart} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit}
          onInput={event => props.onSeek(Number(event.currentTarget.value) / 1000)} />
        <button type="button" className="control-button playback-toggle" aria-label={playLabel} title={props.isLoading ? '加载中' : playLabel} aria-busy={props.isLoading || undefined} disabled={props.isLoading} onClick={props.onTogglePlayback}>
          <Icon>{props.isPlaying ? <path d="M8 5v14M16 5v14" strokeWidth="4" /> : <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />}</Icon><span>{props.isLoading ? '加载中' : playLabel}</span>
        </button>
      </div>
      <div className="control-slider-row">
        <label className="control-row-label">速度<input type="number" aria-label="播放速度（BPM）" title="BPM（10–240）" min={PLAYBACK_BPM_MIN} max={PLAYBACK_BPM_MAX} value={bpmDraft}
          onChange={event => { const raw = event.currentTarget.value; setBpmDraft(raw); const value = Number(raw); if (raw !== '' && Number.isInteger(value) && value >= PLAYBACK_BPM_MIN && value <= PLAYBACK_BPM_MAX) props.onBpmChange(value) }} onBlur={commitBpm} onKeyDown={event => { if (event.key === 'Enter') { commitBpm(); event.currentTarget.blur() } }} /><span className="bpm-unit">BPM</span></label>
        <input type="range" min={PLAYBACK_BPM_MIN} max={PLAYBACK_BPM_MAX} step="1" value={props.bpm} aria-label="播放速度" onChange={event => props.onBpmChange(Number(event.currentTarget.value))} />
        <button type="button" className="control-button" aria-label="还原速度" title="还原乐谱原速" onClick={props.onResetBpm}>{resetIcon}<span>还原</span></button>
      </div>
      <div className="control-slider-row">
        <span className="control-row-label">宽度<output>{props.width}px</output></span>
        <input type="range" min={SCORE_WIDTH_MIN} max={SCORE_WIDTH_MAX} step="1" value={props.width} aria-label="乐谱宽度" onChange={event => props.onWidthChange(Number(event.currentTarget.value))} />
        <button type="button" className="control-button" aria-label="还原宽度" title="还原谱集经典宽度" onClick={props.onResetWidth}>{resetIcon}<span>还原</span></button>
      </div>
    </div>
    <div className="control-options">
      <div className="control-toggle-pair">
        <button type="button" role="switch" aria-label="钢琴音色" aria-checked={props.tone === 'piano'} title="钢琴音色（关闭使用合成音色）" className="control-button" onClick={() => props.onToneChange(props.tone === 'piano' ? 'synth' : 'piano')}>
          <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7.5 13v7m4.5-7v7m4.5-7v7M7 4v8h3V4m4 0v8h3V4" /></Icon><span>钢琴</span>
        </button>
        <button type="button" role="switch" aria-label="小节号" aria-checked={props.measureNumbers} title="显示小节号" className="control-button" onClick={() => props.onMeasureNumbersChange(!props.measureNumbers)}>
          <Icon><path d="m10 3-4 18M18 3l-4 18M4 9h17M3 15h17" /></Icon><span>小节号</span>
        </button>
      </div>
      <div className="transpose-stepper" role="group" aria-label="播放移调">
        <button type="button" className="control-button" aria-label="降低半音" title="降低半音" disabled={props.transpose <= PLAYBACK_TRANSPOSE_MIN || props.isLoading} onClick={() => props.onTransposeChange(props.transpose - 1)}><Icon><path d="M5 12h14" /></Icon></button>
        <output aria-live="polite" title="移调（半音）">{props.transpose === 0 ? '原调' : props.transpose > 0 ? `+${props.transpose}` : props.transpose}</output>
        <button type="button" className="control-button" aria-label="升高半音" title="升高半音" disabled={props.transpose >= PLAYBACK_TRANSPOSE_MAX || props.isLoading} onClick={() => props.onTransposeChange(props.transpose + 1)}><Icon><path d="M5 12h14M12 5v14" /></Icon></button>
      </div>
      <button type="button" role="switch" aria-label="节拍器" aria-checked={props.metronomeEnabled} title="节拍器" className="control-button metronome-toggle" disabled={props.isLoading} onClick={() => props.onMetronomeChange(!props.metronomeEnabled)}>
        <Icon><path d="m9 3-5 18h16L15 3ZM8 16h8M12 16l5-9" /></Icon><span>节拍器</span>
      </button>
    </div>
    {(props.toneLoading || props.toneError) && <div className="control-tone-status" role="status">{props.toneError || '正在下载钢琴音色…'}{props.toneError && <button type="button" className="control-button" onClick={props.onToneRetry}>重试加载音色</button>}</div>}
  </div>
}
