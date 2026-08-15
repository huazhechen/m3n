import type { ScoreEvent, ScoreMeasure } from '@m3n/notation'

/**
 * Direct ScoreDocument layout port of JianpuABC's slot based natural-width
 * algorithm. No JABC AST is constructed at this boundary.
 */
export type LayoutMeasure = {
  measure: ScoreMeasure
  measureIndex: number
  x: number
  y: number
  width: number
  cellWidth: number
  beatGap: number
}

export type PositionedEvent = {
  event: ScoreEvent
  eventIndex: number
  centerX: number
  slotCount: number
  layoutSpan: number
  layoutOffset: number
  startBeat: number
}

const EPSILON = 1e-6

function visualSpan(event: ScoreEvent, beat: number) {
  if (event.beats <= EPSILON) return 0
  return Math.max(0.25, event.beats / beat)
}

function visualSlots(event: ScoreEvent, beat: number) {
  const span = visualSpan(event, beat)
  return Number.isInteger(span) && span > 1 ? span : 1
}

function metric(measure: ScoreMeasure, beat: number, fontSize: number) {
  const spans = measure.events.map((event) => visualSpan(event, beat))
  const slots = measure.events.reduce((total, event) => total + visualSlots(event, beat), 0)
  const beats = Math.max(0, Math.ceil(spans.reduce((total, value) => total + value, 0)) - 1)
  const cell = fontSize * 1.5
  const bar = fontSize * 0.55
  const beatGap = fontSize * 0.28
  return { slots: Math.max(1, slots), width: Math.max(fontSize * 2.2, slots * cell + beats * beatGap + bar), beatGap }
}

/** Natural-width system wrapping used by JianpuABC when column alignment is disabled. */
export function layoutMeasures(
  measures: readonly ScoreMeasure[],
  width: number,
  padding: number,
  musicTop: number,
  rowHeight: number,
  fontSize: number,
  beat: number,
): LayoutMeasure[] {
  const available = Math.max(1, width - padding * 2)
  const result: LayoutMeasure[] = []
  let x = padding
  let y = musicTop
  for (const [measureIndex, measure] of measures.entries()) {
    const info = metric(measure, beat, fontSize)
    if (x > padding && (x + info.width > width - padding || measure.breakBefore)) { x = padding; y += rowHeight }
    result.push({ measure, measureIndex, x, y, width: info.width, cellWidth: Math.max(fontSize * 0.62, info.width / info.slots), beatGap: info.beatGap })
    x += info.width
    if (measure.breakAfter || x - padding > available) { x = padding; y += rowHeight }
  }
  return result
}

export function layoutXAt(offset: number, cellWidth: number, beatGap: number) {
  const beat = Math.floor(offset)
  return offset * cellWidth + beat * beatGap
}

export function positionEvents(placed: LayoutMeasure, beat: number): PositionedEvent[] {
  let offset = 0
  let startBeat = 0
  return placed.measure.events.map((event, eventIndex) => {
    const span = visualSpan(event, beat)
    const slots = visualSlots(event, beat)
    const centerX = layoutXAt(offset + Math.max(span, 1) / 2, placed.cellWidth, placed.beatGap)
    const output = { event, eventIndex, centerX, slotCount: slots, layoutSpan: span, layoutOffset: offset, startBeat }
    offset += span
    startBeat += event.beats
    return output
  })
}

export function durationLineCount(event: ScoreEvent, beat: number) {
  if (event.kind !== 'note' && event.kind !== 'rest') return 0
  const ratio = beat / event.beats
  return ratio >= 2 && Number.isInteger(Math.log2(ratio)) ? Math.log2(ratio) : 0
}
