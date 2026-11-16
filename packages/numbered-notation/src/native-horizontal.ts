import type { NativeColumn, NativeGlyph, NativeMeasure } from './native-model.js'
import { nativeBeamCount } from './native-note-metrics.js'
import { solveNativeSpacing, type SpacingCell } from './native-spacing.js'

/** Bar geometry uses the same music size and proportional strokes as the reference. */
export function nativeBarMetrics(kind: string | undefined) {
  const size = 27.5, thin = size * 0.065, thick = thin * 2.6, gap = thin * 1.8, radius = thin * 0.8
  const leftDots = kind === 'rptend' || kind === 'rptboth', rightDots = kind === 'rptstart' || kind === 'rptboth'
  const widths = kind === 'dbl' ? [thin, thin] : kind === 'end' || leftDots ? [thin, thick] : rightDots ? [thick, thin] : [thin]
  const prefix = leftDots ? radius * 3 + gap : 0
  const bars = widths.map((width, index) => ({ x: prefix + widths.slice(0, index).reduce((sum, value) => sum + value + gap, 0), width }))
  let width = bars.at(-1)!.x + bars.at(-1)!.width
  const dots = leftDots ? [radius] : []
  if (rightDots) { dots.push(width + gap + radius); width += gap + radius * 2 }
  const anchor = leftDots || rightDots ? bars[0]!.x + bars[0]!.width / 2 : width / 2
  return { size, width, anchor, bars, dots, radius }
}

type HorizontalItem = { measure: NativeMeasure; column?: NativeColumn; opening?: boolean; prefix?: boolean; left: number; right: number; cells: SpacingCell[] }
type HorizontalOptions = { noteGapEm?: number; minimumNoteGapEm?: number; pairedSpacing?: boolean }
const springCell = (lane: string, left: number, right: number, duration: number, alpha: number, gapScale: number): SpacingCell => {
  const durationScale = Math.sqrt(Math.max(0.01, duration))
  return { lane, left, right, before: durationScale * alpha * gapScale, after: durationScale * alpha * gapScale,
    beforeStiffness: 1 / (alpha * durationScale), afterStiffness: 1 / (alpha * durationScale), beforeCollision: 16, afterCollision: 16 }
}

/** Build one shared horizontal constraint chain, including zero-time bars. */
function itemsFor(measures: NativeMeasure[], options: HorizontalOptions): HorizontalItem[] {
  const scale = 22 * (options.noteGapEm ?? 0.6) / 12
  const items: HorizontalItem[] = []
  const lanes = [...new Set(measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane))))]
  if (measures[0] && lanes.includes('bass')) items.push({ measure: measures[0], prefix: true, left: 0, right: 22,
    cells: lanes.filter(lane => !lane.startsWith('alternative:')).map(lane => springCell(lane, 0, 22, 0, 0.45, options.pairedSpacing === false ? 1 : scale)) })
  const bar = (measure: NativeMeasure, kind: string | undefined, opening = false) => {
    const geometry = nativeBarMetrics(kind)
    const lanes = [...new Set(measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane)).filter(lane => !lane.startsWith('alternative:')))]
    const barScale = options.pairedSpacing === false || options.minimumNoteGapEm === undefined ? 1 : scale
    items.push({ measure, opening, left: geometry.anchor, right: geometry.width - geometry.anchor,
      cells: lanes.map(lane => springCell(lane, geometry.anchor, geometry.width - geometry.anchor, 0, 128, barScale)) })
  }
  for (const measure of measures) {
    if (!measure.continuation && measure.source.left === 'rptstart') bar(measure, 'rptstart', true)
    for (const column of measure.columns) {
      const cells = column.glyphs.map(glyph => {
        const controls = glyph.controls.reduce((sum, control) => sum + control.width, 0)
        return springCell(glyph.lane, glyph.left + controls, glyph.right, glyph.beats, 6, scale)
      })
      items.push({ measure, column, left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A split measure has no visible closing bar until its final fragment.
    if (measure.lastFragment) bar(measure, measure.source.right)
  }
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]!, current = items[index]!
    if (!previous.column || !current.column || previous.measure !== current.measure) continue
    for (const left of previous.column.glyphs) {
      const right = current.column.glyphs.find(glyph => glyph.lane === left.lane)
      if (!right || !nativeBeamCount(left, right)) continue
      previous.cells.find(cell => cell.lane === left.lane)!.after *= 0.8
      current.cells.find(cell => cell.lane === left.lane)!.before *= 0.8
    }
  }
  // Preserve the minimum clearance as physical reservation, leaving only
  // the remaining clearance elastic. Exterior ink stays flush with the line.
  const reserveRatio = options.minimumNoteGapEm === undefined ? 0 : options.minimumNoteGapEm / (options.noteGapEm || 1)
  for (const [index, item] of items.entries()) for (const cell of item.cells) {
    const left = index === 0 ? 0 : cell.before * reserveRatio, right = index === items.length - 1 ? 0 : cell.after * reserveRatio
    cell.left += left; cell.right += right; cell.before -= left; cell.after -= right
    if (!item.column) cell.beforeCollision = cell.afterCollision = 64
  }
  // Bar edges are hard boundaries for both neighbours, including each
  // voice sharing that boundary. Using the ordinary-note penalty here
  // distorts compressed systems even when their line breaks agree.
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]!, current = items[index]!
    if ((!previous.column && !previous.prefix) || (!current.column && !current.prefix)) {
      for (const cell of previous.cells) cell.afterCollision = 64
      for (const cell of current.cells) cell.beforeCollision = 64
    }
  }
  return items
}

/** Record natural/minimum spans before choosing line breaks. */
export function measureNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions) {
  for (const minimum of [false, true]) {
    const items = itemsFor(measures, minimum ? { ...options, noteGapEm: options.minimumNoteGapEm ?? options.noteGapEm } : options)
    const result = solveNativeSpacing(items)
    for (const measure of measures) {
      const selected = items.map((item, index) => ({ item, index })).filter(({ item }) => item.measure === measure)
      const first = selected[0], last = selected.at(-1)
      if (!first || !last) continue
      const left = result.positions[first.index]! - Math.max(...first.item.cells.map(cell => cell.left))
      const right = result.positions[last.index]! + Math.max(...last.item.cells.map(cell => cell.right))
      if (minimum) { measure.minimumStart = left; measure.minimumEnd = right; measure.minimum = right - left }
      else { measure.naturalStart = left; measure.naturalEnd = right; measure.natural = right - left }
    }
  }
}

/** Justify a complete system, then publish event and measure positions. */
export function placeNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions, x: number, width: number): NativeGlyph[] {
  const items = itemsFor(measures, options), result = solveNativeSpacing(items, width, true)
  for (const measure of measures) { measure.start = Infinity; measure.end = -Infinity }
  const glyphs: NativeGlyph[] = []
  items.forEach((item, index) => {
    const position = x + result.positions[index]!
    item.measure.start = Math.min(item.measure.start, position - item.left)
    item.measure.end = Math.max(item.measure.end, position + item.right)
    if (item.column) {
      item.column.x = position
      for (const glyph of item.column.glyphs) { glyph.x = position; glyphs.push(glyph) }
    } else if (item.prefix) return
    else if (item.opening) item.measure.openingBarX = position
    else item.measure.barX = position
  })
  return glyphs
}
