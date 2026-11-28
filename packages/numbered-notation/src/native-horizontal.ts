import { measureScoreRhythmicIntervals } from './layout/rhythmic-spacing.js'
import { scoreRhythmicWeight, scoreRhythmicGapWeight } from './layout/policy.js'
import { nativeStyle } from './native-style.js'
import { lastLineWidth } from './layout/last-line-width.js'
import type { NativeColumn, NativeControl, NativeGlyph, NativeMeasure } from './native-model.js'
import { nativeBeamCount } from './native-note-metrics.js'
import { cacheScoreMinimumSpacing, solveScoreMinimumSpacing, type SpacingCell } from './layout/spacing.js'

/** Bar geometry uses the same music size and proportional strokes as the reference. */
function createBarMetrics(kind: string) {
  const size = nativeStyle.music * 1.25, thin = nativeStyle.music / 12, thick = thin * 2.5, gap = thin * 1.8, radius = thin * 0.8
  const leftDots = kind === 'rptend' || kind === 'rptboth', rightDots = kind === 'rptstart' || kind === 'rptboth'
  const widths = kind === 'rptboth' ? [thin, thick, thin] : kind === 'dbl' ? [thin, thin] : kind === 'end' || leftDots ? [thin, thick] : rightDots ? [thick, thin] : [thin]
  const prefix = leftDots ? radius * (kind === 'rptboth' ? 2 : 3) + gap : 0
  const bars = widths.map((width, index) => ({ x: prefix + widths.slice(0, index).reduce((sum, value) => sum + value + gap, 0), width }))
  let width = bars.at(-1)!.x + bars.at(-1)!.width
  const dots = leftDots ? [radius] : []
  if (rightDots) { dots.push(width + gap + radius); width += gap + radius * 2 }
  const anchor = leftDots || rightDots ? bars[0]!.x + bars[0]!.width / 2 : width / 2
  return { size, width, anchor, bars, dots, radius }
}
const barMetrics = new Map<string, ReturnType<typeof createBarMetrics>>()
/** Immutable geometry for the six bar forms; independent of fonts and scores. */
export function nativeBarMetrics(kind: string | undefined) {
  const key = kind && ['rptboth', 'dbl', 'end', 'rptend', 'rptstart'].includes(kind) ? kind : 'single'
  let metrics = barMetrics.get(key)
  if (!metrics) { metrics = createBarMetrics(key); barMetrics.set(key, metrics) }
  return metrics
}

type HorizontalItem = { measure: NativeMeasure; navigationMeasure?: NativeMeasure; column?: NativeColumn; controlColumn?: NativeColumn; controls?: NativeControl[]; boundary?: boolean; opening?: boolean; prefix?: boolean; left: number; right: number; cells: SpacingCell[]; fixedAfter?: number }
type HorizontalOptions = { minimumNoteGap?: number; minimumNoteGapFloor?: number; equalMeasures?: boolean }
const zeroDurationGap = (options: HorizontalOptions) => (options.minimumNoteGap ?? nativeStyle.minimumNoteGap) * nativeStyle.zeroDurationGapRatio
// A sustain dash keeps its musical duration and identity, but spaces as an eighth.
const spacingDuration = (glyph?: NativeGlyph) => glyph?.multiRest ? 1 : glyph?.sustain ? .5 : glyph?.beats
const horizontalContexts=new WeakMap<HorizontalOptions,WeakMap<NativeMeasure[],HorizontalItem[]>>()
type ColumnBinding = { measure: number; column: number }
type ControlBinding = ColumnBinding & { glyph: number; control: number }
type ItemBinding = { measure: number; navigationMeasure?: number; column?: ColumnBinding; controlColumn?: ColumnBinding; controls?: ControlBinding[] }
type HorizontalTemplate = { measures: NativeMeasure[]; items: HorizontalItem[]; bindings?: ItemBinding[] }
export type NativeHorizontalTemplates = Map<string, HorizontalTemplate>
const horizontalTemplates=new WeakMap<HorizontalOptions,NativeHorizontalTemplates>()
const horizontalSolutions=new WeakMap<HorizontalItem[],Map<string,ReturnType<typeof solveScoreMinimumSpacing>>>()
const equalPositions=new WeakMap<HorizontalItem[],Map<number,number[]>>()
const equalSlices=new WeakMap<HorizontalItem[],HorizontalItem[][]>()
/** Opt-in for one immutable projection/trial. Placing x/y does not change the
 * constraint chain; another trial receives another context and fresh objects. */
export function cacheNativeHorizontal(options:HorizontalOptions,templates?:NativeHorizontalTemplates){
  horizontalContexts.set(options,new WeakMap())
  if(templates)horizontalTemplates.set(options,templates)
}
const solveScoreSpacing:typeof solveScoreMinimumSpacing=(columns,width,justify,edges)=>{
  const cache=horizontalSolutions.get(columns as HorizontalItem[])
  if(!cache)return solveScoreMinimumSpacing(columns,width,justify,edges)
  const key=`${width}:${justify}:${JSON.stringify(edges)}`
  let solution=cache.get(key)
  if(!solution){solution=solveScoreMinimumSpacing(columns,width,justify,edges);cache.set(key,solution)}
  return solution
}

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
    else if ((closing === 'single' || closing === 'dbl') && !(measure.source.repeatCount && measure.source.repeatCount > 2)) closing = undefined
  }
  return { opening, closing }
}
const minimumCell = (lane: string, left: number, right: number, duration: number, alpha: number, gapScale: number): SpacingCell => {
  const durationScale = scoreRhythmicWeight(duration > 0 ? duration : 1)
  // Rhythm alone determines stretch; ink and lyrics only constrain minima.
  // Zero-time controls have a neutral weight, as do quarter-clearance bars.
  const stretch = duration > 0 ? durationScale : 1
  return { lane, left, right, before: durationScale * alpha * gapScale, after: durationScale * alpha * gapScale,
    beforeStretch: stretch, afterStretch: stretch,
  }
}

/** Build one shared horizontal constraint chain, including zero-time bars. */
function itemsFor(measures: NativeMeasure[], options: HorizontalOptions, surrounding = measures, readOnly = false): HorizontalItem[] {
  const cache=surrounding===measures ? horizontalContexts.get(options) : undefined
  const cached=cache?.get(measures)
  if(cached)return cached
  // The immutable constraint cells depend on music and the gap tier, not on
  // page width. Rebind only the placement targets for this private projection.
  const templates=cache && measures.every(measure=>!measure.continuation && measure.lastFragment) ? horizontalTemplates.get(options) : undefined
  const templateKey=templates ? measures.map(measure=>measure.id).join(':') : undefined
  const template=templateKey===undefined ? undefined : templates?.get(templateKey)
  if(template && readOnly)return template.items
  if(template) {
    if(!template.bindings) {
      const measureMap=new Map(template.measures.map((measure,index)=>[measure,index]))
      const columnMap=new Map<NativeColumn,ColumnBinding>(),controlMap=new Map<NativeControl,ControlBinding>()
      template.measures.forEach((measure,index)=>measure.columns.forEach((column,at)=>{
        columnMap.set(column,{measure:index,column:at})
        column.glyphs.forEach((glyph,i)=>glyph.controls.forEach((control,j)=>controlMap.set(control,{measure:index,column:at,glyph:i,control:j})))
      }))
      template.bindings=template.items.map(item=>({measure:measureMap.get(item.measure)!,
        navigationMeasure:item.navigationMeasure && measureMap.get(item.navigationMeasure),
        column:item.column && columnMap.get(item.column),controlColumn:item.controlColumn && columnMap.get(item.controlColumn),
        controls:item.controls?.map(control=>controlMap.get(control)!)}))
    }
    const columnFor=(binding:ColumnBinding|undefined)=>binding && measures[binding.measure]!.columns[binding.column]
    const items=template.items.map((item,index)=>{
      const binding=template.bindings![index]!
      return {measure:measures[binding.measure]!,
        navigationMeasure:binding.navigationMeasure===undefined ? undefined : measures[binding.navigationMeasure],
        column:columnFor(binding.column),controlColumn:columnFor(binding.controlColumn),
        controls:binding.controls?.map(control=>measures[control.measure]!.columns[control.column]!.glyphs[control.glyph]!.controls[control.control]!),
        boundary:item.boundary,opening:item.opening,prefix:item.prefix,left:item.left,right:item.right,cells:item.cells,fixedAfter:item.fixedAfter}
    })
    cache!.set(measures,items)
    horizontalSolutions.set(items,horizontalSolutions.get(template.items)!)
    equalPositions.set(items,equalPositions.get(template.items)!)
    equalSlices.set(items,equalSlices.get(template.items)!)
    return items
  }
  const scale = (options.minimumNoteGap ?? nativeStyle.minimumNoteGap) / (nativeStyle.music * .5)
  const items: HorizontalItem[] = []
  const laneSet = new Set<string>()
  for (const measure of measures) for (const column of measure.columns) for (const glyph of column.glyphs) laneSet.add(glyph.lane)
  const lanes = [...laneSet]
  if (measures[0] && lanes.includes('bass')) items.push({ measure: measures[0], prefix: true, left: 0, right: nativeStyle.music,
    cells: lanes.map(lane => minimumCell(lane, 0, nativeStyle.music, 0, 0.45, scale)) })
  const bar = (measure: NativeMeasure, kind: string | undefined, opening = false) => {
    const geometry = nativeBarMetrics(kind)
    const index = surrounding.indexOf(measure), previous = surrounding[index - 1]
    // Exit text stays before the shared repeat boundary, owned by its source measure.
    const navigationMeasure = opening
      ? previous && nativeMeasureBars(surrounding, index - 1).closing === undefined ? previous : undefined
      : measure
    const prefix = navigationMeasure?.navigation?.reduce((sum, mark) => sum + mark.width + zeroDurationGap(options), 0) ?? 0
    const laneSet = new Set<string>()
    for (const column of measure.columns) for (const glyph of column.glyphs) laneSet.add(glyph.lane)
    const lanes = [...laneSet]
    items.push({ measure, navigationMeasure, opening, boundary: true, left: geometry.anchor + prefix, right: geometry.width - geometry.anchor,
      // A bar has no musical duration; only its clearance matches a quarter note.
      cells: lanes.map(lane => minimumCell(lane, geometry.anchor + prefix, geometry.width - geometry.anchor, 1, (nativeStyle.music * .25), scale)) })
  }
  for (const measure of measures) {
    const marks = nativeMeasureBars(surrounding, surrounding.indexOf(measure))
    const firstColumn = measure.columns[0]
    const controls = (column: NativeColumn, members: { control: NativeControl; lane: string }[]) => {
      if (!members.length) return
      // Inline controls share the zero-duration clearance and stretch weight.
      const cells = members.map(({ control, lane }) => minimumCell(lane, control.anchor, control.width - control.anchor,
        control.kind === 'segno' || control.kind === 'coda' ? 1 : 0, (nativeStyle.music * .25), scale))
      items.push({ measure, controlColumn: column, controls: members.map(member => member.control), left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A section heading introduces the repeat, rather than belonging inside it.
    // Its exterior clearance must be measured in the same order as it is painted.
    if (firstColumn?.glyphs.some(glyph => glyph.controls.some(control => control.kind === 'section')))
      controls(firstColumn, firstColumn.glyphs.flatMap(glyph => glyph.controls.filter(control => control.kind === 'section').map(control => ({control, lane: glyph.lane}))))
    if (marks.opening) bar(measure, 'rptstart', true)
    for (const column of measure.columns) {
      if (column.glyphs.some(glyph => glyph.controls.length)) {
      const membersByLane = column.glyphs.map(glyph => ({ lane: glyph.lane, controls: glyph.controls.filter(control => column !== firstColumn || control.kind !== 'section') }))
      for (let index = 0; index < Math.max(...membersByLane.map(member => member.controls.length)); index++) {
        controls(column, membersByLane.flatMap(member => member.controls[index] ? [{control: member.controls[index]!, lane: member.lane}] : []))
      }
      }
      const cells = column.glyphs.map(glyph => minimumCell(glyph.lane, glyph.musicLeft ?? glyph.left,
        glyph.musicRight ?? glyph.right, spacingDuration(glyph)!, nativeStyle.music * .25, scale))
      items.push({ measure, column, left: Math.max(...cells.map(cell => cell.left)), right: Math.max(...cells.map(cell => cell.right)), cells })
    }
    // A split measure has no visible closing bar until its final fragment.
    if (marks.closing !== undefined) bar(measure, marks.closing)
  }
  // Adjacency belongs to a voice. Finer notes or controls in another voice
  // do not interrupt its beam or sustain; its own controls and bars still do.
  const previousByLane = new Map<string, { item: HorizontalItem; cell: SpacingCell }>()
  for (const item of items) for (const cell of item.cells) {
    const previous = previousByLane.get(cell.lane)
    const left = previous?.item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    const right = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    // A displayed sustain dash continues the preceding sound, including a
    // fractional tied head. Dash springs use eighth-note spacing durations.
    // The measure identity and intervening control items keep bars/settings out.
    const sustain = left && right?.sustain && !right.controls.length
      && Math.abs(left.time + left.beats - right.time) < 1e-7
    if (previous) {
      const grouped = previous.item.measure === item.measure && left && right
        && (sustain || nativeBeamCount(left, right))
      const weight = previous.item.boundary || item.boundary || previous.item.controls || item.controls ? nativeStyle.zeroDurationGapRatio
        : scoreRhythmicGapWeight(spacingDuration(left), spacingDuration(right),
          grouped ? nativeStyle.groupSpacingRatio : 1, .5)
      const halfGap = (options.minimumNoteGap ?? nativeStyle.minimumNoteGap) * weight / 2
      previous.cell.after = halfGap; cell.before = halfGap
      previous.cell.afterStretch = weight; cell.beforeStretch = weight
    }
    previousByLane.set(cell.lane, { item, cell })
  }
  // Hard ink reservations and natural spring clearances are measured separately.
  // Exterior ink stays flush with the line.
  for (const [index, item] of items.entries()) for (const cell of item.cells) {
    const glyph = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    const floor = glyph ? (options.minimumNoteGapFloor ?? 0) / 2 : 0
    cell.before = Math.max(cell.before, floor); cell.after = Math.max(cell.after, floor)
    const left = index === 0 ? 0 : Math.max(cell.before, floor)
    const right = index === items.length - 1 ? 0 : Math.max(cell.after, floor)
    cell.left += left; cell.right += right; cell.before = cell.after = 0
    // Note clearance and lyric ink share physical space; do not add both widths.
    if (glyph) {
      // An absent voice gets music-only minimum clearance. Lyrics and
      // parentheses belong to their real voice, not its neighbours' blanks.
      cell.placeholderLeft = cell.left; cell.placeholderRight = cell.right
      const enclosureGap = (options.minimumNoteGap ?? nativeStyle.minimumNoteGap) - (glyph.parenthesisGap ?? nativeStyle.minimumNoteGap)
      const insets = { left: glyph.parenthesisLeft ? glyph.parenthesisLeft + enclosureGap : 0,
        right: glyph.parenthesisRight ? glyph.parenthesisRight + enclosureGap : 0 }
      // Parentheses enclose the painted host, including beam stroke caps.
      // Reserve that same extent at the actual passage endpoints.
      if (insets?.left) cell.left = Math.max(cell.left, (glyph.inkLeft ?? 0) + left)
      if (insets?.right) cell.right = Math.max(cell.right, (glyph.inkRight ?? 0) + right)
      cell.left += insets?.left ?? 0; cell.right += insets?.right ?? 0
    }
  }
  // Lyrics collide with other lyrics in the same visual tier, independently
  // of bars, rests and controls in the music above them. Empty slots add no ink.
  for (const item of items) for (const glyph of item.column?.glyphs ?? []) {
    for (const [tier, ink] of (glyph.lyricTiers ?? []).entries()) {
      if (!ink) continue
      item.cells.push({ lane: `${glyph.lane}:lyric:${tier}`, sparse: true,
        left: ink.left, right: ink.right, before: 0, after: 0, beforeStretch: 0, afterStretch: 0 })
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
  // A Segno immediately after a bar stays attached to that boundary instead
  // of absorbing justification surplus. Retain both symbols' minimum margins.
  for (const [index, item] of items.entries()) {
    const next = items[index + 1]
    if (!item.boundary || !next?.controls?.some(control => control.kind === 'segno')) continue
    item.fixedAfter = Math.max(...lanes.map(lane => {
      const left = item.cells.find(cell => cell.lane === lane), right = next.cells.find(cell => cell.lane === lane)
      return (left?.right ?? 0) + (right?.left ?? 0)
    }))
  }
  // Inline section frames keep a rigid clearance to the next visible symbol.
  // Collapse this edge for both minimum-width measurement and justification.
  for (const [index, item] of items.entries()) {
    if (!item.controls?.some(control => control.kind === 'section')) continue
    const next = items[index + 1]
    if (!next) continue
    const left = next.controls ? Math.max(...next.controls.map(control =>
      control.anchor - (control.ink.length ? Math.min(...control.ink.map(ink => ink.left)) : 0)))
      : next.column ? Math.max(...next.column.glyphs.map(glyph => glyph.inkLeft ?? glyph.musicLeft ?? glyph.left)) : next.left
    item.fixedAfter = item.right + nativeStyle.inlineSectionGap + left
  }
  if(cache){cache.set(measures,items);horizontalSolutions.set(items,new Map());equalPositions.set(items,new Map());equalSlices.set(items,[]);cacheScoreMinimumSpacing(items)}
  if(templateKey!==undefined)templates!.set(templateKey,{measures,items})
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
  const result = solveScoreSpacing(items)
  const natural = result
  type Selection = { item: HorizontalItem; index: number }
  const byMeasure = new Map<NativeMeasure, Selection[]>()
  const byColumn = new Map<NativeColumn, Selection[]>()
  for (const [index, item] of items.entries()) {
    const selection = { item, index }
    const selected = byMeasure.get(item.measure)
    if (selected) selected.push(selection)
    else byMeasure.set(item.measure, [selection])
    for (const column of item.controlColumn && item.controlColumn !== item.column ? [item.column, item.controlColumn] : [item.column ?? item.controlColumn]) {
      if (!column) continue
      const owned = byColumn.get(column)
      if (owned) owned.push(selection)
      else byColumn.set(column, [selection])
    }
  }
  for (const measure of measures) {
    const selected = byMeasure.get(measure) ?? []
    const first = selected[0], last = selected.at(-1)
    if (!first || !last) continue
    const left = result.positions[first.index]! - Math.max(...first.item.cells.map(cell => cell.left))
    const right = result.positions[last.index]! + Math.max(...last.item.cells.map(cell => cell.right))
    measure.naturalStart = natural.positions[first.index]! - Math.max(...first.item.cells.map(cell => cell.left))
    measure.naturalEnd = natural.positions[last.index]! + Math.max(...last.item.cells.map(cell => cell.right))
    measure.minimumStart = left; measure.minimumEnd = right; measure.minimum = right - left
    measure.columns.forEach((column, index) => {
      const owned = byColumn.get(column) ?? []
      column.naturalStart = index === 0 ? measure.naturalStart! : Math.min(...owned.map(({ item, index }) => natural.positions[index]! - Math.max(...item.cells.map(cell => cell.left))))
      column.naturalEnd = index === measure.columns.length - 1 ? measure.naturalEnd! : Math.max(...owned.map(({ item, index }) => natural.positions[index]! + Math.max(...item.cells.map(cell => cell.right))))
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
  const cache = equalPositions.get(items), saved = cache?.get(width)
  if (saved) return saved
  const ranges = equalMeasureRanges(items)
  if (ranges.length < 2) return solveScoreSpacing(items,width,true).positions
  const leftOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.left))
  const rightOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.right))
  const tail = ranges.at(-1)!.bar
  const cellWidth = (width - (tail === undefined ? 0 : rightOf(tail))) / ranges.length
  const positions = Array<number>(items.length).fill(0)
  for (const [index, range] of ranges.entries()) {
    const previous = ranges[index-1]?.bar
    const left = index*cellWidth + (previous === undefined ? 0 : rightOf(previous))
    const right = (index+1)*cellWidth - (range.bar === undefined ? 0 : leftOf(range.bar))
    const solved = solveScoreSpacing(equalMeasureSlice(items, index, range),Math.max(1,right-left),true,
      { left: previous !== undefined && items[previous]!.fixedAfter === undefined,
        right: range.bar !== undefined && items[range.end - 1]?.fixedAfter === undefined })
    solved.positions.forEach((position,offset) => { positions[range.start+offset] = left+position })
    if (range.bar !== undefined) positions[range.bar] = (index+1)*cellWidth
  }
  cache?.set(width,positions)
  return positions
}

function equalMeasureSlice(items: HorizontalItem[], index: number, range: {start:number;end:number}) {
  const slices = equalSlices.get(items)
  if (!slices) return items.slice(range.start,range.end)
  let slice = slices[index]
  if (!slice) {
    slice = items.slice(range.start,range.end); slices[index] = slice
    horizontalSolutions.set(slice,new Map());cacheScoreMinimumSpacing(slice)
  }
  return slice
}

export type NativeHorizontalSpacing = {
  minimumWidth: number; stretchWeight: number
  equalCells?: { count: number; tailRight: number }
}

/** Full-width, music-only clearance per rhythmic unit. Does not mutate placement
 * or subtract either tier's reserved minimum; short endings are scored full. */
export function nativeUnitRhythmicGap(measures: NativeMeasure[], options: HorizontalOptions, width: number): number | undefined {
  return nativeRhythmicSpacing(measures, options, width).gap
}

export function nativeRhythmicSpacing(measures: NativeMeasure[], options: HorizontalOptions, width: number): { gap?: number; gaps: readonly number[] } {
  const items = itemsFor(measures, options, measures, true)
  const positions = options.equalMeasures ? equalMeasurePositions(items, width) : solveScoreSpacing(items, width, true).positions
  const analysis = rhythmicGapIntervals(items)
  const measured = measureScoreRhythmicIntervals(positions, analysis.intervals)
  return { gap: measured.gap, gaps: measured.gaps }
}

type RhythmicGapIntervals={weight:number;intervals:{start:number;end:number;left:number;right:number;weight:number}[]}
const rhythmicIntervals=new WeakMap<HorizontalItem[],RhythmicGapIntervals>()
function rhythmicGapIntervals(items:HorizontalItem[]):RhythmicGapIntervals {
  const cached=rhythmicIntervals.get(items)
  if(cached)return cached
  const previous = new Map<string, { index: number; right: number; weight: number }>()
  const intervals:RhythmicGapIntervals['intervals']=[]
  let weight = 0
  for (const [index, item] of items.entries()) for (const cell of item.cells) {
    if (cell.sparse) continue
    if (!item.column && !item.boundary && !item.controls) { previous.delete(cell.lane); continue }
    const glyph = item.column?.glyphs.find(glyph => glyph.lane === cell.lane)
    const left = glyph ? glyph.musicLeft ?? glyph.left : item.left
    const right = glyph ? glyph.musicRight ?? glyph.right : item.right
    const before = previous.get(cell.lane)
    if (before && items[before.index]!.fixedAfter === undefined) {
      const units = (before.weight + (cell.beforeStretch ?? 1)) / 2
      if (units > 0) {
        intervals.push({start:before.index,end:index,left,right:before.right,weight:units})
        weight += units
      }
    }
    previous.set(cell.lane, { index, right, weight: cell.afterStretch ?? 1 })
  }
  const result={intervals,weight}
  if(horizontalSolutions.has(items))rhythmicIntervals.set(items,result)
  return result
}

/** Measure the exact chain used for placement, including rigid groups, voice
 * placeholders, lyrics and visible boundary ink. Shared by row planning and placement. */
export function nativeHorizontalSpacing(measures: NativeMeasure[], options: HorizontalOptions): NativeHorizontalSpacing {
  const items = itemsFor(measures, options, measures, true), solved = solveScoreSpacing(items)
  if (!options.equalMeasures) return solved
  const ranges = equalMeasureRanges(items)
  if (!ranges.length) return solved
  const leftOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.left))
  const rightOf = (index: number) => Math.max(...items[index]!.cells.map(cell => cell.right))
  const tail = ranges.at(-1)!.bar, tailRight = tail === undefined ? 0 : rightOf(tail)
  const cellWidths = ranges.map((range, index) => {
    const previous = ranges[index - 1]?.bar
    const outside = (previous === undefined ? 0 : rightOf(previous))
      + (range.bar === undefined ? 0 : leftOf(range.bar))
    const cell = solveScoreSpacing(equalMeasureSlice(items, index, range))
    return outside + cell.minimumWidth
  })
  return { minimumWidth: Math.max(...cellWidths) * ranges.length + tailRight,
    stretchWeight: solved.stretchWeight, equalCells: { count: ranges.length, tailRight } }
}

/** Trial the preceding row's spacing, then choose section-ending justification. */
export function nativeLastLineWidth(current: NativeHorizontalSpacing, width: number, previous: NativeHorizontalSpacing, previousWidth: number, rhythmicGaps?: { current: number; reference: number }) {
  // Compare final physical spacing, independently of the selected minimum tier.
  // A compact preceding row must not make a normal-sized ending look short.
  if (!current.equalCells && rhythmicGaps && rhythmicGaps.reference > 0
    && rhythmicGaps.current <= rhythmicGaps.reference * 1.5) return Math.max(current.minimumWidth, width)
  let inherited: number
  if (current.equalCells && previous.equalCells) {
    const cellWidth = Math.max(0, previousWidth - previous.equalCells.tailRight) / previous.equalCells.count
    inherited = Math.max(current.minimumWidth, cellWidth * current.equalCells.count + current.equalCells.tailRight)
  } else {
    const extra = previous.stretchWeight > 0 ? Math.max(0, previousWidth - previous.minimumWidth) / previous.stretchWeight : 0
    inherited = current.minimumWidth + extra * current.stretchWeight
  }
  return lastLineWidth(current.minimumWidth, inherited, width,
    current.equalCells && previous.equalCells ? current.equalCells.tailRight : current.minimumWidth)
}

/** Justify a complete system, then publish event and measure positions. */
export function placeNativeHorizontal(measures: NativeMeasure[], options: HorizontalOptions, x: number, width: number, surrounding = measures): NativeGlyph[] {
  const items = itemsFor(measures, options, surrounding)
  const positions = options.equalMeasures ? equalMeasurePositions(items,width) : solveScoreSpacing(items,width,true).positions
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
    else {
      if (item.opening) item.measure.openingBarX = position
      else item.measure.barX = position
      if (item.navigationMeasure) item.navigationMeasure.barX = position
      let cursor = position - item.left
      for (const mark of item.navigationMeasure?.navigation ?? []) { mark.x = cursor; cursor += mark.width + zeroDurationGap(options) }
    }
  })
  return glyphs
}

/** Bounds need music coordinates only. Reuse the immutable constraint chain
 * without rebinding controls, navigation or bar placement to a cloned row. */
export function placeNativeCoreHorizontal(measures:NativeMeasure[],options:HorizontalOptions,width:number) {
  if(measures.some(measure=>measure.continuation || !measure.lastFragment)) {
    placeNativeHorizontal(measures,options,0,width)
    return
  }
  const items=itemsFor(measures,options,measures,true)
  const positions=options.equalMeasures ? equalMeasurePositions(items,width) : solveScoreSpacing(items,width,true).positions
  const targets=new Map(measures.map(measure=>[measure.id,measure]))
  for(let index=0;index<items.length;index++) {
    const item=items[index]!
    if(!item.column)continue
    const target=targets.get(item.measure.id)!
    const column=target===item.measure ? item.column : target.columns[item.measure.columns.indexOf(item.column)]!
    column.x=positions[index]!
    for(const glyph of column.glyphs)glyph.x=positions[index]!
  }
}
