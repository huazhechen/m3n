import { useState } from 'react'
import { TopNav } from '../components/TopNav'
import { actionLabel, continuityColor, degreeLabel, HARMONICA_KEYS, harmonicaLayout, harmonicaScale, isScaleTone, movableDegree, pitchLabel, scalePitchLabel, type HarmonicaAction } from '../lib/harmonica-scales'
import { CIRCLE_OF_FIFTHS, keyPitchClass } from '../lib/transpose-key'
import '../styles/tools.css'

const TILE = 44
const LEFT = 82
const STEP = 54
const SCALES = HARMONICA_KEYS.map((_, key) => harmonicaScale(key))
const FIFTHS_KEYS = [...CIRCLE_OF_FIFTHS.slice(6), ...CIRCLE_OF_FIFTHS.slice(0, 6)].map(([key]) => keyPitchClass(key))
const MIN_SCORE = Math.min(...SCALES.map(scale => scale.total))
const MAX_SCORE = Math.max(...SCALES.map(scale => scale.total))
function position(action: HarmonicaAction) {
  return { x: LEFT + (action.hole - 1) * STEP, y: action.breath === 'blow' ? (action.pressed ? 16 : 74) : (action.pressed ? 258 : 200) }
}
function actionId(action: HarmonicaAction) { return `${action.hole}-${action.breath}-${action.pressed}` }

function HarmonicaDiagram({ musicalKey }: { musicalKey: number }) {
  const scale = SCALES[musicalKey]!
  const layout = harmonicaLayout()
  const edges = [
    ...scale.transitions.map(edge => ({ ...edge, direction: scale.descending.some(back => actionId(back.from) === actionId(edge.to) && actionId(back.to) === actionId(edge.from)) ? 'both' : 'up' })),
    ...scale.descending.filter(edge => !scale.transitions.some(up => actionId(up.from) === actionId(edge.to) && actionId(up.to) === actionId(edge.from))).map(edge => ({ ...edge, direction: 'down' })),
  ]
  // Same-hole connections can cover the same vertical span when a pitch
  // switches between the inner and outer rows. Give overlapping pairs lanes.
  const verticalSpans = edges.map((edge, index) => {
    const from = position(edge.from), to = position(edge.to)
    return { index, x: from.x, low: Math.min(from.y, to.y) + TILE + 2, high: Math.max(from.y, to.y) - 2,
      vertical: from.x === to.x, pitch: Math.min(edge.from.midi, edge.to.midi) }
  })
  const laneOffsets = verticalSpans.map(span => {
    if (!span.vertical) return 0
    const peers = verticalSpans.filter(other => other.vertical && other.x === span.x
      && (other.index === span.index || Math.min(span.high, other.high) > Math.max(span.low, other.low)))
      .sort((a, b) => a.pitch - b.pitch || a.index - b.index)
    return peers.length < 2 ? 0 : (peers.findIndex(other => other.index === span.index) / (peers.length - 1) - .5) * 28
  })
  const tile = (action: HarmonicaAction) => {
    const { x, y } = position(action)
    const inScale = isScaleTone(action.midi, musicalKey)
    const { degree, octave } = movableDegree(action.midi, musicalKey)
    const label = inScale ? scalePitchLabel(action.midi, musicalKey) : pitchLabel(action.midi)
    return <g key={actionId(action)} data-in-scale={inScale} className={`harmonica-tile${inScale ? ' in-scale' : ''}`}>
      <title>{degreeLabel(action.midi, musicalKey)}，{label}，{actionLabel(action)}，{inScale ? '调内音' : '非调内音'}</title>
      <rect x={x} y={y} width={TILE} height={TILE} rx="4" />
      <text x={x + TILE / 2} y={y + TILE / 2 + 1}>{degree.length > 1 && <tspan className="degree-accidental" x={x + TILE / 2 - 13}>{degree.slice(0, -1)}</tspan>}<tspan x={x + TILE / 2}>{degree.at(-1)}</tspan></text>
      {Array.from({ length: Math.abs(octave) }, (_, index) => <circle className="degree-octave-dot" key={index} cx={x + TILE / 2} cy={y + TILE / 2 + (octave > 0 ? -14 - index * 3 : 14 + index * 3)} r="1.25" />)}
    </g>
  }
  return <>
    <div className="scale-diagram-intro"><h3>1 = {HARMONICA_KEYS[musicalKey]}</h3></div>
    <div className="harmonica-diagram-frame" role="region" aria-label="12 孔口琴音阶图">
      <svg className="harmonica-diagram" viewBox="0 0 790 318" role="img" aria-labelledby="harmonica-diagram-title harmonica-diagram-description">
        <title id="harmonica-diagram-title">{HARMONICA_KEYS[musicalKey]} 大调，12 孔 C 调半音阶口琴首调简谱图</title>
        <desc id="harmonica-diagram-description">上方内行吹，外行按键吹；下方内行吸，外行按键吸。</desc>
        <g className="harmonica-muted-tiles">{layout.filter(action => !isScaleTone(action.midi, musicalKey)).map(tile)}</g>
        <g className="harmonica-body" aria-hidden="true">
          <rect x="64" y="136" width="674" height="46" rx="13" />
          <path d="M78 144h646M78 174h646M738 153h25v12h-25M763 147v24" />
          <circle cx="74" cy="159" r="2" /><circle cx="728" cy="159" r="2" />
          {Array.from({ length: 12 }, (_, index) => <g key={index}><rect x={LEFT + index * STEP + 4} y="150" width="36" height="18" rx="3" /><text x={LEFT + index * STEP + 22} y="163">{index + 1}</text></g>)}
        </g>
        <g className="harmonica-row-labels" aria-hidden="true">{[
          ['按键吹', 38], ['吹', 96], ['吸', 222], ['按键吸', 280],
        ].map(([label, y]) => <text key={label} x="68" y={Number(y)}>{label}</text>)}</g>
        <g className="harmonica-scale-tiles">{layout.filter(action => isScaleTone(action.midi, musicalKey)).map(tile)}</g>
        <g className="scale-connections">{edges.map((edge, index) => {
          const from = position(edge.from), to = position(edge.to)
          const x1 = from.x + TILE / 2, y1 = from.y + TILE / 2
          const x2 = to.x + TILE / 2, y2 = to.y + TILE / 2
          const cx = (x1 + x2) / 2
          const cy = y1 === y2 ? y1 + (y1 < 136 ? -40 : 40) : (y1 + y2) / 2
          const trim = (x: number, y: number) => {
            const ratio = (TILE / 2 + 2) / Math.max(Math.abs(cx - x), Math.abs(cy - y))
            return [x + (cx - x) * ratio, y + (cy - y) * ratio]
          }
          const [sx, sy] = trim(x1, y1), [ex, ey] = trim(x2, y2)
          return <path key={index} data-score={edge.score} data-direction={edge.direction} d={`M${sx + laneOffsets[index]!} ${sy} Q${cx + laneOffsets[index]!} ${cy} ${ex + laneOffsets[index]!} ${ey}`} stroke={continuityColor(edge.score)}>
            <title>{edge.direction === 'both' ? '双向' : edge.direction === 'up' ? '上行' : '下行'} {degreeLabel(edge.from.midi, musicalKey)} → {degreeLabel(edge.to.midi, musicalKey)}；{actionLabel(edge.from)} → {actionLabel(edge.to)}</title>
          </path>
        })}</g>
      </svg>
    </div>
  </>
}

export function HarmonicaScalesPage() {
  const [key, setKey] = useState(0)
  return <main className="tools-page">
    <TopNav />
    <section id="scales" className="scale-tool" aria-labelledby="scale-tool-title">
      <header className="scale-tool-heading"><h2 id="scale-tool-title">半音阶口琴 · 大调音阶</h2><p>12 孔 C 调</p></header>
      <div className="scale-key-picker" role="group" aria-label="选择大调">{FIFTHS_KEYS.map(index => <button key={index} type="button" style={{ backgroundColor: `hsl(${120 - 120 * (SCALES[index]!.total - MIN_SCORE) / (MAX_SCORE - MIN_SCORE || 1)} 75% 72%)` }} aria-label={`${HARMONICA_KEYS[index]}大调，总分${SCALES[index]!.total}分`} aria-pressed={key === index} onClick={() => setKey(index)}>{HARMONICA_KEYS[index]}<span>{SCALES[index]!.total} 分</span></button>)}</div>
      <HarmonicaDiagram musicalKey={key} />
    </section>
  </main>
}
