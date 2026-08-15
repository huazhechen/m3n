import type { ScoreEvent, ScoreMeasure } from '@m3n/notation'

/**
 * ScoreDocument adaptation of Open Fanqie's two-unit horizontal grid.  Notes
 * are placed in beat columns first; line breaking happens only after every
 * measure has a stable natural width.
 */
export type NumberedEventPlacement = {
  event: ScoreEvent
  eventIndex: number
  x: number
  width: number
  center: number
  startBeat: number
  beat: number
  durationLines: number
}

export type NumberedSystem = {
  measures: Array<{
    measure: ScoreMeasure
    index: number
    x: number
    width: number
    barX: number
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
  lyricOverflow?: (event: ScoreEvent) => number
  rowHeight?: (measures: readonly ScoreMeasure[]) => number
}

type LocalPlacement = Omit<NumberedEventPlacement, 'width' | 'center'>
type MeasureMetric = {
  measure: ScoreMeasure
  index: number
  width: number
  barX: number
  placements: LocalPlacement[]
}

function accidentalWidth(event: ScoreEvent, fontSize: number) {
  return event.pitches.some((pitch) => /[#b=]/.test(pitch)) ? fontSize * 0.28 : 0
}

function dotsWidth(event: ScoreEvent, fontSize: number) {
  const ratio = event.beats / Math.max(0.125, Math.pow(2, Math.floor(Math.log2(Math.max(event.beats, 0.125)))))
  return ratio > 1.2 ? fontSize * 0.44 : 0
}

function durationLines(event: ScoreEvent) {
  if (event.kind !== 'note' && event.kind !== 'rest') return 0
  if (event.beats >= 1) return 0
  return Math.max(0, Math.min(3, Math.round(Math.log2(1 / Math.max(0.125, event.beats)))))
}

function noteStep(event: ScoreEvent, fontSize: number) {
  // Open Fanqie uses 37.5 for ordinary notes and 25 for reduced notes at its
  // 18px notation size.  Scaling those constants retains its recognizable grid.
  return (durationLines(event) > 0 ? 25 : 37.5) * (fontSize / 18)
}

function measureMetric(measure: ScoreMeasure, index: number, options: NumberedLayoutOptions): MeasureMetric {
  const scale = options.fontSize / 18
  const barGap = 35 * scale
  const beatLength = Math.max(0.125, options.beatLength)
  const byBeat: LocalPlacement[][] = []
  let startBeat = 0
  measure.events.forEach((event, eventIndex) => {
    const beat = Math.max(0, Math.floor((startBeat + 1e-7) / beatLength))
    while (byBeat.length <= beat) byBeat.push([])
    byBeat[beat]?.push({ event, eventIndex, x: 0, startBeat, beat, durationLines: durationLines(event) })
    startBeat += event.beats
  })

  // A leading repeat sign is a real layout object.  Reserving its barline
  // column here keeps the first number clear of the dots and heavy stroke.
  let beatStart = measure.left ? barGap : 0
  const placements: LocalPlacement[] = []
  byBeat.forEach((items) => {
    let column = items[0] ? accidentalWidth(items[0].event, options.fontSize) : 0
    items.forEach((item, itemIndex) => {
      if (itemIndex > 0) {
        const previous = items[itemIndex - 1]
        if (previous) {
          column += Math.max(noteStep(previous.event, options.fontSize), noteStep(item.event, options.fontSize))
            + dotsWidth(previous.event, options.fontSize)
            + accidentalWidth(item.event, options.fontSize)
            + (options.lyricOverflow?.(previous.event) ?? 0)
        }
      }
      item.x = beatStart + column
      placements.push(item)
    })
    const last = items.at(-1)
    if (last) {
      beatStart += last.x - beatStart + noteStep(last.event, options.fontSize)
        + dotsWidth(last.event, options.fontSize)
        + (options.lyricOverflow?.(last.event) ?? 0)
    }
  })
  const barX = beatStart + barGap
  return { measure, index, width: barX + barGap, barX, placements }
}

function finalizeSystem(items: MeasureMetric[], available: number, options: NumberedLayoutOptions): NumberedSystem {
  const naturalWidth = items.reduce((sum, item) => sum + item.width, 0)
  // Fanqie's systems are justified to the printable edge.  Keeping a short
  // final system at its natural width makes the page read as unfinished and
  // also causes the barline grid to drift between rows.
  const scale = naturalWidth > 0 ? available / naturalWidth : 1
  let cursor = options.padding
  const measures = items.map((item) => {
    const x = cursor
    const width = item.width * scale
    const placements = item.placements.map((placement, placementIndex, all) => {
      const next = all[placementIndex + 1]
      const right = next ? next.x : item.barX
      const localWidth = Math.max(options.fontSize, right - placement.x)
      const scaledX = x + placement.x * scale
      return {
        ...placement,
        x: scaledX,
        width: localWidth * scale,
        center: scaledX,
      }
    })
    cursor += width
    return { measure: item.measure, index: item.index, x, width, barX: x + item.barX * scale, placements }
  })
  const finalMeasure = measures.at(-1)
  if (finalMeasure) {
    const right = options.padding + available
    finalMeasure.width = right - finalMeasure.x
    finalMeasure.barX = right
    const finalPlacement = finalMeasure.placements.at(-1)
    if (finalPlacement) finalPlacement.width = Math.max(options.fontSize, right - finalPlacement.x)
  }
  const height = options.rowHeight?.(items.map((item) => item.measure)) ?? options.fontSize * 4
  return { measures, y: 0, height }
}

export function buildNumberedLayout(measures: readonly ScoreMeasure[], options: NumberedLayoutOptions): NumberedSystem[] {
  const available = Math.max(options.fontSize * 8, options.width - options.padding * 2)
  const rows: MeasureMetric[][] = []
  let row: MeasureMetric[] = []
  let rowWidth = 0
  const flush = () => { if (row.length) rows.push(row); row = []; rowWidth = 0 }
  measures.forEach((measure, index) => {
    const metric = measureMetric(measure, index, options)
    if (row.length && (measure.breakBefore || rowWidth + metric.width > available)) flush()
    row.push(metric)
    rowWidth += metric.width
    if (measure.breakAfter) flush()
  })
  flush()
  let y = 0
  return rows.map((items) => {
    const system = finalizeSystem(items, available, options)
    system.y = y
    y += system.height
    return system
  })
}
