import { useId, useState, type ReactNode } from 'react'
import {
  PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX, PLAYBACK_SPEED_STEP,
  PLAYBACK_TRANSPOSE_MIN, PLAYBACK_TRANSPOSE_MAX,
} from '../lib/renderer-settings'

type ScoreControlsProps = {
  compact: boolean
  isPlaying: boolean
  isLoading: boolean
  progress: number
  speed: number
  transpose: number
  metronomeEnabled: boolean
  numberedNotation: boolean
  canChangeNotation: boolean
  onTogglePlayback: () => void
  onRestart: () => void
  onSeekStart: () => void
  onSeek: (progress: number) => void
  onSeekCommit: () => void
  onSpeedChange: (speed: number) => void
  onTransposeChange: (transpose: number) => void
  onMetronomeChange: (enabled: boolean) => void
  onNotationChange: (enabled: boolean) => void
  onResetPractice: () => void
  onLayoutSettings: () => void
}

function ControlIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
}

export function ScoreControls(props: ScoreControlsProps) {
  const id = useId()
  const [practiceOpen, setPracticeOpen] = useState(false)
  const playLabel = props.isPlaying ? '暂停' : '播放'
  const practiceChanged = props.speed !== 100 || props.transpose !== 0 || props.metronomeEnabled

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
        {!props.compact && (
          <fieldset className="notation-selector" aria-label="谱式">
            <label><input type="radio" name={`${id}-notation`} aria-label="简谱" checked={props.numberedNotation} disabled={!props.canChangeNotation} onChange={() => props.onNotationChange(true)} /><span>简谱</span></label>
            <label><input type="radio" name={`${id}-notation`} aria-label="五线谱" checked={!props.numberedNotation} onChange={() => props.onNotationChange(false)} /><span>五线谱</span></label>
          </fieldset>
        )}
        <button type="button" className="control-button practice-toggle" aria-label="练习设置" aria-expanded={practiceOpen} aria-controls={`${id}-practice`} onClick={() => setPracticeOpen(!practiceOpen)}>
          <ControlIcon><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6" /></ControlIcon>
          <span>练习设置</span>
          {practiceChanged && <span className="practice-changed" aria-label="已调整练习设置" />}
          <span className="practice-summary">{props.speed / 100}×</span>
          <span className="practice-chevron" aria-hidden="true"><ControlIcon><path d="m8 10 4 4 4-4" /></ControlIcon></span>
        </button>
        {!props.compact && <button type="button" className="control-button settings-toggle" aria-label="排版设置" title="排版设置" onClick={props.onLayoutSettings}>
          <ControlIcon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h8M8 16h5" /></ControlIcon><span>排版</span>
        </button>}
      </div>
      <div id={`${id}-practice`} className="practice-panel" hidden={!practiceOpen}>
        <div className="practice-panel-heading"><span>练习设置</span><button type="button" className="control-reset" disabled={!practiceChanged || props.isLoading} onClick={props.onResetPractice}>恢复默认</button></div>
        <div className="practice-settings-grid">
          <div className="playback-speed">
            <label className="control-field-heading" htmlFor={`${id}-speed`}><span>播放速度</span><output>{props.speed}%</output></label>
            <input id={`${id}-speed`} type="range" min={PLAYBACK_SPEED_MIN} max={PLAYBACK_SPEED_MAX} step={PLAYBACK_SPEED_STEP} value={props.speed} aria-label="播放速度" onChange={event => props.onSpeedChange(Number(event.currentTarget.value))} />
            <div className="speed-presets" role="group" aria-label="常用速度">
              {[75, 100, 125].map(speed => <button key={speed} type="button" aria-pressed={props.speed === speed} onClick={() => props.onSpeedChange(speed)}>{speed === 100 ? '原速' : `${speed / 100}×`}</button>)}
            </div>
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
      </div>
    </div>
  )
}
