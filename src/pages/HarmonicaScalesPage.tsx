import { useState } from 'react'
import { TopNav } from '../components/TopNav'
import { actionLabel, continuityColor, degreeLabel, HARMONICA_KEYS, harmonicaLayout, harmonicaScale, isScaleTone, movableDegree, pitchLabel, scalePitchLabel, type HarmonicaAction } from '../lib/harmonica-scales'
import { CIRCLE_OF_FIFTHS, keyPitchClass } from '../lib/transpose-key'
import '../styles/tools.css'

const TILE = 44
const LEFT = 26
const STEP = 48
const TUNINGS = ['standard', 'c6', 'diminished', 'full-blow-draw'] as const
const SCALE_SETS = TUNINGS.map(tuning => HARMONICA_KEYS.map((_, key) => harmonicaScale(key, tuning)))
const FIFTHS_KEYS = [...CIRCLE_OF_FIFTHS.slice(6), ...CIRCLE_OF_FIFTHS.slice(0, 6)].map(([key]) => keyPitchClass(key))
function position(action: HarmonicaAction) {
  return { x: LEFT + (action.hole - 1) * STEP, y: action.breath === 'blow' ? (action.pressed ? 16 : 74) : (action.pressed ? 258 : 200) }
}
function actionId(action: HarmonicaAction) { return `${action.hole}-${action.breath}-${action.pressed}` }

function difficultyColor(score: number) {
  const progress = (Math.max(20, Math.min(150, score)) - 20) / 130
  // Equal lightness and chroma, with yellow at the midpoint of the score range.
  const hue = progress <= .5 ? 145 - 100 * progress : 165 - 140 * progress
  return `oklch(82% 0.18 ${hue})`
}

function HarmonicaDiagram({ musicalKey, tuning }: { musicalKey: number; tuning: typeof TUNINGS[number] }) {
  const scale = SCALE_SETS[TUNINGS.indexOf(tuning)]![musicalKey]!
  const layout = harmonicaLayout(tuning)
  const edges = [
    ...scale.diagramTransitions.map(edge => ({ ...edge, direction: scale.diagramDescending.some(back => actionId(back.from) === actionId(edge.to) && actionId(back.to) === actionId(edge.from)) ? 'both' : 'up' })),
    ...scale.diagramDescending.filter(edge => !scale.diagramTransitions.some(up => actionId(up.from) === actionId(edge.to) && actionId(up.to) === actionId(edge.from))).map(edge => ({ ...edge, direction: 'down' })),
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
      {degree.length > 1 && <text className="degree-accidental" x={x + TILE / 2 - 13} y={y + TILE / 2 + 5}>{degree.slice(0, -1)}</text>}
      <text className="degree-number" x={x + TILE / 2} y={y + TILE / 2 + 8}>{degree.at(-1)}</text>
      {Array.from({ length: Math.abs(octave) }, (_, index) => <circle className="degree-octave-dot" key={index} cx={x + TILE / 2} cy={y + TILE / 2 + (octave > 0 ? -14 - index * 3 : 14 + index * 3)} r="1.25" />)}
    </g>
  }
  return <>
    <div className="scale-diagram-intro"><h3>1 = {HARMONICA_KEYS[musicalKey]}</h3></div>
    <div className="harmonica-diagram-frame" role="region" aria-label="12 孔口琴音阶图">
      <svg className="harmonica-diagram" viewBox="0 4 618 312" role="img" aria-labelledby="harmonica-diagram-title harmonica-diagram-description">
        <title id="harmonica-diagram-title">{HARMONICA_KEYS[musicalKey]} 大调，12 孔 {tuning === 'c6' ? 'C6' : tuning === 'diminished' ? '减音阶' : 'C'} 调半音阶口琴首调简谱图</title>
        <desc id="harmonica-diagram-description">上方内行吹，外行按键吹；下方内行吸，外行按键吸。</desc>
        <g className="harmonica-muted-tiles">{layout.filter(action => !isScaleTone(action.midi, musicalKey)).map(tile)}</g>
        <g className="harmonica-body" aria-hidden="true">
          <rect x="20" y="136" width="584" height="46" rx="13" />
          <path d="M30 144h564M30 174h564M604 153h10v12h-10M614 149v20" />
          <circle cx="25" cy="159" r="2" /><circle cx="599" cy="159" r="2" />
          {Array.from({ length: 12 }, (_, index) => <g key={index}><rect x={LEFT + index * STEP + 4} y="150" width="36" height="18" rx="3" /><text x={LEFT + index * STEP + 22} y="163">{index + 1}</text></g>)}
        </g>
        <g className="harmonica-row-labels" aria-hidden="true">{[
          ['按', 38], ['吹', 96], ['吸', 222], ['按', 280],
        ].map(([label, y]) => <text key={`${label}-${y}`} x="18" y={Number(y)}>{label}</text>)}</g>
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
  const [tuning, setTuning] = useState<typeof TUNINGS[number]>('standard')
  const scales = SCALE_SETS[TUNINGS.indexOf(tuning)]!
  return <main className="tools-page scales-page">
    <TopNav />
    <section id="scales" className="scale-tool" aria-labelledby="scale-tool-title">
      <header className="scale-tool-heading"><h2 id="scale-tool-title">半音阶口琴·音阶</h2>
      <div className="scale-tuning-picker" role="group" aria-label="选择调音方式">{TUNINGS.map((value, index) => <button key={value} type="button" aria-pressed={tuning === value} onClick={() => setTuning(value)}>{['标准', 'C6', '减音阶', '全吹吸'][index]}</button>)}</div></header>
      <div className="scale-key-picker" role="group" aria-label="选择大调">{FIFTHS_KEYS.map(index => <button key={index} type="button" style={{ backgroundColor: difficultyColor(scales[index]!.total) }} aria-label={`${HARMONICA_KEYS[index]}大调，总分${scales[index]!.total}分`} aria-pressed={key === index} onClick={() => setKey(index)}>{HARMONICA_KEYS[index]}<span>{scales[index]!.total} 分</span></button>)}</div>
      <HarmonicaDiagram musicalKey={key} tuning={tuning} />
    </section>
  </main>
}
