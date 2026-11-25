import { useEffect, useRef, useState } from 'react'
import { SCORE_WIDTH_MIN, SCORE_WIDTH_MAX, SCORE_WIDTH_MULTIPLE_MIN, SCORE_WIDTH_MULTIPLE_MAX, scoreWidthMultiple, scoreWidthAtMultiple, stepScoreWidth } from '../lib/renderer-settings'
import { ScoreControlIcon } from './ScoreControlIcon'

type Props = { width: number; onChange: (width: number) => void; onReset: () => void }

/** Keep drag feedback local so pointer events do not re-render the score. */
export function ScoreWidthControl({ width, onChange, onReset }: Props) {
  const [draft, setDraft] = useState<number | null>(null)
  const dragging = useRef(false)
  const pending = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const change = useRef(onChange)
  useEffect(() => { change.current = onChange }, [onChange])
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  const flush = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next !== null) change.current(next)
  }
  const finish = () => {
    dragging.current = false
    flush()
    setDraft(null)
  }

  return <div className="control-slider-row">
    <span className="control-row-label">宽度<output>{draft ?? width}px</output></span>
    <div className="control-range-adjuster">
      <button type="button" className="control-button" aria-label="减小乐谱宽度" title="减至上一档" disabled={width <= SCORE_WIDTH_MIN}
        onClick={() => onChange(stepScoreWidth(width, -1))}>−</button>
      <input type="range" min={SCORE_WIDTH_MULTIPLE_MIN} max={SCORE_WIDTH_MULTIPLE_MAX} step={0.25} value={scoreWidthMultiple(draft ?? width)} aria-label="乐谱宽度" aria-valuetext={`${draft ?? width}px`}
        onPointerDown={event => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onChange={event => {
          const next = scoreWidthAtMultiple(Number(event.currentTarget.value))
          if (!dragging.current) { onChange(next); return }
          setDraft(next)
          pending.current = next
          // Trailing throttle: keep the latest width, without postponing every
          // preview until dragging stops. Pointer release always flushes it.
          timer.current ??= setTimeout(flush, 150)
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish} />
      <button type="button" className="control-button" aria-label="增大乐谱宽度" title="增至下一档" disabled={width >= SCORE_WIDTH_MAX}
        onClick={() => onChange(stepScoreWidth(width, 1))}>+</button>
    </div>
    <button type="button" className="control-button" aria-label="还原宽度" title="还原乐谱推荐宽度" onClick={() => { finish(); onReset() }}><ScoreControlIcon name="reset" /></button>
  </div>
}
