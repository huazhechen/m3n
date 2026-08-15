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
  gridUnit: number
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

/**
 * Constraints supplied by a renderer before line breaking.  Keeping these in
 * the layout pass means lyrics and dense symbols reserve space before SVG is
 * painted instead of being allowed to collide after the fact.
 */
export type JianpuLayoutOptions = {
  eventMinimumWidth?: (event: ScoreEvent) => number
  justifyLastSystem?: boolean
}

const EPSILON = 1e-6

function visualSpan(event: ScoreEvent, beat: number) {
  if (event.beats <= EPSILON) return 0
  return Math.max(0.25, event.beats / beat)
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b > 0) [a, b] = [b, a % b]
  return a
}

function gridUnit(spans: readonly number[]) {
  // M3N durations are binary subdivisions.  A common quarter-beat grid keeps
  // dotted values and short notes proportional without expanding each short
  // note to a full beat cell.
  const ticks = spans.map((span) => Math.max(1, Math.round(span * 4)))
  const divisor = ticks.reduce(greatestCommonDivisor, 4)
  return Math.max(0.25, divisor / 4)
}

function metric(measure: ScoreMeasure, beat: number, fontSize: number, options: JianpuLayoutOptions) {
  const spans = measure.events.map((event) => visualSpan(event, beat))
  const unit = gridUnit(spans)
  const slots = spans.reduce((total, span) => total + Math.max(1, Math.round(span / unit)), 0)
  const beatGaps = Math.max(0, Math.ceil(spans.reduce((total, value) => total + value, 0)) - 1)
  const cell = measure.events.reduce((required, event, index) => {
    if (event.beats <= EPSILON) return required
    const defaultSymbolWidth = event.kind === 'tuplet'
      ? Math.max(fontSize * 1.2, event.pitches.length * fontSize * 0.56)
      : event.kind === 'chord' ? fontSize * 1.16 : fontSize * 0.96
    const minimumSymbolWidth = Math.max(defaultSymbolWidth, options.eventMinimumWidth?.(event) ?? 0)
    const eventSlots = Math.max(1, Math.round((spans[index] ?? unit) / unit))
    return Math.max(required, minimumSymbolWidth / eventSlots)
  }, fontSize)
  const bar = fontSize * 0.55
  const beatGap = fontSize * 0.28
  return { unit, slots: Math.max(1, slots), width: Math.max(fontSize * 2.2, slots * cell + beatGaps * beatGap + bar), beatGaps, bar, beatGap }
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
  options: JianpuLayoutOptions = {},
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
    const info = metric(measure, beat, fontSize, options)
    const measureWidth = info.width
    const nextWidth = rowWidth + (row.length === 0 ? 0 : measureGap) + measureWidth
    // A system never starts with an empty over-wide measure.  The following
    // justification pass can still fit it, while keeping the measure intact.
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
    const isLast = rowItems === rows.at(-1)
    const justify = options.justifyLastSystem ?? true
    const scale = naturalWidth > 0 && (justify || !isLast) ? targetWidth / naturalWidth : 1
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
        gridUnit: item.info.unit,
      })
      x += measureWidth + scaledGap
    }
    y += rowHeight
  }
  return result
}

export function layoutXAt(offset: number, gridUnit: number, cellWidth: number, beatGap: number) {
  const beat = Math.floor(offset * gridUnit + EPSILON)
  return offset * cellWidth + beat * beatGap
}

export function positionEvents(placed: LayoutMeasure, beat: number): PositionedEvent[] {
  let offset = 0
  let startBeat = 0
  return placed.measure.events.map((event, eventIndex) => {
    const span = visualSpan(event, beat)
    const slots = Math.max(1, Math.round(span / placed.gridUnit))
    const centerX = layoutXAt(offset + slots / 2, placed.gridUnit, placed.cellWidth, placed.beatGap)
    const output = { event, eventIndex, centerX, slotCount: slots, layoutSpan: slots, layoutOffset: offset, startBeat }
    offset += slots
    startBeat += event.beats
    return output
  })
}

export function durationLineCount(event: ScoreEvent, beat: number) {
  if (event.kind !== 'note' && event.kind !== 'rest') return 0
  const ratio = beat / event.beats
  return ratio >= 2 && Number.isInteger(Math.log2(ratio)) ? Math.log2(ratio) : 0
}
