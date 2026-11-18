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
type HorizontalOptions = { minimumNoteGapEm?: number; minimumNoteGapFloorEm?: number; equalMeasures?: boolean }

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
const minimumCell = (lane: string, left: number, right: number, duration: number, alpha: number, gapScale: number): SpacingCell => {
  const durationScale = Math.sqrt(Math.max(0.01, duration))
  // Rhythm alone determines stretch; ink and lyrics only constrain minima.
  // Zero-time controls have a neutral weight, as do quarter-clearance bars.
  const stretch = duration > 0 ? durationScale : 1
  return { lane, left, right, before: durationScale * alpha * gapScale, after: durationScale * alpha * gapScale,
    beforeStretch: stretch, afterStretch: stretch,
  }
}

/** Build one shared horizontal constraint chain, including zero-time bars. */
function itemsFor(measures: NativeMeasure[], options: HorizontalOptions, surrounding = measures): HorizontalItem[] {
  const scale = nativeStyle.music * (options.minimumNoteGapEm ?? 0.4) / 12
  const items: HorizontalItem[] = []
  const lanes = [...new Set(measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane))))]
  const parentheses = new Map<NativeGlyph, { left: number; right: number }>()
  for (const lane of lanes) {
    const members = surrounding.flatMap(measure => measure.columns.flatMap(column => column.glyphs.filter(glyph => glyph.lane === lane).map(glyph => ({ glyph, measure }))))
    const joins = (left: typeof members[number] | undefined, right: typeof members[number] | undefined) => left && right
      && (left.measure === right.measure || !left.measure.breakAfter && !right.measure.breakBefore && left.measure.part === right.measure.part)
    members.forEach((member, index) => {
      if (!member.glyph.instrumental) return
      const previous = members[index - 1], next = members[index + 1]
      parentheses.set(member.glyph, {
        left: previous?.glyph.instrumental && joins(previous, member) ? 0 : member.glyph.parenthesisLeft ?? 0,
        right: next?.glyph.instrumental && joins(member, next) ? 0 : member.glyph.parenthesisRight ?? 0,
      })
    })
  }
  if (measures[0] && lanes.includes('bass')) items.push({ measure: measures[0], prefix: true, left: 0, right: nativeStyle.music,
    cells: lanes.map(lane => minimumCell(lane, 0, nativeStyle.music, 0, 0.45, scale)) })
  const bar = (measure: NativeMeasure, kind: string | undefined, opening = false) => {
    const geometry = nativeBarMetrics(kind)
    const prefix = !opening && measure.navigation?.length ? 4.4 + measure.navigation.reduce((sum, mark) => sum + mark.width + 4.4, 0) : 0
    const lanes = [...new Set(measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.lane)))]
    items.push({ measure, opening, boundary: true, left: geometry.anchor + prefix, right: geometry.width - geometry.anchor,
      // A bar has no musical duration; only its clearance matches a quarter note.
      cells: lanes.map(lane => minimumCell(lane, geometry.anchor + prefix, geometry.width - geometry.anchor, 1, 6, scale)) })
  }
  for (const measure of measures) {
    const marks = nativeMeasureBars(surrounding, surrounding.indexOf(measure))
    const firstColumn = measure.columns[0]
    const controls = (column: NativeColumn, members: { control: NativeControl; lane: string }[]) => {
      if (!members.length) return
      const cells = members.map(({ control, lane }) => minimumCell(lane, control.anchor, control.width - control.anchor, 0, 6, scale))
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
        return minimumCell(glyph.lane, glyph.musicLeft ?? glyph.left, glyph.musicRight ?? glyph.right, glyph.multiRest ? 1 : glyph.beats, 6, scale)
      })
      items.push({ measure, column, left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A split measure has no visible closing bar until its final fragment.
    if (marks.closing !== undefined) bar(measure, marks.closing)
  }
  // Adjacency belongs to a voice. Finer notes or controls in another voice
  // do not interrupt its beam or sustain; its own controls and bars still do.
  const groupStarts = new Set<SpacingCell>(), groupEnds = new Set<SpacingCell>()
  const previousByLane = new Map<string, { item: HorizontalItem; cell: SpacingCell }>()
  for (const item of items) for (const cell of item.cells) {
    const previous = previousByLane.get(cell.lane)
    const left = previous?.item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    const right = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    // A displayed sustain dash continues the preceding sound, including a
    // fractional tied head. Keep actual durations in the square-root springs.
    // The measure identity and intervening control items keep bars/settings out.
    const sustain = left && right?.sustain && !right.controls.length
      && Math.abs(left.time + left.beats - right.time) < 1e-7
    if (previous?.item.measure === item.measure && left && right && (sustain || nativeBeamCount(left, right))) {
      previous.cell.afterStretch = (previous.cell.afterStretch ?? 1) * 0.5
      cell.beforeStretch = (cell.beforeStretch ?? 1) * 0.5
      previous.cell.after *= 0.5
      cell.before *= 0.5
    } else if (previous?.item.measure === item.measure && left && right) {
      // Group boundaries reserve an absolute clearance, independent of duration.
      groupEnds.add(previous.cell); groupStarts.add(cell)
    }
    previousByLane.set(cell.lane, { item, cell })
  }
  // Reserve only minimum clearance. Surplus is allocated separately by weight.
  // Exterior ink stays flush with the line.
  for (const [index, item] of items.entries()) for (const cell of item.cells) {
    const glyph = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    const floor = glyph ? nativeStyle.music * (options.minimumNoteGapFloorEm ?? 0) / 2 : 0
    const groupGap = nativeStyle.music * (options.minimumNoteGapEm ?? 0.4) / 2
    if (groupStarts.has(cell)) cell.before = groupGap
    if (groupEnds.has(cell)) cell.after = groupGap
    cell.before = Math.max(cell.before, floor); cell.after = Math.max(cell.after, floor)
    const left = index === 0 ? 0 : Math.max(groupStarts.has(cell) ? groupGap : cell.before, floor)
    const right = index === items.length - 1 ? 0 : Math.max(groupEnds.has(cell) ? groupGap : cell.after, floor)
    cell.left += left; cell.right += right; cell.before = cell.after = 0
    // Note clearance and lyric ink share physical space; do not add both widths.
    if (glyph) {
      // An absent voice gets music-only minimum clearance. Lyrics and
      // parentheses belong to their real voice, not its neighbours' blanks.
      cell.placeholderLeft = cell.left; cell.placeholderRight = cell.right
      cell.left = Math.max(cell.left, glyph.lyricLeft ?? 0)
      cell.right = Math.max(cell.right, glyph.lyricRight ?? 0)
      const insets = parentheses.get(glyph)
      cell.left += insets?.left ?? 0; cell.right += insets?.right ?? 0
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

/** Record minimum spans before choosing line breaks. */
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
  const items = itemsFor(measures, options)
  const result = solveNativeSpacing(items)
  for (const measure of measures) {
    const selected = items.map((item, index) => ({ item, index })).filter(({ item }) => item.measure === measure)
    const first = selected[0], last = selected.at(-1)
    if (!first || !last) continue
    const left = result.positions[first.index]! - Math.max(...first.item.cells.map(cell => cell.left))
    const right = result.positions[last.index]! + Math.max(...last.item.cells.map(cell => cell.right))
    measure.minimumStart = left; measure.minimumEnd = right; measure.minimum = right - left
    measure.columns.forEach((column, index) => {
      const owned = selected.filter(({ item }) => item.column === column || item.controlColumn === column)
      column.minimumStart = index === 0 ? measure.minimumStart! : Math.min(...owned.map(({ item, index }) => result.positions[index]! - Math.max(...item.cells.map(cell => cell.left))))
      column.minimumEnd = index === measure.columns.length - 1 ? measure.minimumEnd! : Math.max(...owned.map(({ item, index }) => result.positions[index]! + Math.max(...item.cells.map(cell => cell.right))))
    })
  }
}

/** Keep visible bar anchors fixed while solving each equal cell's interior.
 * Build the complete system first: minimum clearance, parentheses and parallel
 * voices must not be reset at every artificial cell edge. */
function equalMeasureRanges(items: HorizontalItem[]) {
  const ranges: {start:number;end:number;bar?:number}[] = []
  let start = 0, musical = false
  for (const [index, item] of items.entries()) {
    if (musical && item.boundary) {
      ranges.push({start,end:index,bar:index})
      start = index + 1; musical = false
    }
    if (item.column) musical = true
  }
  if (musical) ranges.push({start,end:items.length})
  return ranges
}

function equalMeasurePositions(items: HorizontalItem[], width: number): number[] {
  const ranges = equalMeasureRanges(items)
  if (ranges.length < 2) return solveNativeSpacing(items,width,true).positions
  const leftOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.left))
  const rightOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.right))
  const tail = ranges.at(-1)!.bar
  const cellWidth = (width - (tail === undefined ? 0 : rightOf(tail))) / ranges.length
  const positions = Array<number>(items.length).fill(0)
  for (const [index, range] of ranges.entries()) {
    const previous = ranges[index-1]?.bar
    const left = index*cellWidth + (previous === undefined ? 0 : rightOf(previous))
    const right = (index+1)*cellWidth - (range.bar === undefined ? 0 : leftOf(range.bar))
    const solved = solveNativeSpacing(items.slice(range.start,range.end),Math.max(1,right-left),true,
      { left: previous !== undefined && items[previous]!.fixedAfter === undefined,
        right: range.bar !== undefined && items[range.end - 1]?.fixedAfter === undefined })
    solved.positions.forEach((position,offset) => { positions[range.start+offset] = left+position })
    if (range.bar !== undefined) positions[range.bar] = (index+1)*cellWidth
  }
  return positions
}

export type NativeHorizontalSpacing = {
  minimumWidth: number; stretchWeight: number
  equalCells?: { count: number; tailRight: number }
}

/** Measure the exact chain used for placement, including rigid groups, voice
 * placeholders, lyrics and visible boundary ink. Only needed for the last pair. */
export function nativeHorizontalSpacing(measures: NativeMeasure[], options: HorizontalOptions): NativeHorizontalSpacing {
  const items = itemsFor(measures, options), solved = solveNativeSpacing(items)
  if (!options.equalMeasures) return solved
  const ranges = equalMeasureRanges(items)
  if (!ranges.length) return solved
  const leftOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.left))
  const rightOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.right))
  const tail = ranges.at(-1)!.bar, tailRight = tail === undefined ? 0 : rightOf(tail)
  const minimumCellWidth = Math.max(...ranges.map((range, index) => {
    const previous = ranges[index - 1]?.bar
    return (previous === undefined ? 0 : rightOf(previous))
      + solveNativeSpacing(items.slice(range.start, range.end)).minimumWidth
      + (range.bar === undefined ? 0 : leftOf(range.bar))
  }))
  return { minimumWidth: minimumCellWidth * ranges.length + tailRight, stretchWeight: solved.stretchWeight,
    equalCells: { count: ranges.length, tailRight } }
}

/** Inherit the preceding row's spacing only for a genuinely short final row.
 * Overlong trials fall back to the current capacity; hard minima never shrink. */
export function nativeLastLineWidth(current: NativeHorizontalSpacing, width: number, previous: NativeHorizontalSpacing, previousWidth: number) {
  let inherited: number
  if (current.equalCells && previous.equalCells) {
    const cellWidth = Math.max(0, previousWidth - previous.equalCells.tailRight) / previous.equalCells.count
    inherited = Math.max(current.minimumWidth, cellWidth * current.equalCells.count + current.equalCells.tailRight)
  } else {
    const stretch = previous.stretchWeight > 0 ? Math.max(0, previousWidth - previous.minimumWidth) / previous.stretchWeight : 0
    inherited = current.minimumWidth + stretch * current.stretchWeight
  }
  // Check capacity BEFORE the short-row threshold. A high previous stretch or
  // wider lyrics here must never carry an overlong inherited row into placement.
  if (inherited > width) return width
  return inherited <= width * .6 ? inherited : width
}

/** Justify a complete system, then publish event and measure positions. */
export function placeNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions, x: number, width: number, surrounding = measures): NativeGlyph[] {
  const items = itemsFor(measures, options, surrounding)
  const positions = options.equalMeasures ? equalMeasurePositions(items,width) : solveNativeSpacing(items,width,true).positions
  for (const measure of measures) { measure.start = Infinity; measure.end = -Infinity }
  const glyphs: NativeGlyph[] = []
  items.forEach((item, index) => {
    const position = x + positions[index]!
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
