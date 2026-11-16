import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PLAYBACK_TONES, type PlaybackTone } from '@m3n/score-renderer/tones'
import {
  PLAYBACK_BPM_MIN, PLAYBACK_BPM_MAX,
  PLAYBACK_TRANSPOSE_MIN, PLAYBACK_TRANSPOSE_MAX,
} from '../lib/renderer-settings'

type ScoreControlsProps = {
  compact: boolean
  isPlaying: boolean
  isLoading: boolean
  progress: number
  defaultBpm: number
  bpm: number
  beatUnit: number
  transpose: number
  metronomeEnabled: boolean
  tone: PlaybackTone
  toneLoading: boolean
  toneError: string
  onToneChange: (tone: PlaybackTone) => void
  onToneRetry: () => void
  onTogglePlayback: () => void
  onRestart: () => void
  onSeekStart: () => void
  onSeek: (progress: number) => void
  onSeekCommit: () => void
  onBpmChange: (bpm: number) => void
  onTransposeChange: (transpose: number) => void
  onMetronomeChange: (enabled: boolean) => void
  onResetPlayback: () => void
  onLayoutSettings: () => void
}

function ControlIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
}

export function ScoreControls(props: ScoreControlsProps) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [bpmDraft, setBpmDraft] = useState(String(props.bpm))
  useEffect(() => { setBpmDraft(String(props.bpm)) }, [props.bpm])
  const settingsChanged = props.tone !== 'synth' || props.bpm !== props.defaultBpm || props.transpose !== 0 || props.metronomeEnabled
  const playLabel = props.isPlaying ? '暂停' : '播放'
  const beatName = ({ 1: '全音符', 2: '二分音符', 4: '四分音符', 8: '八分音符', 16: '十六分音符', 32: '三十二分音符', 64: '六十四分音符' } as Record<number, string>)[props.beatUnit] ?? `${props.beatUnit} 分音符`
  const commitBpm = () => {
    const parsed = bpmDraft.trim() === '' ? props.bpm : Number(bpmDraft)
    const next = Number.isFinite(parsed) ? Math.max(PLAYBACK_BPM_MIN, Math.min(PLAYBACK_BPM_MAX, Math.round(parsed))) : props.bpm
    setBpmDraft(String(next))
    props.onBpmChange(next)
  }

  return (
    <div className="audio-controls" role="group" aria-label="乐谱控制">
      <div className="playback-transport">
        <button type="button" className="control-button playback-toggle" aria-label={playLabel} aria-busy={props.isLoading || undefined} disabled={props.isLoading} onClick={props.onTogglePlayback}>
          <ControlIcon>{props.isPlaying ? <path d="M8 5v14M16 5v14" strokeWidth="4" /> : <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />}</ControlIcon>
          <span>{props.isLoading ? '加载中' : playLabel}</span>
        </button>
        <button type="button" className="control-button control-icon-button playback-restart" aria-label="回到开头" title="回到开头" disabled={props.isLoading} onClick={props.onRestart}>
          <ControlIcon><path d="M9 4 5 8l4 4M5 8h8a7 7 0 1 1-6.5 9.6" /></ControlIcon>
        </button>
        <div className="playback-progress">
          <div className="control-field-heading"><span>播放进度</span><output>{Math.round(props.progress * 100)}%</output></div>
          <input type="range" min="0" max="1000" value={Math.round(props.progress * 1000)} aria-label="播放位置"
            onPointerDown={props.onSeekStart} onKeyDown={props.onSeekStart} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit}
            onInput={event => props.onSeek(Number(event.currentTarget.value) / 1000)} />
        </div>
      </div>
      <div className="score-control-actions">
        <button type="button" className="control-button playback-settings-toggle" aria-label="播放设置" title="播放设置" aria-haspopup="dialog" aria-controls={`${id}-playback-settings`} onClick={() => dialogRef.current?.showModal()}>
          <ControlIcon><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6" /></ControlIcon>
          <span>播放设置</span>
          <span className="playback-tempo-summary">{props.bpm} BPM</span>
        </button>
        {!props.compact && <button type="button" className="control-button settings-toggle" aria-label="排版设置" title="排版设置" onClick={props.onLayoutSettings}>
          <ControlIcon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h8M8 16h5" /></ControlIcon><span>排版</span>
        </button>}
      </div>
      <dialog ref={dialogRef} id={`${id}-playback-settings`} className="renderer-settings-dialog playback-settings-dialog" aria-labelledby={`${id}-playback-settings-title`}>
        <div className="renderer-settings-header"><h2 id={`${id}-playback-settings-title`}>播放设置</h2><button type="button" className="action-button" onClick={() => dialogRef.current?.close()}>关闭</button></div>
        <div className="playback-settings-actions"><button type="button" className="control-reset" disabled={!settingsChanged || props.isLoading} onClick={props.onResetPlayback}>恢复默认</button></div>
        <div className="playback-settings-grid">
          <div className="playback-tone">
            <label className="control-field-heading" htmlFor={`${id}-tone`}>播放音色</label>
            <select id={`${id}-tone`} aria-label="播放音色" value={props.tone}
              onChange={event => props.onToneChange(event.currentTarget.value as PlaybackTone)}>
              {PLAYBACK_TONES.map(tone => <option key={tone.value} value={tone.value}>{tone.label}</option>)}
            </select>
            <p className="control-hint" role="status" aria-live="polite">
              {props.toneError || (props.toneLoading ? '正在加载音色…' : props.tone === 'synth' ? '本地合成，无需下载音源' : '音色已就绪')}
            </p>
            {props.toneError && <button type="button" className="action-button" onClick={props.onToneRetry}>重试加载音色</button>}
            <span className="control-hint">钢琴、口琴首次选择时下载，之后优先使用本地缓存。选择会自动保存。</span>
          </div>
          <div className="playback-speed">
            <label className="control-field-heading" htmlFor={`${id}-bpm`}>播放速度 <span className="control-hint">BPM</span></label>
            <input id={`${id}-bpm`} className="playback-bpm-input" type="number" inputMode="numeric" min={PLAYBACK_BPM_MIN} max={PLAYBACK_BPM_MAX} step="1" value={bpmDraft} aria-label="播放速度（BPM）"
              onChange={event => {
                const raw = event.currentTarget.value
                setBpmDraft(raw)
                const value = Number(raw)
                if (raw !== '' && Number.isInteger(value) && value >= PLAYBACK_BPM_MIN && value <= PLAYBACK_BPM_MAX) props.onBpmChange(value)
              }} onBlur={commitBpm} onKeyDown={event => { if (event.key === 'Enter') { commitBpm(); event.currentTarget.blur() } }} />
            <input type="range" min={PLAYBACK_BPM_MIN} max={PLAYBACK_BPM_MAX} step="1" value={props.bpm} aria-label="播放速度" onChange={event => props.onBpmChange(Number(event.currentTarget.value))} />
            <span className="control-hint">10–240 BPM，{beatName}为一拍</span>
          </div>
          <div className="playback-transpose" role="group" aria-label="播放移调">
            <div className="control-field-heading"><span>播放移调</span><span className="control-hint">半音</span></div>
            <div className="transpose-stepper">
              <button type="button" className="control-button control-icon-button" aria-label="降低半音" disabled={props.transpose <= PLAYBACK_TRANSPOSE_MIN || props.isLoading} onClick={() => props.onTransposeChange(props.transpose - 1)}><ControlIcon><path d="M5 12h14" /></ControlIcon></button>
              <output aria-live="polite">{props.transpose === 0 ? '原调' : props.transpose > 0 ? `+${props.transpose}` : props.transpose}</output>
              <button type="button" className="control-button control-icon-button" aria-label="升高半音" disabled={props.transpose >= PLAYBACK_TRANSPOSE_MAX || props.isLoading} onClick={() => props.onTransposeChange(props.transpose + 1)}><ControlIcon><path d="M5 12h14M12 5v14" /></ControlIcon></button>
            </div>
          </div>
          <label className="playback-metronome">
            <span><span className="control-field-title">节拍器</span><span className="control-hint">预备拍与播放打拍</span></span>
            <span className="switch-control">
              <input type="checkbox" role="switch" aria-label="节拍器" checked={props.metronomeEnabled} disabled={props.isLoading} onChange={event => props.onMetronomeChange(event.currentTarget.checked)} />
              <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            </span>
          </label>
        </div>
      </dialog>
    </div>
  )
}
