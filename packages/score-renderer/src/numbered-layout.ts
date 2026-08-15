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
  extensionXs: number[]
}

export type NumberedSystem = {
  measures: Array<{
    measure: ScoreMeasure
    index: number
    x: number
    leftBarX: number
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
  leadingWidth?: (measure: ScoreMeasure, index: number) => number
  rowHeight?: (measures: readonly ScoreMeasure[]) => number
}

type LocalPlacement = Omit<NumberedEventPlacement, 'width' | 'center' | 'extensionXs'> & { extensionOffsets: number[] }
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
  // A dotted eighth is 0.75 beats: it still needs one underline even though
  // its logarithmic distance from a quarter is less than one full power.
  return Math.max(0, Math.min(3, Math.ceil(Math.log2(1 / Math.max(0.125, event.beats)))))
}

function extensionCount(event: ScoreEvent, beatLength: number) {
  if ((event.kind !== 'note' && event.kind !== 'rest') || event.beats < beatLength * 2) return 0
  return Math.max(0, Math.floor(event.beats / beatLength) - 1)
}

function noteStep(event: ScoreEvent, fontSize: number, beatLength: number) {
  // Open Fanqie uses 37.5 for ordinary notes and 25 for reduced notes at its
  // 18px notation size.  Scaling those constants retains its recognizable grid.
  if (event.kind === 'tuplet') return Math.max(37.5, event.pitches.length * 25) * (fontSize / 18)
  const scale = fontSize / 18
  const base = (durationLines(event) > 0 ? 25 : 37.5) * scale
  return base + extensionCount(event, beatLength) * 37.5 * scale
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
    const extensions = extensionCount(event, beatLength)
    byBeat[beat]?.push({
      event,
      eventIndex,
      x: 0,
      startBeat,
      beat,
      durationLines: durationLines(event),
      extensionOffsets: Array.from({ length: extensions }, (_, extension) => (extension + 1) * 37.5 * scale),
    })
    startBeat += event.beats
  })

  // A forward-repeat begins a fresh rendered system.  Its barline needs a
  // dedicated leading column so the first note never collides with its dots.
  let beatStart = (measure.left ? barGap : 0) + (options.leadingWidth?.(measure, index) ?? 0)
  const placements: LocalPlacement[] = []
  let barX = beatStart + barGap
  byBeat.forEach((items, beatIndex) => {
    let column = items[0] ? accidentalWidth(items[0].event, options.fontSize) : 0
    items.forEach((item, itemIndex) => {
      if (itemIndex > 0) {
        const previous = items[itemIndex - 1]
        if (previous) {
          column += Math.max(noteStep(previous.event, options.fontSize, beatLength), noteStep(item.event, options.fontSize, beatLength))
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
      const trailing = dotsWidth(last.event, options.fontSize) + (options.lyricOverflow?.(last.event) ?? 0)
      if (beatIndex === byBeat.length - 1) barX = last.x + (last.extensionOffsets.at(-1) ?? 0) + barGap + trailing
      else beatStart = last.x + noteStep(last.event, options.fontSize, beatLength) + trailing
    }
  })
  return { measure, index, width: barX + barGap, barX, placements }
}

function finalizeSystem(items: MeasureMetric[], available: number, options: NumberedLayoutOptions): NumberedSystem {
  const starts = items.reduce<number[]>((result, item) => [...result, (result.at(-1) ?? 0) + item.width], [0]).slice(0, -1)
  const finalMetric = items.at(-1)
  // Every non-terminal metric includes one trailing bar column for the next
  // measure's first note. The final metric has no next measure, so including
  // that invisible column would make its end barline consume two intervals.
  const terminalWidth = finalMetric?.barX ?? 0
  const precedingWidth = items.slice(0, -1).reduce((total, item) => total + item.width, 0)
  const naturalWidth = Math.max(options.fontSize, precedingWidth + terminalWidth)
  // Scale the complete visible grid, including the final note-to-barline gap.
  // This makes the terminal column use the exact same ratio as normal bars.
  const scale = available / naturalWidth
  const rightEdge = options.padding + available
  const measures = items.map((item, itemIndex) => {
    const rawStart = starts[itemIndex] ?? 0
    const x = options.padding + rawStart * scale
    const terminal = itemIndex === items.length - 1
    const width = (terminal ? item.barX : item.width) * scale
    const placements = item.placements.map((placement, placementIndex, all) => {
      const next = all[placementIndex + 1]
      const scaledX = options.padding + (rawStart + placement.x) * scale
      const right = next
        ? options.padding + (rawStart + next.x) * scale
        : options.padding + (rawStart + item.barX) * scale
      return {
        ...placement,
        x: scaledX,
        width: Math.max(options.fontSize, right - scaledX),
        center: scaledX,
        extensionXs: placement.extensionOffsets.map((offset) => options.padding + (rawStart + placement.x + offset) * scale),
      }
    })
    const previous = items[itemIndex - 1]
    return {
      measure: item.measure,
      index: item.index,
      x,
      leftBarX: previous ? x - previous.width * scale + previous.barX * scale : x,
      width,
      barX: terminal ? rightEdge : options.padding + (rawStart + item.barX) * scale,
      placements,
    }
  })
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
    if (row.length && (measure.breakBefore || measure.left === 'rptstart' || rowWidth + metric.width > available)) flush()
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
