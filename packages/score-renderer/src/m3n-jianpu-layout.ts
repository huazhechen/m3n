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
  const beatGaps = Math.max(0, Math.ceil(spans.reduce((total, value) => total + value, 0)) - 1)
  const cell = measure.events.reduce((required, event) => {
    if (event.beats <= EPSILON) return required
    const minimumSymbolWidth = event.kind === 'chord' ? fontSize * 1.05 : fontSize * 0.82
    return Math.max(required, minimumSymbolWidth / visualSpan(event, beat))
  }, fontSize * 1.5)
  const bar = fontSize * 0.55
  const beatGap = fontSize * 0.28
  return { slots: Math.max(1, slots), width: Math.max(fontSize * 2.2, slots * cell + beatGaps * beatGap + bar), beatGaps, bar, beatGap }
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
  const measureGap = fontSize * 0.35
  type RowItem = { measure: ScoreMeasure; measureIndex: number; info: ReturnType<typeof metric>; width: number }
  const rows: RowItem[][] = []
  let row: RowItem[] = []
  let rowWidth = 0
  const flushRow = () => {
    if (row.length > 0) rows.push(row)
    row = []
    rowWidth = 0
  }

  // First choose systems from their natural widths. The width of a completed
  // system is justified below, independently of every other system.
  for (const [measureIndex, measure] of measures.entries()) {
    if (measure.breakBefore) flushRow()
    const info = metric(measure, beat, fontSize)
    const measureWidth = info.width
    const nextWidth = rowWidth + (row.length === 0 ? 0 : measureGap) + measureWidth
    if (row.length > 0 && nextWidth > available) flushRow()
    row.push({ measure, measureIndex, info, width: measureWidth })
    rowWidth += (row.length === 1 ? 0 : measureGap) + measureWidth
    if (measure.breakAfter) flushRow()
  }
  flushRow()

  const result: LayoutMeasure[] = []
  let y = musicTop
  const targetWidth = Math.max(
    available,
    ...rows.map((items) => items.reduce((total, item) => total + item.width, 0) + Math.max(0, items.length - 1) * measureGap),
  )
  for (const rowItems of rows) {
    const naturalWidth = rowItems.reduce((total, item) => total + item.width, 0) + Math.max(0, rowItems.length - 1) * measureGap
    const scale = naturalWidth > 0 ? targetWidth / naturalWidth : 1
    const scaledGap = measureGap * scale
    let x = padding
    for (const item of rowItems) {
      const measureWidth = item.width * scale
      const scaledBeatGap = item.info.beatGap * scale
      const scaledBar = item.info.bar * scale
      const cellWidth = Math.max(
        fontSize * 0.62,
        (measureWidth - scaledBar - item.info.beatGaps * scaledBeatGap) / item.info.slots,
      )
      result.push({
        measure: item.measure,
        measureIndex: item.measureIndex,
        x,
        y,
        width: measureWidth,
        cellWidth,
        beatGap: scaledBeatGap,
      })
      x += measureWidth + scaledGap
    }
    y += rowHeight
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
