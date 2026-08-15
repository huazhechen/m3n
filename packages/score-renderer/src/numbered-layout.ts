import type { ScoreEvent, ScoreMeasure } from '@m3n/notation'

export type NumberedEventPlacement = {
  event: ScoreEvent
  eventIndex: number
  x: number
  width: number
  center: number
  startBeat: number
  span: number
}

export type NumberedSystem = {
  measures: Array<{
    measure: ScoreMeasure
    index: number
    x: number
    width: number
    placements: NumberedEventPlacement[]
  }>
  y: number
  height: number
}

export type NumberedLayoutOptions = {
  width: number
  padding: number
  fontSize: number
  beatLength: number
  lyricWidth?: (event: ScoreEvent) => number
  labelWidth?: (event: ScoreEvent) => number
  rowHeight?: (measures: readonly ScoreMeasure[]) => number
}

function eventSpan(event: ScoreEvent, beatLength: number) {
  return Math.max(0.25, event.beats / Math.max(0.125, beatLength))
}

function naturalEventWidth(event: ScoreEvent, fontSize: number, beatLength: number, options: NumberedLayoutOptions) {
  const pitchWidth = event.kind === 'chord' ? Math.max(1, event.pitches.length) * fontSize * 0.52 : fontSize * 0.92
  const durationWidth = event.beats >= beatLength ? event.beats / beatLength * fontSize * 0.62 : fontSize * 0.78
  const labels = Math.max(options.lyricWidth?.(event) ?? 0, options.labelWidth?.(event) ?? 0)
  return Math.max(fontSize * 0.9, pitchWidth, durationWidth, labels) + fontSize * 0.45
}

function measureWidth(measure: ScoreMeasure, options: NumberedLayoutOptions) {
  const gap = options.fontSize * 0.2
  const content = measure.events.reduce((total, event) => total + naturalEventWidth(event, options.fontSize, options.beatLength, options), 0)
  return Math.max(options.fontSize * 3, content + gap * Math.max(0, measure.events.length - 1) + options.fontSize * 0.8)
}

function placeMeasure(measure: ScoreMeasure, index: number, x: number, width: number, options: NumberedLayoutOptions) {
  const gap = options.fontSize * 0.2
  const natural = measure.events.reduce((total, event) => total + naturalEventWidth(event, options.fontSize, options.beatLength, options), 0)
  const scale = natural > 0 ? Math.max(1, (width - gap * Math.max(0, measure.events.length - 1)) / natural) : 1
  let cursor = x + options.fontSize * 0.4
  let startBeat = 0
  const placements = measure.events.map((event, eventIndex) => {
    const eventWidth = naturalEventWidth(event, options.fontSize, options.beatLength, options) * scale
    const placement = { event, eventIndex, x: cursor, width: eventWidth, center: cursor + eventWidth / 2, startBeat, span: eventSpan(event, options.beatLength) }
    cursor += eventWidth + gap
    startBeat += event.beats
    return placement
  })
  return { measure, index, x, width, placements }
}

export function buildNumberedLayout(measures: readonly ScoreMeasure[], options: NumberedLayoutOptions): NumberedSystem[] {
  const available = Math.max(options.fontSize * 4, options.width - options.padding * 2)
  const measureGap = options.fontSize * 0.45
  const rows: Array<Array<{ measure: ScoreMeasure; index: number; natural: number }>> = []
  let row: Array<{ measure: ScoreMeasure; index: number; natural: number }> = []
  let rowWidth = 0
  const flush = () => { if (row.length) rows.push(row); row = []; rowWidth = 0 }
  for (const [index, measure] of measures.entries()) {
    const natural = measureWidth(measure, options)
    const next = rowWidth + (row.length ? measureGap : 0) + natural
    if (row.length && (next > available || measure.breakBefore)) flush()
    row.push({ measure, index, natural })
    rowWidth += (row.length === 1 ? 0 : measureGap) + natural
    if (measure.breakAfter) flush()
  }
  flush()
  const systems: NumberedSystem[] = []
  let y = 0
  rows.forEach((items, rowIndex) => {
    const naturalTotal = items.reduce((sum, item) => sum + item.natural, 0) + measureGap * Math.max(0, items.length - 1)
    const justified = rowIndex < rows.length - 1 && naturalTotal < available
    const scale = justified ? available / naturalTotal : 1
    let x = options.padding
    const placed = items.map((item) => {
      const width = item.natural * scale
      const output = placeMeasure(item.measure, item.index, x, width, options)
      x += width + measureGap * scale
      return output
    })
    const height = options.rowHeight?.(items.map((item) => item.measure)) ?? options.fontSize * 3.6
    systems.push({ measures: placed, y, height })
    y += height
  })
  return systems
}
