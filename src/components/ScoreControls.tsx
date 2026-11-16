import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PlaybackTone } from '@m3n/score-renderer/tones'
import { PLAYBACK_BPM_MIN, PLAYBACK_BPM_MAX, SCORE_WIDTH_MIN, SCORE_WIDTH_MAX } from '../lib/renderer-settings'

import { CIRCLE_OF_FIFTHS, TRANSPOSE_KEYS, currentKeyIndex, isMinorKey, keyPitchClass, nearestKeyTranspose } from '../lib/transpose-key'
import { CircleOfFifths } from './CircleOfFifths'

type ScoreControlsProps = {
  playbackOnly?: boolean
  isPlaying: boolean
  isLoading: boolean
  progress: number
  bpm: number
  width: number
  originalKey: string
  transpose: number
  metronomeEnabled: boolean
  paged: boolean
  onPagedChange: (enabled: boolean) => void
  fixedDo: boolean
  onFixedDoChange: (enabled: boolean) => void
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
  const keyDialogRef = useRef<HTMLDialogElement>(null)
  const keyTitleId = useId()
  const settingsId = useId()
  const settingsRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const selectedKey = currentKeyIndex(props.originalKey, props.transpose)
  const selectedKeyLabel = isMinorKey(props.originalKey)
    ? CIRCLE_OF_FIFTHS.find(([, minor]) => keyPitchClass(minor) === selectedKey)![1]
    : TRANSPOSE_KEYS[selectedKey]
  const playLabel = props.isPlaying ? '暂停' : '播放'
  const controls = <div className={props.playbackOnly ? 'audio-controls playback-only' : 'audio-controls floating-controls'} role="group" aria-label="乐谱控制">
    <div className="control-transport">
        <button type="button" className="control-button playback-toggle" aria-label={playLabel} title={props.isLoading ? '加载中' : playLabel} aria-busy={props.isLoading || undefined} disabled={props.isLoading} onClick={props.onTogglePlayback}>
          <Icon>{props.isPlaying ? <path d="M8 5v14M16 5v14" strokeWidth="4" /> : <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />}</Icon><span>{props.isLoading ? '加载中' : playLabel}</span>
        </button>
        <input type="range" min="0" max="1000" value={Math.round(props.progress * 1000)} aria-label="播放位置" aria-valuetext={`${Math.round(props.progress * 100)}%`}
          onPointerDown={props.onSeekStart} onKeyDown={props.onSeekStart} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit}
          onInput={event => props.onSeek(Number(event.currentTarget.value) / 1000)} />
      <button type="button" role="switch" aria-label="节拍器" aria-checked={props.metronomeEnabled} title="节拍器" className="control-button metronome-toggle" disabled={props.isLoading} onClick={() => props.onMetronomeChange(!props.metronomeEnabled)}>
          <Icon><path d="m9 3-5 18h16L15 3ZM8 16h8M12 16l5-9" /></Icon><span>节拍器</span>
        </button>
    </div>
    {!props.playbackOnly && <>
      <button type="button" className="control-button settings-toggle" aria-label="乐谱设置" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsId} popoverTarget={settingsId} title="乐谱设置">
        <Icon><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" /></Icon>
      </button>
      <div ref={settingsRef} id={settingsId} popover="auto" role="dialog" aria-label="乐谱设置" className="control-settings-popover" onToggle={event => setSettingsOpen(event.newState === 'open')}>
        <div className="control-settings-header"><strong>乐谱设置</strong><button type="button" className="control-button" aria-label="关闭乐谱设置" onClick={() => settingsRef.current?.hidePopover()}>×</button></div>
        <div className="control-sliders">
      <div className="control-slider-row">
        <span className="control-row-label">速度<output>{props.bpm} BPM</output></span>
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
      <button type="button" role="switch" aria-label="钢琴音色" aria-checked={props.tone === 'piano' && !props.toneLoading && !props.toneError} aria-busy={props.toneLoading || undefined} title={props.toneLoading ? '钢琴音色加载中' : '钢琴音色（关闭使用合成音色）'} className={props.toneLoading ? 'control-button is-loading' : 'control-button'} onClick={() => props.onToneChange(props.tone === 'piano' ? 'synth' : 'piano')}>
          {props.toneLoading ? <svg className="tone-loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".2" /><path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" /></svg> : <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7.5 13v7m4.5-7v7m4.5-7v7M7 4v8h3V4m4 0v8h3V4" /></Icon>}
          <span>{props.toneLoading ? '加载中' : '钢琴'}</span>
        </button>
      <button type="button" role="switch" aria-label="分页" aria-checked={props.paged} title="分页显示" className="control-button" onClick={() => props.onPagedChange(!props.paged)}>
          <Icon><rect x="3" y="3" width="14" height="17" rx="2" /><path d="M7 7h6M7 11h6M7 15h4M17 7h4v14H7" /></Icon><span>分页</span>
        </button>
      <button type="button" role="switch" aria-label="固定调记谱" aria-checked={props.fixedDo} title="固定C调记谱，变化音统一用♯表示" className="control-button" onClick={() => props.onFixedDoChange(!props.fixedDo)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><text x="12" y="20" textAnchor="middle" fontSize="26" fill="currentColor">♯</text></svg><span>固定调</span>
        </button>
      <button type="button" role="switch" aria-label="小节号" aria-checked={props.measureNumbers} title="显示小节号" className="control-button" onClick={() => props.onMeasureNumbersChange(!props.measureNumbers)}>
          <Icon><path d="M4 4v16M20 4v16M4 8h16M4 16h16M10 10h2v4m-2 0h4" /></Icon><span>小节号</span>
        </button>
      <button type="button" className="control-button transpose-key-button" aria-label={`移调，当前${selectedKeyLabel}调`} aria-haspopup="dialog" title="选择调性" disabled={props.isLoading} onClick={() => {
        keyDialogRef.current?.showModal()
        keyDialogRef.current?.querySelector<SVGElement>('[aria-pressed="true"]')?.focus()
      }}><span className="transpose-key-icon" aria-hidden="true">{selectedKeyLabel}</span><span>调号</span></button>
        </div>
    {(props.toneLoading || props.toneError) && <div className="control-tone-status" role="status">{props.toneError || '正在下载钢琴音色…'}{props.toneError && <button type="button" className="control-button" onClick={props.onToneRetry}>重试加载音色</button>}</div>}
    <dialog ref={keyDialogRef} className="transpose-dialog" aria-labelledby={keyTitleId} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
      }
    }}>
      <div className="transpose-dialog-header"><h2 id={keyTitleId}>选择调性</h2><button type="button" className="control-button" aria-label="关闭调性选择" onClick={() => keyDialogRef.current?.close()}>×</button></div>
      <CircleOfFifths originalKey={props.originalKey} selectedKey={selectedKey} disabled={props.isLoading} onSelect={target => {
        props.onTransposeChange(nearestKeyTranspose(props.originalKey, target))
        keyDialogRef.current?.close()
      }} />
    </dialog>
      </div>
    </>}
  </div>
  return props.playbackOnly ? controls : createPortal(controls, document.body)
}
