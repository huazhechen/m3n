import { useRef, useState } from 'react'
import { PLAYBACK_BPM_MAX, PLAYBACK_BPM_MIN } from '../lib/renderer-settings'
import { ScoreControlIcon } from './ScoreControlIcon'

type Props = { bpm: number; onChange: (bpm: number) => void; onReset: () => void }

function adjacentEvenBpm(bpm: number, direction: -1 | 1) {
  const next = bpm + (direction < 0 ? (bpm % 2 === 0 ? -2 : -1) : (bpm % 2 === 0 ? 2 : 1))
  return Math.max(PLAYBACK_BPM_MIN, Math.min(PLAYBACK_BPM_MAX, next))
}

export function PlaybackSpeedControl({ bpm, onChange, onReset }: Props) {
  const [draft, setDraft] = useState<number | null>(null)
  const dragging = useRef(false)
  const pending = useRef<number | null>(null)

  const finish = () => {
    dragging.current = false
    const next = pending.current
    pending.current = null
    if (next !== null) onChange(next)
    setDraft(null)
  }

  return <div className="control-slider-row">
    <span className="control-row-label">速度<output>{draft ?? bpm} BPM</output></span>
    <div className="control-range-adjuster">
      <button type="button" className="control-button" aria-label="降低播放速度" title="减至上一个偶数 BPM 档位" disabled={bpm <= PLAYBACK_BPM_MIN}
        onClick={() => onChange(adjacentEvenBpm(bpm, -1))}>−</button>
      <input type="range" min={PLAYBACK_BPM_MIN} max={PLAYBACK_BPM_MAX} step="1" value={draft ?? bpm} aria-label="播放速度" aria-valuetext={`${draft ?? bpm} BPM`}
        onPointerDown={event => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onChange={event => {
          const next = Number(event.currentTarget.value)
          if (!dragging.current) { onChange(next); return }
          setDraft(next)
          pending.current = next
          // Score layout is synchronous; commit only after the drag finishes.
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish} />
      <button type="button" className="control-button" aria-label="提高播放速度" title="增至下一个偶数 BPM 档位" disabled={bpm >= PLAYBACK_BPM_MAX}
        onClick={() => onChange(adjacentEvenBpm(bpm, 1))}>+</button>
    </div>
    <button type="button" className="control-button" aria-label="还原速度" title="还原乐谱原速" onClick={() => { finish(); onReset() }}><ScoreControlIcon name="reset" /></button>
  </div>
}
