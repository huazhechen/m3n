import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PLAYBACK_TONES, type PlaybackTone } from '@m3n/score-renderer/tones'
import { NOTATION_MODES, type NotationMode } from '../lib/renderer-settings'

import { CIRCLE_OF_FIFTHS, TRANSPOSE_KEYS, currentKeyIndex, isMinorKey, keyPitchClass, nearestKeyTranspose } from '../lib/transpose-key'
import { CircleOfFifths } from './CircleOfFifths'
import { ScoreControlIcon } from './ScoreControlIcon'
import { ScoreWidthControl } from './ScoreWidthControl'
import { PlaybackSpeedControl } from './PlaybackSpeedControl'
import { PlaybackProgressControl } from './PlaybackProgressControl'

type ScoreControlsProps = {
  playbackOnly?: boolean
  contained?: boolean
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
  notationMode: NotationMode
  onNotationModeChange: (mode: NotationMode) => void
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

export function ScoreControls(props: ScoreControlsProps) {
  const notationDialogRef = useRef<HTMLDialogElement>(null)
  const notationTitleId = useId()
  const notationLabel = NOTATION_MODES.find(mode => mode.value === props.notationMode)!.label
  const toneDialogRef = useRef<HTMLDialogElement>(null)
  const toneTitleId = useId()
  const selectedTone = PLAYBACK_TONES.find(item => item.value === props.tone)!
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
  const playLoading = props.isLoading && !props.isPlaying
  const controls = <div className={props.playbackOnly ? 'audio-controls playback-only' : `audio-controls floating-controls${props.contained ? ' contained-controls' : ''}`} role="group" aria-label="乐谱控制">
    <div className="control-transport">
        <button type="button" className="control-button playback-toggle" aria-label={playLabel} title={playLoading ? '加载中' : playLabel} aria-busy={playLoading || undefined} aria-disabled={playLoading || undefined} onClick={() => { if (!playLoading) props.onTogglePlayback() }}>
          <ScoreControlIcon name={props.isPlaying ? 'pause' : 'play'} /><span>{playLoading ? '加载中' : playLabel}</span>
        </button>
        <PlaybackProgressControl progress={props.progress} isPlaying={props.isPlaying}
          onSeekStart={props.onSeekStart} onSeek={props.onSeek} onSeekCommit={props.onSeekCommit} />
      <button type="button" role="switch" aria-label="节拍器" aria-checked={props.metronomeEnabled} title="节拍器" className="control-button metronome-toggle" disabled={props.isLoading} onClick={() => props.onMetronomeChange(!props.metronomeEnabled)}>
          <ScoreControlIcon name="metronome" /><span>节拍器</span>
        </button>
    </div>
    {!props.playbackOnly && <>
      <button type="button" className="control-button settings-toggle" aria-label="乐谱设置" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsId} popoverTarget={settingsId} title="乐谱设置">
        <ScoreControlIcon name="settings" />
      </button>
      <div ref={settingsRef} id={settingsId} popover="auto" role="dialog" aria-label="乐谱设置" className="control-settings-popover" onToggle={event => setSettingsOpen(event.newState === 'open')}>
        <div className="control-settings-header"><strong>乐谱设置</strong><button type="button" className="control-button" aria-label="关闭乐谱设置" onClick={() => settingsRef.current?.hidePopover()}>×</button></div>
        <div className="control-sliders">
      <PlaybackSpeedControl bpm={props.bpm} onChange={props.onBpmChange} onReset={props.onResetBpm} />
      <ScoreWidthControl width={props.width} onChange={props.onWidthChange} onReset={props.onResetWidth} />

        </div>
        <div className="control-options">
      <button type="button" aria-label={`选择音色，当前${selectedTone.label}`} aria-haspopup="dialog" aria-busy={props.toneLoading || undefined} title="选择音色" className="control-button tone-selector" onClick={() => {
        toneDialogRef.current?.showModal()
        toneDialogRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
      }}>
        <ScoreControlIcon name={props.tone} /><span>{selectedTone.label}</span>
      </button>
      <button type="button" role="switch" aria-label="分页" aria-checked={props.paged} title="分页显示" className="control-button" onClick={() => props.onPagedChange(!props.paged)}>
          <ScoreControlIcon name="paged" /><span>分页</span>
        </button>
      <button type="button" aria-label={`选择记谱方式，当前${notationLabel}`} aria-haspopup="dialog" className="control-button notation-selector" onClick={() => {
        notationDialogRef.current?.showModal()
        notationDialogRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
      }}><ScoreControlIcon name={props.notationMode === 'staff' ? 'staff' : props.notationMode === 'fixed' ? 'fixedDo' : 'movableDo'} /><span>{notationLabel}</span></button>
      <button type="button" role="switch" aria-label="小节号" aria-checked={props.measureNumbers} title="显示小节号" className="control-button" onClick={() => props.onMeasureNumbersChange(!props.measureNumbers)}>
          <ScoreControlIcon name="measureNumbers" /><span>小节号</span>
        </button>
      <button type="button" className="control-button transpose-key-button" aria-label={`移调，当前${selectedKeyLabel}调`} aria-haspopup="dialog" title="选择调性" disabled={props.isLoading} onClick={() => {
        keyDialogRef.current?.showModal()
        keyDialogRef.current?.querySelector<SVGElement>('[aria-pressed="true"]')?.focus()
      }}><span className="transpose-key-icon" aria-hidden="true">{selectedKeyLabel}</span><span>调号</span></button>
        </div>
    {(props.toneLoading || props.toneError) && <div className="control-tone-status" role="status">{props.toneError || `正在加载${selectedTone.label}音色…`}{props.toneError && <button type="button" className="control-button" onClick={props.onToneRetry}>重试加载音色</button>}</div>}
    <dialog ref={notationDialogRef} className="transpose-dialog" aria-labelledby={notationTitleId}>
      <div className="transpose-dialog-header"><h2 id={notationTitleId}>选择记谱方式</h2><button type="button" className="control-button" aria-label="关闭记谱方式选择" onClick={() => notationDialogRef.current?.close()}>×</button></div>
      <div className="tone-options">
        {NOTATION_MODES.map(mode => <button key={mode.value} type="button" className="control-button" aria-pressed={mode.value === props.notationMode} onClick={() => {
          props.onNotationModeChange(mode.value)
          notationDialogRef.current?.close()
        }}>{mode.label}</button>)}
      </div>
    </dialog>
    <dialog ref={toneDialogRef} className="transpose-dialog tone-dialog" aria-labelledby={toneTitleId} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
      }
    }}>
      <div className="transpose-dialog-header"><h2 id={toneTitleId}>选择音色</h2><button type="button" className="control-button" aria-label="关闭音色选择" onClick={() => toneDialogRef.current?.close()}>×</button></div>
      <div className="tone-options">
        {PLAYBACK_TONES.map(tone => <button key={tone.value} type="button" className="control-button" aria-pressed={tone.value === props.tone} onClick={() => {
          toneDialogRef.current?.close()
          if (tone.value !== props.tone) props.onToneChange(tone.value)
        }}><ScoreControlIcon name={tone.value} /><span>{tone.label}</span></button>)}
      </div>
    </dialog>
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
  return props.playbackOnly || props.contained ? controls : createPortal(controls, document.body)
}
