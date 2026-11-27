import { nativeEndingReferences } from './native-ending-reference.js'
import { cacheNativeArcObstacles, releaseNativeArcObstacles } from './native-arc.js'
import { intersectNativeRowBounds } from './native-row-bound.js'
import { planNativeLinesWithRefinedPages, measureNativeGreedyPageCeiling } from './native-refined-page-breaking.js'
import { captureNativeRowHorizontal, restoreNativeRowHorizontal, type NativeRowHorizontal, captureNativeRow, restoreNativeRow, restoreNativeRowRelations, type NativeRowSnapshot } from './native-row-cache.js'
import { nativeRowGeometry, nativeRowCoreLowerBound } from './native-row-geometry.js'
import { scoreLyricGapScale, scoreMaximumCoreGap } from './score-layout-policy.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { scoreNumberedFontCost } from './layout-quality.js'
import { nativeLayoutQuality } from './native-quality.js'
import { hasPassKeys } from '@m3n/notation'
import { A4_CONTENT_ASPECT_RATIO } from '@m3n/notation'
import { keyedDisplayPerformance } from './display-performance.js'
import { nativeBarInk, nativeLaneBarPositions } from './native-bars.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { isNativeMeasureNumber, placeNativeNavigation, placeNativeBarLabels } from './native-system-labels.js'
import { placeNativeVoltas } from './native-volta-layout.js'
import { cacheNativeLyricHeights, releaseNativeLyricHeights, type NativeLyricHeightCache, placeNativeLyrics } from './native-lyrics.js'
import { cacheNativeHairpins, releaseNativeHairpins, nativeHairpinSegments } from './native-hairpin.js'
import { cacheNativeTuplets, releaseNativeTuplets } from './native-tuplet.js'
import { placeNativeRelation, type NativeRelationLayout } from './native-relations.js'
import { nativeMarkStack, nativeInnerMark, nativeMarkRank, nativeMarkInk } from './native-marks.js'
import { nativeSvgPieces } from './native-ink.js'
import { placeNativeAnnotations, nativeRegionTop, type NativeRegion } from './native-annotations.js'
import { type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import { paginateNativeBlocks, prepareNativePagination, type NativePageBlock } from './native-pagination.js'
import { nativeHeaderGeometry, type NativeHeaderPreparation } from './native-header.js'
import { splitNativeMeasure } from './native-wrapping.js'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
import { greedyNativeLines, planNativeLinesWithinPages } from './native-page-line-breaking.js'
export { wrapNativeText } from './native-header.js'
import { cacheNativeHorizontal, type NativeHorizontalTemplates, measureNativeHorizontal, nativeHorizontalSpacing, nativeUnitRhythmicGap, nativeLastLineWidth, placeNativeHorizontal } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, NumberedTextMeasurementCache, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, cloneNativeProjection, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'
import { placeNativeLanes, nativeLanePieces } from './native-lanes.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSystemCore } from './native-core.js'
import { nativeCorePageLowerBound } from './native-height-feasibility.js'

export type NativeRenderOptions = {
  systemCjk?: boolean
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  textMeasurementCache?: NumberedTextMeasurementCache
  layoutTask?: NativeLayoutTask
  pageMargin?: number; coreGap?: number
  /** Experimental measured-page ceiling; off until its interactive cost is acceptable. */
  pageConstrainedBreaks?: boolean
  numericLayout?: boolean
  /** Allows uncached parity measurements of the experimental solver. */
  cachePageLineGeometry?: boolean
  minimumNoteGap?: number; minimumNoteGapFloor?: number
  equalMeasures?: boolean; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { horizontalDensity?: number; unitRhythmicGap?: number; coreGap?: number; index: number; numericGeometry?: boolean; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; arcContinuationLeft?: number; decorationLayout?: { lane: string; svg: string; hidden?: boolean; measureNumber?: boolean }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
export type NativePage = { coreGap?: number; header?: string; index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; headerDocument: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
  pagination: ReturnType<typeof prepareNativePagination>; verticalBlocks: NativePageBlock[]; headerBlocks: { height: number; svg: string }[]
}

function validate(options: NativeRenderOptions) {
  if (options.transpose !== undefined && !Number.isInteger(options.transpose)) throw new Error('谱面移调必须为整数半音数。')
  if (options.tempoScale !== undefined && (!Number.isFinite(options.tempoScale) || options.tempoScale <= 0)) throw new Error('显示速度倍率必须为正有限数值。')
  if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
  for (const value of [options.pageMargin, options.coreGap]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('简谱页边距和行距必须为非负有限数值。')
  if (options.minimumNoteGap !== undefined && (!Number.isFinite(options.minimumNoteGap) || options.minimumNoteGap < 0)) throw new Error('最小音符间距必须为非负有限数值。')
  if (options.wrapWidthRatio !== undefined && (!Number.isFinite(options.wrapWidthRatio) || options.wrapWidthRatio <= 0 || options.wrapWidthRatio > 1)) throw new Error('wrapWidthRatio 必须大于 0 且不大于 1。')
}

function relationsFor(document: ScoreDocument, projection: NativeProjection): NativeRelation[] {
  const byEvent = new Map<ScoreEvent, NativeGlyph[]>()
  for (const glyph of projection.glyphs) if (glyph.event) {
    const members = byEvent.get(glyph.event)
    if (members) members.push(glyph)
    else byEvent.set(glyph.event, [glyph])
  }
  const relations: NativeRelation[] = []
  const head = new Map<ScoreEvent, NativeGlyph>()
  for (const part of document.parts.values()) for (const staff of ['melody', 'bass'] as const) {
    let previous: ScoreEvent | undefined
    for (const measure of part[staff]) for (const event of measure.events) {
      const glyphs = byEvent.get(event)
      if (!glyphs?.length) continue
      const first = glyphs[0]!, pitched = [...glyphs].reverse().find(glyph => !glyph.sustain && glyph.pitches.some(pitch => pitch.degree !== '0')) ?? first
      const origin = first.sustain && previous ? head.get(previous) ?? first : event.kind === 'tuplet' ? pitched : first
      head.set(event, origin)
      if (previous?.tie && !first.sustain) {
        const start = head.get(previous)
        if (start) relations.push({ kind: 'tie', first: start, last: first, level: 0 })
      }
      previous = event
      for (const slot of event.tupletTies ?? []) {
        const start = glyphs[slot], end = glyphs[slot + 1]
        if (start && end) relations.push({ kind: 'tie', first: start, last: end, level: 0 })
      }
      for (const [from, to] of event.tupletSlurs ?? []) {
        const start = glyphs[from], end = glyphs[to]
        if (start && end) relations.push({ kind: 'slur', first: start, last: end, level: 0 })
      }
      if (event.kind === 'tuplet') relations.push({ kind: 'tuplet', first, last: glyphs.at(-1)!, label: event.tuplet && event.tuplet.numbase !== 2 ** Math.floor(Math.log2(event.tuplet.num))
        ? `${event.tuplet.num}:${event.tuplet.numbase}` : String(event.tuplet?.num ?? glyphs.length), level: 0 })
    }
  }
  const intervals = document.intervals
  for (const interval of intervals) {
    if (interval.start === undefined || interval.endStart === undefined) continue
    // Octave scopes are already resolved into each pitch's dots. A second
    // ottava line would request the same transposition again.
    if (interval.kind !== 'lg' && interval.kind !== 'cresc' && interval.kind !== 'decres') continue
    if (interval.display === 'text') continue
    const glyphs = projection.glyphs.filter(glyph => glyph.event && glyph.staff === interval.staff && interval.start! <= glyph.event.sourceStart && glyph.event.sourceStart <= interval.endStart!)
    const first = glyphs[0], last = glyphs.at(-1)
    if (!first || !last) continue
    const kind = interval.kind === 'lg' ? 'slur' : interval.kind
    const end = kind === 'slur' ? head.get(last.event!) ?? [...glyphs].reverse().find(glyph => !glyph.sustain && glyph.pitches.some(pitch => pitch.degree !== '0')) ?? last : last
    relations.push({ kind, first, last: end, level: 0 })
  }
  // Adjacent instrumental declarations form one passage, just as their shared
  // horizontal occupancy does. Part and voice boundaries remain independent.
  const instrumentalLanes = new Map<string, NativeGlyph[]>()
  for (const measure of projection.measures) for (const column of measure.columns) for (const glyph of column.glyphs) {
    const key = `${measure.part}:${glyph.lane}`
    const members = instrumentalLanes.get(key) ?? []
    members.push(glyph); instrumentalLanes.set(key, members)
  }
  for (const members of instrumentalLanes.values()) {
    let first: NativeGlyph | undefined, last: NativeGlyph | undefined
    const flush = () => { if (first && last) relations.push({ kind: 'inst', first, last, level: 0 }); first = last = undefined }
    for (const glyph of members) {
      if (!glyph.instrumental) { flush(); continue }
      first ??= glyph; last = glyph
    }
    flush()
  }
  // Reserve enclosure ink only at passage endpoints, independent of wrapping.
  reserveInstrumentalEndpoints(relations, projection)
  // Ties attach directly to their notes, including outgoing tuplet ties.
  // Tuplets and slurs nest by musical span, not a fixed symbol-type order.
  // Expression hairpins remain outside; wrapping preserves the global order.
  const order = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
  const layer = (relation: NativeRelation) => relation.kind === 'tie' ? 0
    : relation.kind === 'cresc' || relation.kind === 'decres' ? 2 : 1
  relations.sort((a, b) => layer(a) - layer(b)
    || (order.get(a.last)! - order.get(a.first)!) - (order.get(b.last)! - order.get(b.first)!))
  for (const [index, relation] of relations.entries()) {
    if (relation.kind === 'inst') continue
    const start = order.get(relation.first)!, end = order.get(relation.last)!
    relation.level = Math.max(-1, ...relations.slice(0, index).filter(other => other.kind !== 'inst' && other.first.lane === relation.first.lane && order.get(other.first)! < end && order.get(other.last)! > start).map(other => other.level)) + 1
  }
  return relations
}

function reserveInstrumentalEndpoints(relations: NativeRelation[], projection: NativeProjection): void {
  const starts = new Set<NativeGlyph>(), ends = new Set<NativeGlyph>()
  for (const relation of relations) if (relation.kind === 'inst') { starts.add(relation.first); ends.add(relation.last) }
  for (const glyph of projection.glyphs) if (glyph.instrumental) {
    if (!starts.has(glyph)) glyph.parenthesisLeft = 0
    if (!ends.has(glyph)) glyph.parenthesisRight = 0
  }
}

function startsNativeSection(current: NativeMeasure, previous?: NativeMeasure): boolean {
  return !previous || current.part !== previous.part
    || !current.continuation && current.source.events.some(event => event.sectionLabel)
}

/** Split fragments retain the source measure id, but own different glyphs. */
function nativeRowIdentity(measures:readonly NativeMeasure[]):string {
  return measures.map(measure=>!measure.continuation && measure.lastFragment ? measure.id
    : `${measure.id}[${measure.columns.map(column=>column.glyphs.map(glyph=>glyph.id).join(',')).join(';')}]`).join(':')
}

/** Break complete measures first, splitting oversized measures at time columns. */
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions, leading: (measures: NativeMeasure[]) => number = () => 0, timings?: Record<string, number>, rowMinimums?: Map<string, number>, endsOverride?: readonly number[], graphCache?: Map<string, NativeLineCandidate[][]>): { lines: { measures: NativeMeasure[]; density: number }[]; ends: number[]; candidates: NativeLineCandidate[][] } {
  const graphStarted = timings ? performance.now() : 0
  const fragments = measures.flatMap(measure => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1)))
  const ratio = options.wrapWidthRatio ?? 1
  const graphKey = `${width}:${ratio}`
  const cacheableGraph = fragments.length === measures.length && fragments.every((fragment,index) => fragment === measures[index])
  const cachedGraph = cacheableGraph ? graphCache?.get(graphKey) : undefined
  const candidates: NativeLineCandidate[][] = cachedGraph ?? Array.from({ length: fragments.length }, () => [])
  for (let begin = 0; !cachedGraph && begin < fragments.length;) {
    let end = begin + 1
    while (end < fragments.length && !fragments[end]!.breakBefore && !fragments[end - 1]!.breakAfter) end++
    const group = fragments.slice(begin, end)
    // Unsplit row geometry is independent of page width. Split fragments depend
    // on the current capacity and deliberately bypass this immutable cache.
    const cacheable = rowMinimums && group.every(measure => !measure.continuation && measure.lastFragment)
    const availableFor = (start: number) => Math.max(1, width * ratio - leading([group[start]!]))
    for (let index = group.length - 1; index >= 0; index--) {
      const available = availableFor(index)
      for (let stop = index; stop < group.length; stop++) {
        const count = stop - index + 1
        // Use the same isolated constraint chain as rendering. Prefix differences
        // retain exterior margins and can incorrectly reject a legal extra bar.
        const key = cacheable ? `${group[index]!.id}:${group[stop]!.id}` : undefined
        let minWidth = key === undefined ? undefined : rowMinimums!.get(key)
        if (minWidth === undefined) {
          minWidth = nativeHorizontalSpacing(group.slice(index, stop + 1), options).minimumWidth
          if (key !== undefined) rowMinimums!.set(key, minWidth)
          if (timings) timings.lineMinimumBuilds = (timings.lineMinimumBuilds ?? 0) + 1
        } else if (timings) timings.lineMinimumCacheHits = (timings.lineMinimumCacheHits ?? 0) + 1
        if (minWidth > available && count > 1) break
        // Every row, including the final one, is scored at full width.
        candidates[begin + index]!.push({ end: begin + stop + 1, density: minWidth / available })
      }
    }
    begin = end
  }
  if (cacheableGraph && !cachedGraph) graphCache?.set(graphKey, candidates)
  if (timings) {
    timings.lineCandidateMs = (timings.lineCandidateMs ?? 0) + performance.now() - graphStarted
    timings.lineCandidateCount = (timings.lineCandidateCount ?? 0) + candidates.reduce((sum, list) => sum + list.length, 0)
  }
  const planningStarted = timings ? performance.now() : 0
  const lines: { measures: NativeMeasure[]; density: number }[] = []
  let start = 0
  const ends = endsOverride ? [...endsOverride] : planNativeLines(candidates, timings)
  for (const end of ends) {
    lines.push({ measures: fragments.slice(start, end), density: candidates[start]!.find(row => row.end === end)!.density }); start = end
  }
  if (timings) timings.linePlanningMs = (timings.linePlanningMs ?? 0) + performance.now() - planningStarted
  return { lines, ends, candidates }
}

type NativeRelationPlan = Array<Omit<NativeRelation, 'first' | 'last'> & { first: number; last: number }>
type HorizontalMinima = Array<Pick<NativeMeasure, 'minimum' | 'minimumStart' | 'minimumEnd' | 'naturalStart' | 'naturalEnd'> & {
  columns: Array<{ minimumStart?: number; minimumEnd?: number; naturalStart?: number; naturalEnd?: number }>
}>
type NativeLayoutPreparation = { canvas?:CanvasRenderingContext2D; runtimeMeasurer?:{timings?:Record<string,number>;value:TextMeasurer}; lyricHeights?:NativeLyricHeightCache; projection?: NativeProjection; expanded?: ReturnType<typeof keyedDisplayPerformance>; header: NativeHeaderPreparation; commonHeader?: NativeHeaderPreparation; relations?: NativeRelationPlan
  horizontalTemplates?:Map<string,NativeHorizontalTemplates>; lineGraphs?: Map<string,Map<string,NativeLineCandidate[][]>>; spacings?: Map<string,ReturnType<typeof nativeHorizontalSpacing>>
  arcLeading?:Map<string,number>; fixedCoreBounds?:Map<string,NativePageBlock>; unitGaps?: Map<string,number|undefined>; horizontal?: Map<string, HorizontalMinima>; rowMinimums?: Map<string, Map<string, number>>
}

/** One selection/export task, with immutable score inputs. Only unplaced
 * preparation is shared: every candidate/trial still owns its placement state.
 * A new task starts empty; changes in fonts, measurer or notation settings
 * cannot reuse a previous preparation. */
export class NativeLayoutTask {
  private readonly scores = new WeakMap<ScoreDocument, Map<string, {
    cache: NumberedTextMeasurementCache; revision: number; measurer?: TextMeasurer
    preparation: NativeLayoutPreparation; headers: Map<string, NativeHeaderPreparation>
  }>>()
  preparationFor(document: ScoreDocument, options: NativeRenderOptions, cache: NumberedTextMeasurementCache): NativeLayoutPreparation {
    let variants = this.scores.get(document)
    if (!variants) { variants = new Map(); this.scores.set(document, variants) }
    const key = JSON.stringify([options.systemCjk ?? false, options.fixedDo ?? false, options.transpose ?? 0, options.tempoScale ?? 1, options.includeBass ?? true])
    let entry = variants.get(key)
    if (!entry || entry.cache !== cache || entry.revision !== cache.revision || entry.measurer !== options.textMeasurer) {
      entry = { cache, revision: cache.revision, measurer: options.textMeasurer, preparation: { header: new Map() }, headers: new Map() }
      variants.set(key, entry)
    }
    const headerKey = JSON.stringify([Math.max(nativeStyle.minimumWidth, Math.round(options.width)), options.pageMargin ?? nativeStyle.defaultPageMargin])
    let header = entry.headers.get(headerKey)
    if (!header) { header = new Map(); entry.headers.set(headerKey, header) }
    entry.preparation.header = header
    return entry.preparation
  }
}

export function layoutNativeScore(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, minimumQuality?: number, maximumPageCount?:number): NativeLayout {
  validate(supplied)
  const cache = supplied.textMeasurementCache ?? new NumberedTextMeasurementCache()
  if (cache.synchronizeFonts() && timings) timings.textMeasureCacheResets = (timings.textMeasureCacheResets ?? 0) + 1
  supplied = { ...supplied, textMeasurementCache: cache }
  const taskPreparationStarted = timings ? performance.now() : 0
  const preparation:NativeLayoutPreparation = supplied.layoutTask?.preparationFor(document, supplied, cache) ?? { header: new Map() }
  if (timings) timings.taskPreparationMs = (timings.taskPreparationMs ?? 0) + performance.now() - taskPreparationStarted
  try {
  // Both tiers receive complete horizontal plans; page bounds can skip engraving.
  // Paper use wins before physical spacing cost; continuous and paged modes agree.
  const gaps = supplied.minimumNoteGap === undefined ? nativeStyle.noteGapCandidates : [supplied.minimumNoteGap]
  const trials = gaps.map(minimumNoteGap => ({ minimumNoteGap,
    trial: prepareNativeScoreAtGap(document, { ...supplied, paged: true, coreGap: nativeCoreGap(document), minimumNoteGap }, timings, preparation) }))
  if (supplied.pageConstrainedBreaks !== true && !supplied.numericLayout && minimumQuality !== undefined && trials.every(({ trial }) => trial.score < minimumQuality))
    throw Object.assign(new Error('Width cannot improve the horizontal total cost'), { code: 'M3N_WIDTH_QUALITY_PRUNED' })
  if(supplied.numericLayout && maximumPageCount!==undefined) {
    const fontCannotWin=minimumQuality!==undefined && 1/(1+scoreNumberedFontCost(supplied.width))<minimumQuality
    if(trials.every(({trial})=>trial.pageFloor>maximumPageCount || fontCannotWin && trial.pageFloor>=maximumPageCount))
      throw Object.assign(new Error('Page and font lower bounds cannot improve the winner'),{code:'M3N_WIDTH_QUALITY_PRUNED'})
  }
  trials.sort((a, b) => a.trial.tierCost - b.trial.tierCost || b.minimumNoteGap - a.minimumNoteGap)
  let selected: NativeLayout | undefined, selectedCost = Infinity
  let oversized: { error: Error; minimumNoteGap: number } | undefined
  for (const [trialIndex, { minimumNoteGap, trial }] of trials.entries()) {
    if(selected && trial.pageFloor>selected.pages.length) {
      if(timings)timings.pageFloorTierPrunes=(timings.pageFloorTierPrunes ?? 0)+1
      continue
    }
    let candidate: NativeLayout
    try {
      if (timings) timings.completedLayoutTrials = (timings.completedLayoutTrials ?? 0) + 1
      candidate = !supplied.numericLayout && supplied.pageConstrainedBreaks !== true ? trial.complete()
        : completePageConstrainedTrial(document, { ...supplied, paged: true, coreGap: nativeCoreGap(document), minimumNoteGap }, trial, preparation, timings)
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('单个谱行')) {
        oversized ??= { error, minimumNoteGap }; continue
      }
      throw error
    }
    // Stretch magnitude shapes each tier's DP partition, but final ranking
    // uses actual pages first, then common physical spacing cost.
    const candidateQuality = nativeLayoutQuality(candidate)
    const candidateCost = candidateQuality.spacingCost + candidateQuality.overflowCost
    if (!selected || candidate.pages.length < selected.pages.length
      || candidate.pages.length === selected.pages.length && (candidateCost < selectedCost
        || candidateCost === selectedCost && minimumNoteGap > (selected.options.minimumNoteGap ?? 0))) {
      selected = candidate; selectedCost = candidateCost
    }
    // In legacy mode the sorted, unchanged plans cannot lower cost; one page is the absolute
    // page-count floor, so none can improve this candidate's lexicographic rank.
    if (supplied.pageConstrainedBreaks !== true && !supplied.numericLayout && selected.pages.length === 1) {
      if (timings) timings.pageFloorTierPrunes = (timings.pageFloorTierPrunes ?? 0) + trials.length - trialIndex - 1
      break
    }
  }
  if (!selected) {
    if (!supplied.paged && oversized)
      return layoutNativeScoreAtGap(document, { ...supplied, minimumNoteGap: oversized.minimumNoteGap }, timings, preparation)
    throw oversized?.error ?? new Error('简谱间距候选为空。')
  }
  const repaginationStarted = timings ? performance.now() : 0
  repaginateNativeLayout(selected, supplied.paged, supplied.coreGap)
  if (timings) timings.repaginationMs = (timings.repaginationMs ?? 0) + performance.now() - repaginationStarted
  return selected
  } finally {
    releaseNativeLyricHeights(supplied.textMeasurer ?? preparation.runtimeMeasurer?.value)
  }
}

function layoutNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation): NativeLayout {
  const layout=prepareNativeScoreAtGap(document, supplied, timings, preparation).complete()
  if(supplied.numericLayout)repaginateNativeLayout(layout,supplied.paged,supplied.coreGap)
  return layout
}
type NativePageTrialCache = { horizontal?:Map<string,NativeRowHorizontal>; endingPairs?: Map<string, Map<number, {full: NativePageBlock; inherited: NativePageBlock; lower: NativePageBlock}>>; endingInherited?: Map<string, NativePageBlock>; fullRows?: Map<string, { gap: number; block: NativePageBlock }>; coreBounds?: Map<string, NativePageBlock>; coreRevision?: number; rows?: Map<string, NativeRowSnapshot>; blocks: Map<string, NativePageBlock>; headers?: NativePageBlock[] }
type NativeGapTrial = { readonly pageFloor:number; pageFloorFor?:(ends:readonly number[],headers:readonly NativePageBlock[])=>number; readonly endingReference?: {required?:(at:number)=>boolean;section:(at:number)=>number; gap:(start:number,end:number)=>number|undefined; terminal:(start:number,end:number)=>boolean}; restrictBounds?: (graph: readonly (readonly NativeLineCandidate[])[]) => void; tightenRowBounds?: (cache: NativePageTrialCache, rows?:ReadonlySet<string>) => void; coreLowerBound?: (start: number, end: number, cache?: NativePageTrialCache, previousStart?: number, reference?: number) => NativePageBlock;  score: number; tierCost: number; systemCount: number; ends: number[]; candidates: NativeLineCandidate[][]; complete(cache?: NativePageTrialCache, pageLimit?: number, onlyRow?: number): NativeLayout }

function completePageConstrainedTrial(document: ScoreDocument, supplied: NativeRenderOptions, trial: NativeGapTrial,
  preparation: NativeLayoutPreparation, timings?: Record<string, number>): NativeLayout {
  const rowCache: NativePageTrialCache | undefined = supplied.cachePageLineGeometry === false ? undefined : { blocks: new Map() }
  const greedyEnds = greedyNativeLines(trial.candidates)
  if (greedyEnds.length === trial.ends.length && greedyEnds.every((end, index) => end === trial.ends[index])) {
    if (timings) timings.pageBoundIdenticalPlans = (timings.pageBoundIdenticalPlans ?? 0) + 1
    return trial.complete()
  }
  const plans = new Map<string, { ends: number[]; pages: number; value: NativeLayout }>()
  let exactPageCeiling: number | undefined
  const measure = (ends: number[]) => {
    const key = ends.join(':')
    const cached = plans.get(key)
    if (cached) { if (timings) timings.numericPlanCacheHits = (timings.numericPlanCacheHits ?? 0) + 1; return cached }
    const value = prepareNativeScoreAtGap(document, supplied, timings, preparation, ends).complete(rowCache, exactPageCeiling)
    const measured = { ends, pages: value.pages.length, value }
    if (plans.size < 2) plans.set(key, measured)
    return measured
  }
  let optimumValue: NativeLayout | undefined
  try { optimumValue=trial.complete(rowCache) }
  catch(error){if(!(error instanceof Error && error.message.includes('单个谱行')))throw error}
  if(optimumValue)plans.set(trial.ends.join(':'),{ends:trial.ends,pages:optimumValue.pages.length,value:optimumValue})
  const started = timings ? performance.now() : 0
  let greedy: ReturnType<typeof measure>
  try {
    greedy = measureNativeGreedyPageCeiling(trial.candidates,
      optimumValue ? { ends: trial.ends, pages: optimumValue.pages.length, value: optimumValue } : undefined, measure,
      optimumValue && trial.pageFloorFor ? ends => {
        const since = timings ? performance.now() : 0
        const floor = trial.pageFloorFor!(ends, optimumValue!.verticalBlocks.slice(0, optimumValue!.headerBlocks.length))
        if (timings) {
          timings.greedyPageFloorMs = (timings.greedyPageFloorMs ?? 0) + performance.now() - since
          if (floor >= optimumValue!.pages.length) timings.greedyPageFloorPrunes = (timings.greedyPageFloorPrunes ?? 0) + 1
        }
        return floor
      } : undefined)
  } catch (error) {
    if (error instanceof Error && error.message.includes('单个谱行')) return trial.complete(rowCache)
    throw error
  }
  if (timings) timings.pageBoundGreedyMs = (timings.pageBoundGreedyMs ?? 0) + performance.now() - started
  const optimum={ends:trial.ends,pages:optimumValue?.pages.length ?? Infinity,value:optimumValue ?? greedy.value}
  if (timings && optimum.pages > greedy.pages) timings.pageBoundViolations = (timings.pageBoundViolations ?? 0) + 1
  if ((globalThis as {__m3nTraceWidths?:boolean}).__m3nTraceWidths)
    console.log('numeric-tier '+JSON.stringify({width:supplied.width,gap:supplied.minimumNoteGap,greedy:[greedy.pages,greedy.ends.length],optimum:[optimum.pages,optimum.ends.length]}))
  if (optimum.pages <= greedy.pages) return optimum.value
  exactPageCeiling = greedy.pages
  const evaluate = (ends: number[]) => {
    try {
      const measured = measure(ends)
      return { pages: measured.pages, value: measured.value }
    } catch (error) {
      const rejected = error as Error & { code?: string; pageCount?: number }
      if (rejected.code === 'M3N_PAGE_BOUND_REJECTED') return { pages: rejected.pageCount! }
      if (error instanceof Error && error.message.includes('单个谱行')) return { pages: Infinity }
      throw error
    }
  }
  if (supplied.numericLayout && trial.coreLowerBound) return planNativeLinesWithRefinedPages(trial.candidates, greedy, optimum, evaluate, {
    blockFor: (start, end, previousStart, reference) => trial.coreLowerBound!(start, end, rowCache, previousStart, reference),
    headers: greedy.value.verticalBlocks.slice(0, greedy.value.headerBlocks.length),
    options: { pageHeight: Math.floor(supplied.width * A4_CONTENT_ASPECT_RATIO), margin: greedy.value.margin,
      gap: nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8,},
    reference: () => trial.endingReference,
    restrict: trial.restrictBounds,
    revision: () => rowCache?.coreRevision ?? 0,
    tighten: rows => { if (rowCache) trial.tightenRowBounds?.(rowCache, rows) },
  }, timings).value
  return planNativeLinesWithinPages(trial.candidates, greedy, optimum, evaluate, timings).value
}

function prepareNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation, endsOverride?: readonly number[], endingMode?: 'full' | 'inherited', onlyRow?:number): NativeGapTrial {
  let stageStarted = timings ? performance.now() : 0
  const record = (name: string) => {
    if (!timings) return
    const now = performance.now()
    timings[name] = (timings[name] ?? 0) + now - stageStarted
    stageStarted = now
  }
  const recordPart = (name: string, since: number) => {
    if (timings) timings[name] = (timings[name] ?? 0) + performance.now() - since
  }
  if (timings) timings.layoutTrials = (timings.layoutTrials ?? 0) + 1
  validate(supplied)
  if (document.coreGapEm !== undefined && (!Number.isFinite(document.coreGapEm) || document.coreGapEm < 0)) throw new Error('最小行距必须为非负有限数值。')
  const headerDocument = document
  const expanded = preparation?.projection ? preparation.expanded
    : supplied.fixedDo && (document.orderKeys?.some(Boolean) || hasPassKeys(document)) ? keyedDisplayPerformance(document) : undefined
  if (expanded) document = expanded.document
  const minimumNoteGap = supplied.minimumNoteGap ?? nativeStyle.minimumNoteGap
  const minimumNoteGapFloor = supplied.minimumNoteGapFloor ?? 0
  if (!Number.isFinite(minimumNoteGapFloor) || minimumNoteGapFloor < 0 || minimumNoteGapFloor > minimumNoteGap) throw new Error('最小间距下限必须非负且不大于最小基础间距。')
  const options = { ...supplied, width: Math.max(nativeStyle.minimumWidth, Math.round(supplied.width)), minimumNoteGap, minimumNoteGapFloor, equalMeasures: supplied.equalMeasures ?? document.equalMeasures }
  const margin = options.pageMargin ?? nativeStyle.defaultPageMargin
  if (margin * 2 + nativeStyle.minimumContentWidth > options.width) throw new Error('简谱页边距过大。')
  let measurer = options.textMeasurer
  if(!measurer && preparation?.runtimeMeasurer?.timings===timings)measurer=preparation?.runtimeMeasurer?.value
  if (!measurer && typeof window !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
    const context = preparation?.canvas ?? window.document.createElement('canvas').getContext('2d')
    if(context && preparation)preparation.canvas=context
    if (context) measurer = new CanvasTextMeasurer(context, timings, options.textMeasurementCache, true, options.systemCjk)
  }
  measurer ??= new DefaultTextMeasurer()
  if(preparation && !options.textMeasurer)preparation.runtimeMeasurer={timings,value:measurer}
  if(preparation){preparation.lyricHeights ??= new WeakMap();cacheNativeLyricHeights(measurer,preparation.lyricHeights)}
  const projectionStarted = timings ? performance.now() : 0
  let projection: NativeProjection
  let selectedGlyphs: Set<NativeGlyph> | undefined
  if (preparation?.projection) {
    const source=preparation.projection
    selectedGlyphs=onlyRow!==undefined && endsOverride?.at(-1)===source.measures.length
      ? new Set(source.measures.slice(endsOverride[onlyRow-1] ?? 0,endsOverride[onlyRow]).flatMap(m=>m.columns.flatMap(c=>c.glyphs))) : undefined
    projection = cloneNativeProjection(source,selectedGlyphs)
    // Parenthesis padding follows the current trial's note gap. Reuse text
    // metrics, but rebuild this mutable padding using the original arithmetic.
    let enclosure: { left: number; right: number } | undefined
    for (const glyph of projection.glyphs) {
      if (!glyph.instrumental) continue
      if (!enclosure) {
        const style = { fontSize: nativeStyle.music, fontFamily: SCORE_NUMBER_FONT }
        const left = measurer.measureText('(', style), right = measurer.measureText(')', style)
        enclosure = { left: left.w - Math.min(0, left.inkLeft ?? 0), right: Math.max(right.w, right.inkRight ?? right.w) }
      }
      glyph.parenthesisGap = minimumNoteGap
      glyph.parenthesisLeft = enclosure.left + glyph.parenthesisGap
      glyph.parenthesisRight = enclosure.right + glyph.parenthesisGap
    }
    if (timings) timings.projectionReuses = (timings.projectionReuses ?? 0) + 1
  } else {
    const measured = projectNativeScore(document, { ...options, textMeasurer: measurer, displayLyrics: expanded?.lyrics, expandedDisplay: Boolean(expanded) })
    if (timings) timings.projectionBuilds = (timings.projectionBuilds ?? 0) + 1
    if (preparation) { preparation.projection = measured; preparation.expanded = expanded; projection = cloneNativeProjection(measured) }
    else projection = measured
  }
  recordPart('scoreProjectionMs', projectionStarted)
  // Relation identities, nesting and arc chains depend on musical inputs, not
  // the spacing trial. Only remap endpoints to this trial's private glyphs.
  const relationPreparationStarted = timings ? performance.now() : 0
  let relations: NativeRelation[]
  if (preparation?.relations) {
    relations = preparation.relations.map(relation => ({ ...relation, first: projection.glyphs[relation.first]!, last: projection.glyphs[relation.last]! }))
    reserveInstrumentalEndpoints(relations, projection)
    if (timings) timings.relationPlanReuses = (timings.relationPlanReuses ?? 0) + 1
  } else {
    relations = relationsFor(document, projection)
    if (preparation) {
      const indices = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
      preparation.relations = relations.map(relation => ({ ...relation, first: indices.get(relation.first)!, last: indices.get(relation.last)! }))
    }
    if (timings) timings.relationPlanBuilds = (timings.relationPlanBuilds ?? 0) + 1
  }
  recordPart('relationPreparationMs', relationPreparationStarted)
  const available = options.width - 2 * margin
  const headerStarted = timings ? performance.now() : 0
  if (preparation) preparation.commonHeader ??= new Map()
  const headerKey=`geometry:${minimumNoteGap}:${nativeCoreGap(document)}`
  let header=preparation?.header.get(headerKey) as ReturnType<typeof nativeHeaderGeometry>|undefined
  if(!header){header=nativeHeaderGeometry(headerDocument, options.width, margin, measurer, (nativeCoreGap(document) * .8), options, preparation?.header, preparation?.commonHeader);preparation?.header.set(headerKey,header)}
  recordPart('headerGeometryMs', headerStarted)
  const headerHeight = header.height
  record('projectionMs')
  // These minima depend on immutable music, gap and equal-measure settings,
  // never on page width. Keep an unplaced measured projection for each gap;
  // row splitting and final placement still belong to this candidate alone.
  const horizontalKey = `${minimumNoteGap}:${minimumNoteGapFloor}:${options.equalMeasures ?? false}`
  let templates:NativeHorizontalTemplates|undefined
  if(preparation) {
    preparation.horizontalTemplates ??= new Map()
    templates=preparation.horizontalTemplates.get(horizontalKey)
    if(!templates)preparation.horizontalTemplates.set(horizontalKey,templates=new Map())
  }
  cacheNativeHorizontal(options,templates)
  const measuredProjection = preparation?.horizontal?.get(horizontalKey)
  if (measuredProjection) {
    for (const [index, measure] of projection.measures.entries()) {
      if(selectedGlyphs && measure===preparation?.projection?.measures[index])continue
      const measured = measuredProjection[index]!
      measure.minimum = measured.minimum
      measure.naturalStart = measured.naturalStart; measure.naturalEnd = measured.naturalEnd
      measure.minimumStart = measured.minimumStart; measure.minimumEnd = measured.minimumEnd
      for (const [columnIndex, column] of measure.columns.entries()) {
        column.naturalStart = measured.columns[columnIndex]!.naturalStart
        column.naturalEnd = measured.columns[columnIndex]!.naturalEnd
        column.minimumStart = measured.columns[columnIndex]!.minimumStart
        column.minimumEnd = measured.columns[columnIndex]!.minimumEnd
      }
    }
    if (timings) timings.horizontalMeasureReuses = (timings.horizontalMeasureReuses ?? 0) + 1
  } else {
    measureNativeHorizontal(projection.measures, options)
    if (preparation) {
      preparation.horizontal ??= new Map()
      preparation.horizontal.set(horizontalKey, projection.measures.map(measure => ({
        minimum: measure.minimum, minimumStart: measure.minimumStart, minimumEnd: measure.minimumEnd,
        naturalStart: measure.naturalStart, naturalEnd: measure.naturalEnd,
        columns: measure.columns.map(column => ({ minimumStart: column.minimumStart, minimumEnd: column.minimumEnd, naturalStart: column.naturalStart, naturalEnd: column.naturalEnd })),
      })))
    }
  }
  record('horizontalMeasureMs')
  // A closing cross-row arc needs a full horizontal turn before its first
  // note. Reserve that space while choosing rows, rather than flattening it.
  const incomingArcs=new Map<NativeGlyph,NativeRelation[]>()
  for(const relation of relations)if(relation.kind==='tie' || relation.kind==='slur') {
    const incoming=incomingArcs.get(relation.last)
    if(incoming)incoming.push(relation);else incomingArcs.set(relation.last,[relation])
  }
  const arcLeadingCache=preparation ? preparation.arcLeading ??= new Map<string,number>() : undefined
  const arcLeading = (measures: NativeMeasure[]) => {
    const key=arcLeadingCache && measures.length && measures.every(measure=>!measure.continuation && measure.lastFragment)
      ? `${horizontalKey}:${measures[0]!.id}:${measures.at(-1)!.id}` : undefined
    const saved=key===undefined ? undefined : arcLeadingCache!.get(key)
    if(saved!==undefined)return saved
    const firstByLane = new Map<string, NativeGlyph>()
    for(const measure of measures)for(const column of measure.columns)for(const glyph of column.glyphs)
      if(!firstByLane.has(glyph.lane))firstByLane.set(glyph.lane,glyph)
    let leading=0
    for(const glyph of firstByLane.values())for(const relation of incomingArcs.get(glyph) ?? []) {
      if(!measures.some(measure=>measure.columns.some(column=>column.glyphs.includes(relation.first))))
        leading=Math.max(leading,nativeStyle.music*.45*1.2-(glyph.musicLeft ?? glyph.left))
    }
    if(key!==undefined)arcLeadingCache!.set(key,leading)
    return leading
  }
  if (preparation) preparation.rowMinimums ??= new Map()
  let rowMinimums = preparation?.rowMinimums?.get(horizontalKey)
  if (preparation && !rowMinimums) preparation.rowMinimums!.set(horizontalKey, rowMinimums = new Map())
  let graphCache: Map<string,NativeLineCandidate[][]> | undefined
  if(preparation) {
    preparation.lineGraphs ??= new Map()
    graphCache=preparation.lineGraphs.get(horizontalKey)
    if(!graphCache)preparation.lineGraphs.set(horizontalKey,graphCache=new Map())
  }
  const graphKey=`${available}:${options.wrapWidthRatio ?? 1}`
  const knownGraph=selectedGlyphs ? graphCache?.get(graphKey) : undefined
  const partialPlan=knownGraph && endsOverride ? {ends:[...endsOverride],candidates:knownGraph,lines:endsOverride.map((end,index)=>{
    const start=endsOverride[index-1] ?? 0
    return {measures:projection.measures.slice(start,end),density:knownGraph[start]!.find(row=>row.end===end)!.density}
  })} : undefined
  const linePlan = partialPlan ?? breakMeasures(projection.measures, available, options, arcLeading, timings, rowMinimums, endsOverride, graphCache)
  const { lines } = linePlan
  record('lineBreakMs')
  const rhythmicGapFor=(measures:NativeMeasure[])=>{
    const width=available-arcLeading(measures)
    const key=measures.every(m=>!m.continuation && m.lastFragment) ? `${horizontalKey}:${width}:${measures.map(m=>m.id).join(':')}` : undefined
    if(preparation && key!==undefined) {
      preparation.unitGaps ??= new Map()
      if(preparation.unitGaps.has(key))return preparation.unitGaps.get(key)
      const gap=nativeUnitRhythmicGap(measures,options,width);preparation.unitGaps.set(key,gap);return gap
    }
    return nativeUnitRhythmicGap(measures,options,width)
  }
  const systems: NativeSystem[] = lines.map(({ measures, density }, index) => ({ horizontalDensity: density, unitRhythmicGap: onlyRow===undefined ? rhythmicGapFor(measures) : undefined, coreGap: nativeCoreGap(document), index, numericGeometry: options.numericLayout, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  record('horizontalQualityMs')
  // Named sections are labels within a projected part; expanded performances
  // can also introduce part boundaries. Neither a phrase nor {br} ends a section.
  const startsSection = (current: NativeSystem, previous: NativeSystem) => {
    return startsNativeSection(current.measures[0]!, previous.measures.at(-1))
  }
  // Reference each section's terminal row to all preceding rows in that section,
  // rather than to a possibly unusually tight immediate predecessor. This is
  // horizontal metadata already computed for ranking, so no engraving is repeated.
  const endingGapReferences = new Map<NativeSystem, number>()
  let sectionGapSum = 0, sectionGapCount = 0
  for (const system of systems) {
    const previous = systems[system.index - 1], next = systems[system.index + 1]
    if (previous && startsSection(system, previous)) { sectionGapSum = 0; sectionGapCount = 0 }
    if (!next || startsSection(next, system)) {
      if (sectionGapCount) endingGapReferences.set(system, sectionGapSum / sectionGapCount)
    } else if (system.unitRhythmicGap !== undefined) {
      sectionGapSum += system.unitRhythmicGap; sectionGapCount++
    }
  }
  const systemOf = new Map<NativeGlyph, number>()
  for(const system of systems)for(const measure of system.measures)for(const column of measure.columns)for(const glyph of column.glyphs)systemOf.set(glyph,system.index)
  const spacingFor=(measures:NativeMeasure[])=>{
    const key=measures.every(m=>!m.continuation && m.lastFragment) ? `${horizontalKey}:${measures.map(m=>m.id).join(':')}` : undefined
    if(preparation && key!==undefined) {
      preparation.spacings ??= new Map()
      let spacing=preparation.spacings.get(key)
      if(!spacing){spacing=nativeHorizontalSpacing(measures,options);preparation.spacings.set(key,spacing)}
      return spacing
    }
    return nativeHorizontalSpacing(measures,options)
  }
  const placeSystem = (system: NativeSystem,cache?:NativePageTrialCache) => {
    const leading = arcLeading(system.measures)
    const x = margin + leading
    if (leading > 0) system.arcContinuationLeft = margin
    let width = options.width - margin - x
    const previous = systems[system.index - 1], next = systems[system.index + 1]
    if (endingMode !== 'full' && previous && !startsSection(system, previous) && (!next || startsSection(next, system))) {
      width = nativeLastLineWidth(spacingFor(system.measures), width,
        spacingFor(previous.measures), available - arcLeading(previous.measures),
        endingMode !== 'inherited' && system.unitRhythmicGap !== undefined && endingGapReferences.has(system)
          ? { current: system.unitRhythmicGap, reference: endingGapReferences.get(system)! } : undefined)
    }
    const horizontalKey=cache ? `${nativeRowIdentity(system.measures)}:${x}:${width}` : undefined
    if(cache && horizontalKey!==undefined) {
      const saved=cache.horizontal?.get(horizontalKey)
      if(saved){restoreNativeRowHorizontal(system,saved);return}
    }
    const glyphs = placeNativeHorizontal(system.measures, options, x, width)
    for (const glyph of glyphs) systemOf.set(glyph, system.index)
    const laneNames = [...new Set(glyphs.map(glyph => glyph.lane))].sort((a, b) => a === 'melody' ? -1 : b === 'melody' ? 1 : a === 'bass' ? 1 : b === 'bass' ? -1 : a.localeCompare(b))
    for (const lane of laneNames) {
      const members = glyphs.filter(glyph => glyph.lane === lane)
      const rows = [...new Set(members.flatMap(glyph => [...glyph.lyrics].filter(([, row]) => row.annotation || row.texts.some(text => text.replaceAll('\u200B', '').trim())).map(([row]) => row)))].sort((a, b) => a - b)
      const bars = system.measures.flatMap((_, index) => nativeLaneBarPositions(system.measures, index, lane))
        .map(bar => nativeBarInk(bar.kind, bar.x, 0, measurer))
      const bodyBottom = Math.max(0, ...bars.map(ink => ink.bottom), ...members.map(glyph => glyph.bottom))
      const lyricBottom = Math.max(...members.map(glyph => glyph.musicBottom ?? glyph.bottom))
      system.lanes.push({ id: lane, y: 0, top: Math.max(0, ...bars.map(ink => -ink.top), ...members.map(glyph => glyph.top)), bodyBottom, lyricBottom, bottom: bodyBottom, rows })
    }
    if(cache && horizontalKey!==undefined){cache.horizontal ??= new Map();cache.horizontal.set(horizontalKey,captureNativeRowHorizontal(system))}
  }
  const horizontal = { options, margin, systems, pages: [] }
  const quality = onlyRow===undefined ? nativeLayoutQuality(horizontal) : {totalCost:0,spacingCost:0,overflowCost:0}
  const plannedFragments = linePlan.lines.flatMap(line => line.measures)
  const sectionIds:number[]=[]
  let sectionId=0
  for(const [index,measure] of plannedFragments.entries()) {
    if(startsNativeSection(measure,plannedFragments[index-1]))sectionId++
    sectionIds.push(sectionId)
  }
  const foundationBounds = new Map<string, NativePageBlock>()
  const rowKeysForBounds=new Map<number,string>()
  const boundKey=(start:number,end:number)=>{
    const index=start*(plannedFragments.length+1)+end
    let key=rowKeysForBounds.get(index)
    if(key===undefined){key=nativeRowIdentity(plannedFragments.slice(start,end));rowKeysForBounds.set(index,key)}
    return key
  }
  const rowGaps=new Map<number,number|undefined>()
  const gapFor=(start:number,end:number)=>{
    const key=start*(plannedFragments.length+1)+end
    if(!rowGaps.has(key)) {const members=plannedFragments.slice(start,end);rowGaps.set(key,rhythmicGapFor(members))}
    return rowGaps.get(key)
  }
  let references:ReturnType<typeof nativeEndingReferences>|undefined
  const referenceCache=new WeakMap<object,ReturnType<typeof nativeEndingReferences>>()
  const referenceBounds=(graph:readonly (readonly NativeLineCandidate[])[])=>{
    let bounds=referenceCache.get(graph)
    if(!bounds){bounds=nativeEndingReferences(graph,at=>sectionIds[at]!,gapFor);referenceCache.set(graph,bounds)}
    return bounds
  }
  const guaranteedFull=(gap:number,start:number)=>!options.equalMeasures && gap<=(references ??= referenceBounds(linePlan.candidates))[start]!.minimum*1.5
  const referenceSections=new Set<number>()
  const restrictBounds=(graph:readonly (readonly NativeLineCandidate[])[])=>{
    if (options.equalMeasures) return
    references=referenceBounds(graph)
    referenceSections.clear()
    if(!options.equalMeasures)for(let start=0;start<graph.length;start++)for(const row of graph[start]!) {
      if(row.end<graph.length && sectionIds[row.end]===sectionIds[row.end-1])continue
      const gap=gapFor(start,row.end),range=references[start]!
      if(gap!==undefined && gap>range.minimum*1.5 && gap<=range.maximum*1.5)referenceSections.add(sectionIds[start]!)
    }
  }
  let endingBoundsPrepared=false
  let pageFloor:number|undefined
  const minimumPages=()=>{
    if(pageFloor!==undefined)return pageFloor
    if(!linePlan.candidates.length)return pageFloor=1
    const extents=plannedFragments.map(measure=>{
      let top=-Infinity,bottom=Infinity
      for(const column of measure.columns)for(const glyph of column.glyphs) {
        top=Math.max(top,Math.min(0,...(glyph.coreInk ?? []).map(piece=>piece.top)))
        bottom=Math.min(bottom,Math.max(0,...(glyph.coreInk ?? []).map(piece=>piece.bottom)))
      }
      return {top:Number.isFinite(top) ? top : 0,bottom:Number.isFinite(bottom) ? bottom : 0}
    })
    const base=nativeCoreGap(document)
    const scale=projection.glyphs.some(glyph=>glyph.lyrics.size) ? Math.min(1,scoreLyricGapScale(base)) : 1
    const gap=Math.min(base*scale,...plannedFragments.flatMap(measure=>measure.coreGapBefore===undefined ? [] : [measure.coreGapBefore]))
    const suffix=Array<number>(plannedFragments.length+1).fill(Infinity);suffix[plannedFragments.length]=0
    for(let start=plannedFragments.length-1;start>=0;start--) {
      let top=-Infinity,bottom=Infinity,previous=start
      for(const row of linePlan.candidates[start]!) {
        for(let at=previous;at<row.end;at++){top=Math.max(top,extents[at]!.top);bottom=Math.min(bottom,extents[at]!.bottom)}
        previous=row.end
        suffix[start]=Math.min(suffix[start]!,Math.max(0,bottom-top)+gap+suffix[row.end]!)
      }
    }
    // Each page can omit at most one inter-row clearance. Header space and
    // every non-core primitive are omitted, so this is a lower bound for all
    // legal partitions, independent of either tier's chosen horizontal plan.
    return pageFloor=Math.max(1,Math.ceil((suffix[0]!-1e-6)/(Math.floor(options.width*A4_CONTENT_ASPECT_RATIO)-2*margin+gap)))
  }
  return { get pageFloor(){return options.numericLayout ? minimumPages() : 1}, pageFloorFor:options.numericLayout ? (ends,headers)=>{
    let start=0
    const blocks=ends.map(end=>{
      const measures=plannedFragments.slice(start,end)
      // Bound the weighted static core over every possible ending width,
      // rather than retaining only the shallowest individual note. Search
      // widths share the same interval; wider public API calls get a new key.
      const maximumWidth=Math.max(768,options.width)-2*margin-arcLeading(measures)
      const key=measures.every(measure=>!measure.continuation && measure.lastFragment) ? `${horizontalKey}:${maximumWidth}:${boundKey(start,end)}` : undefined
      if(preparation)preparation.fixedCoreBounds ??= new Map()
      let block=key===undefined ? undefined : preparation?.fixedCoreBounds?.get(key)
      if(!block) {
        block=nativeRowCoreLowerBound(measures,measurer,nativeCoreGap(document),{...options,width:maximumWidth},templates)
        if(key!==undefined)preparation?.fixedCoreBounds?.set(key,block)
      }
      start=end;return block
    })
    return nativeCorePageLowerBound([...headers,...blocks],{pageHeight:Math.floor(options.width*A4_CONTENT_ASPECT_RATIO),margin,
      gap:nativeCoreGap(document),headerGap:nativeCoreGap(document)*.8})
  } : undefined, get endingReference(){return endingBoundsPrepared ? {required:(at:number)=>referenceSections.has(sectionIds[at]!),section:(at:number)=>sectionIds[at]!,gap:gapFor,
    terminal:(_start:number,end:number)=>end===plannedFragments.length || sectionIds[end]!==sectionIds[end-1]} : undefined}, restrictBounds, tightenRowBounds: options.numericLayout ? (cache,rows)=>{
    endingBoundsPrepared=true
    const started=timings ? performance.now() : 0
    const fragmentOf=new Map<NativeGlyph,number>()
    plannedFragments.forEach((measure,index)=>measure.columns.forEach(column=>column.glyphs.forEach(glyph=>fragmentOf.set(glyph,index))))
    const external=relations.filter(relation=>['cresc','decres','tuplet'].includes(relation.kind))
    const prefixes:Array<number[]|undefined>=Array(plannedFragments.length+1);prefixes[0]=[]
    for(let start=0;start<linePlan.candidates.length;start++)if(prefixes[start])for(const row of linePlan.candidates[start]!)prefixes[row.end] ??= [...prefixes[start]!,row.end]
    for(let start=0;start<linePlan.candidates.length;start++)for(const row of linePlan.candidates[start]!) {
      if(rows && !rows.has(`${start}:${row.end}`))continue
      if(external.some(relation=>{
        const first=fragmentOf.get(relation.first)!,last=fragmentOf.get(relation.last)!
        return first<row.end && last>=start && (relation.kind!=='tuplet' || first<start || last>=row.end)
      }))continue
      const terminal=row.end===plannedFragments.length || sectionIds[row.end]!==sectionIds[row.end-1]
      const members=plannedFragments.slice(start,row.end),key=nativeRowIdentity(members)
      if(cache.coreBounds?.has(key) || !prefixes[start])continue
      const suffix:number[]=[]
      for(let at=row.end;at<linePlan.candidates.length;) {at=Math.max(...linePlan.candidates[at]!.map(r=>r.end));suffix.push(at)}
      const variants:NativePageBlock[]=[]
      const collect=(ends:number[],mode:'full'|'inherited')=>{
        const layout=prepareNativeScoreAtGap(document,supplied,timings,preparation,ends,mode,ends.indexOf(row.end)).complete(cache,undefined,ends.indexOf(row.end))
        const block=layout.verticalBlocks[0]!
        variants.push(block)
        return block
      }
      const full=collect([...prefixes[start]!,row.end,...suffix],'full')
      if(!terminal)continue
      const pairs=new Map<number,{full:NativePageBlock;inherited:NativePageBlock;lower:NativePageBlock}>()
      const inheritedVariants:NativePageBlock[]=[]
      for(let before=0;before<start;before++)if(prefixes[before] && sectionIds[before]===sectionIds[start]
        && linePlan.candidates[before]!.some(r=>r.end===start)) {
          const inherited=collect([...prefixes[before]!,start,row.end,...suffix],'inherited')
          pairs.set(before,{full,inherited,lower:intersectNativeRowBounds([full,inherited])});inheritedVariants.push(inherited)
        }
      cache.endingPairs ??= new Map()
      cache.endingPairs.set(key,pairs)
      cache.endingInherited ??= new Map()
      cache.endingInherited.set(key,intersectNativeRowBounds(inheritedVariants.length ? inheritedVariants : [full]))
      cache.coreBounds ??= new Map()
      cache.coreBounds.set(key,intersectNativeRowBounds(variants))
      cache.coreRevision=(cache.coreRevision ?? 0)+1
    }
    if(timings)timings.numericEndingBoundsMs=(timings.numericEndingBoundsMs ?? 0)+performance.now()-started
  } : undefined, coreLowerBound: options.numericLayout ? (start, end, cache, previousStart, exactReference) => {
    const key=boundKey(start,end)
    const pair=previousStart===undefined ? undefined : cache?.endingPairs?.get(key)?.get(previousStart)
    if(pair) {
      if(options.equalMeasures)return pair.inherited
      const reference=references?.[start],gap=gapFor(start,end)
      if(exactReference!==undefined && referenceSections.has(sectionIds[start]!)) return !options.equalMeasures && gap!==undefined && gap<=exactReference*1.5 ? pair.full : pair.inherited
      if(reference && gap!==undefined && !options.equalMeasures) {
        if(gap<=reference.minimum*1.5)return pair.full
        if(gap>reference.maximum*1.5)return pair.inherited
      }
      return pair.lower
    }
    const pairs=cache?.endingPairs?.get(key),reference=references?.[start]
    if(pairs?.size && reference && !options.equalMeasures) {
      const gap=gapFor(start,end)
      if(gap!==undefined) {
        if(gap<=reference.minimum*1.5)return pairs.values().next().value!.full
        if(gap>reference.maximum*1.5)return cache!.endingInherited!.get(key)!
      }
    }
    const measured = cache?.coreBounds?.get(key)
    if (measured) return measured
    const full=cache?.fullRows?.get(key)
    if(full && guaranteedFull(full.gap,start)) {
      return full.block
    }
    let bound = foundationBounds.get(key)
    if (!bound) {
      const measures=plannedFragments.slice(start,end)
      bound = nativeRowCoreLowerBound(measures,measurer,nativeCoreGap(document),{...options,width:available-arcLeading(measures)},templates)
      foundationBounds.set(key,bound)
    }
    return bound
  } : undefined, score: 1 / (1 + quality.totalCost), tierCost: quality.spacingCost + quality.overflowCost, systemCount: systems.length, ends: linePlan.ends, candidates: linePlan.candidates, complete: (rowCache, pageLimit, onlyRow) => {
  stageStarted = timings ? performance.now() : 0
  for (const system of systems) if(onlyRow===undefined || system.index===onlyRow)placeSystem(system,rowCache)
  record('horizontalPlacementMs')
  cacheNativeHairpins(systems)
  const dependencies=new Map<NativeSystem,number[][]>()
  if(rowCache)for(const relation of relations) {
    if(relation.kind==='cresc' || relation.kind==='decres')for(const segment of nativeHairpinSegments(relation,systems)) {
      const values=dependencies.get(segment.system) ?? []
      values.push([segment.left,segment.right,segment.startHalf,segment.endHalf,segment.stroke]);dependencies.set(segment.system,values)
    }
    else if(relation.kind==='tuplet' && systemOf.get(relation.first)!==systemOf.get(relation.last)) {
      for(let index=systemOf.get(relation.first)!;index<=systemOf.get(relation.last)!;index++) {
        const system=systems[index]!,values=dependencies.get(system) ?? []
        values.push([relation.first.x,relation.last.x]);dependencies.set(system,values)
      }
    }
  }
  const cacheSafe = rowCache
  // A single-row geometry probe never reads snapshots of its other rows.
  // Keep their indices, but avoid serializing all of their untouched columns.
  const rowKeys = cacheSafe ? systems.map(system => onlyRow!==undefined && system.index!==onlyRow ? '' : JSON.stringify([
    nativeRowIdentity(system.measures), system.arcContinuationLeft, dependencies.get(system),
    system.measures.map(measure => [measure.start, measure.end, measure.columns.map(column => column.x)]),
  ])) : undefined
  const headerBlocks = rowCache?.headers ?? header.blocks.map(block => ({ height: block.height, ink: nativeSvgPieces(block.svg, measurer) }))
  if (rowCache) rowCache.headers = headerBlocks
  if (onlyRow===undefined && pageLimit !== undefined && rowKeys && rowKeys.every(key => rowCache!.blocks.has(key))) {
    const cachedBlocks = [...headerBlocks, ...rowKeys.map(key => rowCache!.blocks.get(key)!)]
    const pagination = prepareNativePagination(cachedBlocks, { immutableBlocks: true })({ pageHeight: Math.floor(options.width * A4_CONTENT_ASPECT_RATIO),
      margin, gap: options.coreGap ?? nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8 })
    if (timings) timings.pageBoundCachedPaginationChecks = (timings.pageBoundCachedPaginationChecks ?? 0) + 1
    if (pagination.heights.length > pageLimit) {
      if (timings) timings.pageBoundCachedRejections = (timings.pageBoundCachedRejections ?? 0) + 1
      throw Object.assign(new Error('Cached row geometry exceeds the greedy page ceiling'), {
        code: 'M3N_PAGE_BOUND_REJECTED', pageCount: pagination.heights.length })
    }
  }
  if (options.numericLayout && rowCache) rowCache.rows ??= new Map()
  const reused = new Map<NativeSystem, NativeRowSnapshot>()
  if (options.numericLayout && rowKeys) for (const system of systems) {
    if(onlyRow!==undefined && system.index!==onlyRow)continue
    const snapshot = rowCache!.rows!.get(rowKeys[system.index]!)
    if (snapshot) { reused.set(system, snapshot); restoreNativeRow(system, snapshot) }
  }
  const activeSystems = systems.filter(system => !reused.has(system) && (onlyRow===undefined || system.index===onlyRow))
  if (timings) timings.numericRowCacheHits = (timings.numericRowCacheHits ?? 0) + reused.size
  const relationBounds = new Map<NativeSystem, NativeRegion[]>()
  const annotationSystems=new Set<NativeSystem>(),regionSystems=new Set<NativeSystem>()
  for(const system of activeSystems)for(const measure of system.measures)for(const column of measure.columns)for(const glyph of column.glyphs) {
    if(glyph.annotations.length){annotationSystems.add(system);regionSystems.add(system)}
    if(glyph.marks.some(name=>!nativeInnerMark(name)))regionSystems.add(system)
  }
  for (const system of activeSystems) {
    if(!regionSystems.has(system)){relationBounds.set(system,[]);continue}
    const regions: NativeRegion[] = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .flatMap(g => [
        ...(g.musicInk ?? [{ left: -(g.inkLeft ?? g.left), right: g.inkRight ?? g.right, top: -(g.musicTop ?? g.top), bottom: g.musicBottom ?? g.bottom }])
          .map(ink => ({ lane: g.lane, left: g.x + ink.left, right: g.x + ink.right, top: -ink.top })),
        ...g.controls.flatMap(placedNativeControlInk).map(ink => ({ lane: g.lane, left: ink.left, right: ink.right, top: -ink.top })),
      ])
    for (const [index] of system.measures.entries()) for (const lane of system.lanes) {
      for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) {
        const ink = nativeBarInk(bar.kind, bar.x, 0, measurer)
        regions.push({ lane: lane.id, left: ink.left, right: ink.right, top: -ink.top, headingClearance: nativeStyle.headingBarGap })
      }
    }
    relationBounds.set(system, regions)
  }
  for (const system of activeSystems) placeNativeBarLabels(system, relationBounds.get(system)!, measurer, Boolean(options.measureNumbers), options.width)
  const relationsStarted = timings ? performance.now() : 0
  // Populate peers before measuring any relation; adjacent groups share height.
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = onlyRow===undefined ? first : Math.max(first,onlyRow); index <= (onlyRow===undefined ? last : Math.min(last,onlyRow)); index++) {
      if (relation.kind === 'inst' && index !== first && index !== last) continue
      systems[index]!.relations.push(relation)
    }
  }
  for(const system of activeSystems){cacheNativeTuplets(system);cacheNativeArcObstacles(system)}
  for (const [system, snapshot] of reused) restoreNativeRowRelations(system, snapshot)
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = onlyRow===undefined ? first : Math.max(first,onlyRow); index <= (onlyRow===undefined ? last : Math.min(last,onlyRow)); index++) {
      if (relation.kind === 'inst' && index !== first && index !== last) continue
      const system = systems[index]!
      if (reused.has(system)) continue
      const lane = system.lanes.find(lane => lane.id === relation.first.lane)
      if (lane) {
        const placed = placeNativeRelation(relation, system, measurer, systems)
        system.relationLayout ??= new Map()
        system.relationLayout.set(relation, placed)
        const top = -placed.ink.top
        lane.top = Math.max(lane.top, top)
        lane.bodyBottom = Math.max(lane.bodyBottom ?? 0, placed.ink.bottom)
        const bounds = relationBounds.get(system) ?? []
        // Parentheses are two separate endpoints, not a painted obstacle
        // across the enclosed music. Tuplets retain their complete rhythm
        // group for expression ordering; curves keep local ribbon queries.
        if(regionSystems.has(system)) {
          const pieces = relation.kind === 'inst' ? placed.pieces ?? nativeSvgPieces(placed.svg, measurer) : [placed.ink]
          bounds.push(...pieces.map(ink => ({ lane: lane.id, left: ink.left, right: ink.right, top: -ink.top, arc: placed.arc })))
        }
        relationBounds.set(system, bounds)
      }
    }
  }
  releaseNativeHairpins(systems)
  for(const system of activeSystems){releaseNativeTuplets(system);releaseNativeArcObstacles(system)}
  recordPart('relationsMs', relationsStarted)
  // Single-note marks already belong to the measured note and its arc port.
  // Dynamics and expression text clear relations outside that local stack.
  for (const system of activeSystems) {
    if(!regionSystems.has(system))continue
    const regions = relationBounds.get(system) ?? []
    const outerMarks = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .flatMap(glyph => glyph.marks.filter(name => !nativeInnerMark(name)).map(name => ({ glyph, name })))
      .sort((a, b) => nativeMarkRank(a.name) - nativeMarkRank(b.name))
    // Local marks and tuplet brackets have already entered regions, including
    // a neighboring note's ornament or fingering that overlaps this expression.
    for (const { glyph, name } of outerMarks) {
      const ink = nativeMarkInk(name, measurer)
      const x = Math.max(margin - ink.left, Math.min(glyph.x, options.width - margin - ink.right))
      const left = x + ink.left, right = x + ink.right
      const top = Math.max(0, ...regions.filter(r => r.lane === glyph.lane && r.right >= left && r.left <= right).map(r => nativeRegionTop(r, left, right)))
      const mark = nativeMarkStack([name], top, measurer, system.coreGap).items[0]!
      mark.x = x - glyph.x
      mark.left += mark.x; mark.right += mark.x
      glyph.markLayout ??= []; glyph.markLayout.push(mark)
      glyph.top = Math.max(glyph.top, -mark.top)
      regions.push({ lane: glyph.lane, left, right, top: -mark.top })
      const lane = system.lanes.find(l => l.id === glyph.lane)!
      lane.top = Math.max(lane.top, -mark.top)
    }
    relationBounds.set(system, regions)
  }
  // Endings share measured geometry across wrapping and pagination.
  const voltasStarted = timings ? performance.now() : 0
  placeNativeVoltas(systems, relationBounds, measurer, options.width, new Set(activeSystems))
  recordPart('voltasMs', voltasStarted)
  // Place chord names before local descriptions and section headings.
  for (const system of activeSystems) {
    if(!annotationSystems.has(system))continue
    const regions = relationBounds.get(system) ?? []
    relationBounds.set(system, regions)
    placeNativeAnnotations(system, regions, measurer, options.width, margin, false)
  }
  for (const system of activeSystems) placeNativeNavigation(system)
  const lyricsStarted = timings ? performance.now() : 0
  for (const system of activeSystems) for (const lane of system.lanes) placeNativeLyrics(system, lane, measurer)
  recordPart('lyricsPlacementMs', lyricsStarted)
  for (const system of activeSystems) {
    if(!annotationSystems.has(system))continue
    const hasHeading = system.measures.some(measure => measure.columns.some(column => column.glyphs.some(glyph => glyph.event?.sectionLabelBreakAfter)))
    const coreTops = hasHeading ? new Map([...nativeLanePieces(system, measurer, true)]
      .map(([lane, pieces]) => [lane, Math.max(0, ...pieces.map(piece => -piece.top))])) : undefined
    placeNativeAnnotations(system, relationBounds.get(system)!, measurer, options.width, margin, true, coreTops)
  }
  record('decorationsLyricsMs')
  const measuredSystems=onlyRow===undefined ? systems : [systems[onlyRow]!]
  const blocks = [...(onlyRow===undefined ? headerBlocks : []), ...measuredSystems.map(system => {
    if (options.numericLayout) {
      if (reused.has(system)) return rowCache!.blocks.get(rowKeys![system.index]!)!
      const block = nativeRowGeometry(system, measurer, margin, nativeCoreGap(document))
      if (rowKeys) {
        rowCache!.blocks.set(rowKeys[system.index]!, block)
        rowCache!.rows!.set(rowKeys[system.index]!, captureNativeRow(system))
        const next = systems[system.index+1]
        if (!dependencies.has(system) && !options.equalMeasures && system.unitRhythmicGap !== undefined
          && Math.abs(system.measures.at(-1)!.end-(options.width-margin))<1e-6) {
          const axis=block.baseline ?? 0
          rowCache!.fullRows ??= new Map()
          rowCache!.fullRows.set(nativeRowIdentity(system.measures),{gap:system.unitRhythmicGap,
            block:{...block,baseline:0,resolvedInk:true,core:{top:block.core!.top-axis,bottom:block.core!.bottom-axis},
              ink:block.ink?.map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis})),
              boundaryInk:block.boundaryInk?.map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis}))}})
        }
        if (!dependencies.has(system) && next && !startsSection(next,system)) {
          rowCache!.coreBounds ??= new Map()
          const axis = block.baseline ?? 0, key = nativeRowIdentity(system.measures)
          const core = {top:block.core!.top-axis,bottom:block.core!.bottom-axis}
          const prior = rowCache!.coreBounds.get(key)
          if (!prior || prior.core!.top!==core.top || prior.core!.bottom!==core.bottom) {
            rowCache!.coreBounds.set(key,{...block,baseline:0,resolvedInk:true,core,
              ink:block.ink?.map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis})),
              boundaryInk:block.boundaryInk?.map(piece=>({...piece,top:piece.top-axis,bottom:piece.bottom-axis}))})
            rowCache!.coreRevision = (rowCache!.coreRevision ?? 0)+1
          }
        }
      }
      return block
    }
    const height = placeNativeLanes(system)
    let geometryStarted = timings ? performance.now() : 0
    const pieces = nativeLanePieces(system, measurer)
    if (timings) { timings.laneInkMs = (timings.laneInkMs ?? 0) + performance.now() - geometryStarted; geometryStarted = performance.now() }
    const core = nativeSystemCore(system, measurer) ?? { top: 0, bottom: height }
    if (timings) timings.coreInkMs = (timings.coreInkMs ?? 0) + performance.now() - geometryStarted
    const ink = system.lanes.flatMap(lane => (pieces.get(lane.id) ?? []).map(piece => ({ ...piece, top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
    ink.push(...nativeSvgPieces(nativeVoiceConnectorSvg(system, margin, measurer), measurer))
    const boundaryInk = (system.decorationLayout ?? []).filter(decoration => isNativeMeasureNumber(decoration))
      .flatMap(decoration => {
        const y = system.lanes.find(lane => lane.id === decoration.lane)!.y
        return nativeSvgPieces(decoration.svg, measurer).map(piece => ({ ...piece, top: piece.top + y, bottom: piece.bottom + y }))
      })
    const hasLyrics = system.lanes.some(lane => lane.rows.length > 0)
    const coreGapScale = hasLyrics ? scoreLyricGapScale(nativeCoreGap(document)) : 1
    const block = { height, baseline: system.lanes[0]?.y ?? 0, core, coreGapScale, ink, boundaryInk, coreGapBefore: system.measures[0]?.coreGapBefore }
    if (rowKeys) rowCache!.blocks.set(rowKeys[system.index]!, block)
    return block
  })]
  const layout: NativeLayout = { document, headerDocument, projection, systems:measuredSystems, pages: [], relations, options, measurer, headerHeight, margin,
    pagination: prepareNativePagination(blocks, { immutableBlocks: true }), verticalBlocks: blocks, headerBlocks: onlyRow===undefined ? header.blocks : [] }
  if(onlyRow!==undefined)return layout
  const gap = options.coreGap ?? (nativeCoreGap(document))
  const pageFitStarted = timings ? performance.now() : 0
  const pagination = layout.pagination({ pageHeight: options.paged ? Math.floor(options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin, gap, headerGap: nativeCoreGap(document) * .8, maxGap: options.numericLayout ? gap : options.coreGap ?? (options.paged ? Math.max(scoreMaximumCoreGap(nativeCoreGap(document)), gap) : gap) })
  // Internal numeric trials need only page membership. The public entry point
  // fits the winner's vertical spacing and publishes coordinates exactly once.
  if(options.numericLayout)layout.pages=pagination.heights.map((height,index)=>({index,width:options.width,height,systems:[]}))
  else positionNativeLayout(layout, pagination)
  if (timings) timings.pageFitMs = (timings.pageFitMs ?? 0) + performance.now() - pageFitStarted
  record('verticalPaginationMs')
  return layout
  } }
}

/** Reuse measured rows and ink; only vertical coordinates change. */
function positionNativeLayout(layout: NativeLayout, pagination: ReturnType<typeof paginateNativeBlocks>) {
  const { options, systems, headerBlocks, verticalBlocks } = layout
  const pages: NativePage[] = pagination.heights.map((height, index) => ({ index, width: options.width, height, systems: [], coreGap: pagination.coreGaps?.[index] }))
  for (const [index, block] of headerBlocks.entries()) {
    const position = pagination.positions[index]!
    pages[position.page]!.header = (pages[position.page]!.header ?? '') + `<g transform="translate(0 ${position.top})">${block.svg}</g>`
  }
  for (const [index, system] of systems.entries()) {
    const position = pagination.positions[index + headerBlocks.length]!
    const dy = position.top - system.top
    system.top = position.top; system.page = position.page
    for (const lane of system.lanes) {
      lane.y += dy
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) if (glyph.lane === lane.id) glyph.y = lane.y
    }
    system.bottom = position.top + verticalBlocks[index + headerBlocks.length]!.height
    pages[position.page]!.systems.push(system)
  }
  layout.pages = pages
}

export function nativeContinuousPagination(layout: NativeLayout, coreGap: number) {
  return layout.pagination({ pageHeight: Infinity, margin: layout.margin, gap: coreGap, headerGap: nativeCoreGap(layout.document) * .8 })
}

/** Change page membership and vertical spacing without repeating horizontal layout. */
export function repaginateNativeLayout(layout: NativeLayout, paged: boolean, coreGap?: number) {
  const gap = coreGap ?? (nativeCoreGap(layout.document))
  const pagination = layout.pagination({
    pageHeight: paged ? Math.floor(layout.options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin: layout.margin, gap, headerGap: nativeCoreGap(layout.document) * .8, maxGap: coreGap ?? (paged ? Math.max(scoreMaximumCoreGap(nativeCoreGap(layout.document)), gap) : gap),
  })
  layout.options = { ...layout.options, paged, coreGap }
  positionNativeLayout(layout, pagination)
}

export function reflowNativeContinuousLayout(layout: NativeLayout, coreGap: number) {
  if (layout.options.paged) throw new Error('Only continuous layouts can be reflowed as a shared page')
  positionNativeLayout(layout, nativeContinuousPagination(layout, coreGap))
  layout.options = { ...layout.options, coreGap }
}
