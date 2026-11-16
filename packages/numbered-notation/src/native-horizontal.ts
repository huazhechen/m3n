import { nativeStyle } from './native-style.js'
import type { NativeColumn, NativeControl, NativeGlyph, NativeMeasure } from './native-model.js'
import { nativeBeamCount } from './native-note-metrics.js'
import { solveNativeSpacing, type SpacingCell } from './native-spacing.js'

/** Bar geometry uses the same music size and proportional strokes as the reference. */
export function nativeBarMetrics(kind: string | undefined) {
  const size = nativeStyle.music * 1.25, thin = size * 0.065, thick = thin * 2.6, gap = thin * 1.8, radius = thin * 0.8
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

type HorizontalItem = { measure: NativeMeasure; column?: NativeColumn; controlColumn?: NativeColumn; controls?: NativeControl[]; boundary?: boolean; opening?: boolean; prefix?: boolean; left: number; right: number; cells: SpacingCell[]; fixedAfter?: number }
type HorizontalOptions = { noteGapEm?: number; minimumNoteGapEm?: number; pairedSpacing?: boolean }

/** A repeat opening supplies the shared boundary; a wrap restores both ends. */
export function nativeMeasureBars(measures: NativeMeasure[], index: number) {
  const measure = measures[index]!, previous = measures[index - 1], next = measures[index + 1]
  const joinsPrevious = previous?.lastFragment && !previous.breakAfter && !measure.breakBefore && previous.part === measure.part
  const joinsNext = measure.lastFragment && next && !measure.breakAfter && !next.breakBefore && next.part === measure.part
  const closesRepeat = (kind: string | undefined) => kind === 'rptend' || kind === 'rptboth'
  const opening = !measure.continuation && (measure.source.left === 'rptstart' || previous?.part === measure.part && previous.source.right === 'rptboth')
    && !(joinsPrevious && closesRepeat(previous.source.right))
  let closing = measure.lastFragment ? measure.source.right ?? 'single' : undefined
  if (closing === 'rptboth') closing = joinsNext ? 'rptboth' : 'rptend'
  if (joinsNext && next.source.left === 'rptstart') {
    if (closesRepeat(closing)) closing = 'rptboth'
    else if ((closing === 'single' || closing === 'dbl') && !(measure.source.repeatCount && measure.source.repeatCount > 2)
      && !measure.source.navigation?.length && !measure.source.events.some(event => event.navigation.some(name => name !== 'segno'))) closing = undefined
  }
  return { opening, closing }
}
const springCell = (lane: string, left: number, right: number, duration: number, alpha: number, gapScale: number): SpacingCell => {
  const durationScale = Math.sqrt(Math.max(0.01, duration))
  return { lane, left, right, before: durationScale * alpha * gapScale, after: durationScale * alpha * gapScale,
    beforeStiffness: 1 / (alpha * durationScale), afterStiffness: 1 / (alpha * durationScale), beforeCollision: 16, afterCollision: 16 }
}

/** Build one shared horizontal constraint chain, including zero-time bars. */
function itemsFor(measures: NativeMeasure[], options: HorizontalOptions, surrounding = measures): HorizontalItem[] {
  const scale = nativeStyle.music * (options.noteGapEm ?? 0.6) / 12
  const items: HorizontalItem[] = []
  const lanes = [...new Set(measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane))))]
  const parentheses = new Map<NativeGlyph, { left: number; right: number }>()
  for (const lane of lanes) {
    const members = surrounding.flatMap(measure => measure.columns.flatMap(column => column.glyphs.filter(glyph => glyph.lane === lane).map(glyph => ({ glyph, measure }))))
    const joins = (left: typeof members[number] | undefined, right: typeof members[number] | undefined) => left && right
      && (left.measure === right.measure || !left.measure.breakAfter && !right.measure.breakBefore && left.measure.part === right.measure.part)
    members.forEach((member, index) => {
      if (lane.startsWith('alternative:')) {
        parentheses.set(member.glyph, {
          left: members[index - 1]?.measure === member.measure ? 0 : member.glyph.parenthesisLeft ?? 0,
          right: members[index + 1]?.measure === member.measure ? 0 : member.glyph.parenthesisRight ?? 0,
        })
        return
      }
      if (!member.glyph.instrumental) return
      const previous = members[index - 1], next = members[index + 1]
      parentheses.set(member.glyph, {
        left: previous?.glyph.instrumental && joins(previous, member) ? 0 : member.glyph.parenthesisLeft ?? 0,
        right: next?.glyph.instrumental && joins(member, next) ? 0 : member.glyph.parenthesisRight ?? 0,
      })
    })
  }
  if (measures[0] && lanes.includes('bass')) items.push({ measure: measures[0], prefix: true, left: 0, right: 22,
    cells: lanes.filter(lane => !lane.startsWith('alternative:')).map(lane => springCell(lane, 0, 22, 0, 0.45, options.pairedSpacing === false ? 1 : scale)) })
  const bar = (measure: NativeMeasure, kind: string | undefined, opening = false) => {
    const geometry = nativeBarMetrics(kind)
    const prefix = !opening && measure.navigation?.length ? 4.4 + measure.navigation.reduce((sum, mark) => sum + mark.width + 4.4, 0) : 0
    const lanes = [...new Set(measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane)).filter(lane => !lane.startsWith('alternative:')))]
    const barScale = options.pairedSpacing === false || options.minimumNoteGapEm === undefined ? 1 : scale
    items.push({ measure, opening, boundary: true, left: geometry.anchor + prefix, right: geometry.width - geometry.anchor,
      cells: lanes.map(lane => springCell(lane, geometry.anchor + prefix, geometry.width - geometry.anchor, 0, 128, barScale)) })
  }
  for (const measure of measures) {
    const marks = nativeMeasureBars(surrounding, surrounding.indexOf(measure))
    const firstColumn = measure.columns[0]
    const controls = (column: NativeColumn, members: { control: NativeControl; lane: string }[]) => {
      if (!members.length) return
      const cells = members.map(({ control, lane }) => springCell(lane, control.anchor, control.width - control.anchor, 0, 6, scale))
      items.push({ measure, controlColumn: column, controls: members.map(member => member.control), left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A section heading introduces the repeat, rather than belonging inside it.
    // Its exterior spring must be measured in the same order as it is painted.
    if (firstColumn) controls(firstColumn, firstColumn.glyphs.flatMap(glyph => glyph.controls.filter(control => control.kind === 'section').map(control => ({control, lane: glyph.lane}))))
    if (marks.opening) bar(measure, 'rptstart', true)
    for (const column of measure.columns) {
      const membersByLane = column.glyphs.map(glyph => ({ lane: glyph.lane, controls: glyph.controls.filter(control => column !== firstColumn || control.kind !== 'section') }))
      for (let index = 0; index < Math.max(...membersByLane.map(member => member.controls.length)); index++) {
        controls(column, membersByLane.flatMap(member => member.controls[index] ? [{control: member.controls[index]!, lane: member.lane}] : []))
      }
      const cells = column.glyphs.map(glyph => {
        return springCell(glyph.lane, glyph.musicLeft ?? glyph.left, glyph.musicRight ?? glyph.right, glyph.multiRest ? 1 : glyph.beats, 6, scale)
      })
      items.push({ measure, column, left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A split measure has no visible closing bar until its final fragment.
    if (marks.closing !== undefined) bar(measure, marks.closing)
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
    const glyph = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    // Note clearance and lyric ink share physical space; do not add both widths.
    if (glyph) {
      cell.left = Math.max(cell.left, glyph.lyricLeft ?? 0)
      cell.right = Math.max(cell.right, glyph.lyricRight ?? 0)
      const insets = parentheses.get(glyph)
      cell.left += insets?.left ?? 0; cell.right += insets?.right ?? 0
    }
    if (item.boundary || item.prefix) cell.beforeCollision = cell.afterCollision = 64
  }
  // Bar edges are hard boundaries for both neighbours, including each
  // voice sharing that boundary. Using the ordinary-note penalty here
  // distorts compressed systems even when their line breaks agree.
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]!, current = items[index]!
    if (previous.boundary || current.boundary) {
      for (const cell of previous.cells) cell.afterCollision = 64
      for (const cell of current.cells) cell.beforeCollision = 64
    }
  }
  // Multi-measure rest symbols form compact rigid blocks with adjacent bars.
  // All simultaneous lanes still contribute their physical clearance.
  for (const [index, item] of items.entries()) {
    if (!item.column?.glyphs.some(glyph => glyph.multiRest)) continue
    for (const edge of [index - 1, index]) {
      const left = items[edge], right = items[edge + 1]
      if (!left || !right || !(edge === index - 1 ? left.boundary : right.boundary)) continue
      left.fixedAfter = Math.max(...lanes.map(lane => {
        const a = left.cells.find(cell => cell.lane === lane), b = right.cells.find(cell => cell.lane === lane)
        const padding = right.column?.glyphs.some(glyph => glyph.lane === lane && glyph.multiRest) ? nativeStyle.music * 0.25 : 0
        return (a?.right ?? 0) + (b?.left ?? 0) + padding
      }))
    }
  }
  return items
}

/** Record natural/minimum spans before choosing line breaks. */
export function measureNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions) {
  // Forced breaks terminate the spring chain. Measuring across them keeps
  // interior minimum margins at the two future exterior edges, and can even
  // let a voice or lyric on another forced row constrain this row's width.
  for (let begin = 0; begin < measures.length;) {
    let end = begin + 1
    while (end < measures.length && !measures[end]!.breakBefore && !measures[end - 1]!.breakAfter) end++
    measureHorizontalGroup(measures.slice(begin, end), options)
    begin = end
  }
}

function measureHorizontalGroup(measures: NativeMeasure[], options: HorizontalOptions) {
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
      measure.columns.forEach((column, index) => {
        const owned = selected.filter(({ item }) => item.column === column || item.controlColumn === column)
        const left = index === 0 ? measure[minimum ? 'minimumStart' : 'naturalStart']! : Math.min(...owned.map(({ item, index }) => result.positions[index]! - Math.max(...item.cells.map(cell => cell.left))))
        const right = index === measure.columns.length - 1 ? measure[minimum ? 'minimumEnd' : 'naturalEnd']! : Math.max(...owned.map(({ item, index }) => result.positions[index]! + Math.max(...item.cells.map(cell => cell.right))))
        if (minimum) { column.minimumStart = left; column.minimumEnd = right }
        else { column.naturalStart = left; column.naturalEnd = right }
      })
    }
  }
}

/** Justify a complete system, then publish event and measure positions. */
export function placeNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions, x: number, width: number, surrounding = measures): NativeGlyph[] {
  const items = itemsFor(measures, options, surrounding), result = solveNativeSpacing(items, width, true)
  for (const measure of measures) { measure.start = Infinity; measure.end = -Infinity }
  const glyphs: NativeGlyph[] = []
  items.forEach((item, index) => {
    const position = x + result.positions[index]!
    item.measure.start = Math.min(item.measure.start, position - item.left)
    item.measure.end = Math.max(item.measure.end, position + item.right)
    if (item.column) {
      item.column.x = position
      for (const glyph of item.column.glyphs) { glyph.x = position; glyphs.push(glyph) }
    } else if (item.controls) item.controls.forEach(control => { control.x = position - control.anchor })
    else if (item.prefix) return
    else if (item.opening) item.measure.openingBarX = position
    else {
      item.measure.barX = position
      let cursor = position - item.left + 4.4
      for (const mark of item.measure.navigation ?? []) { mark.x = cursor; cursor += mark.width + 4.4 }
    }
  })
  return glyphs
}
