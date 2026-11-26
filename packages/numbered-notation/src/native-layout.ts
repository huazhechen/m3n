import { scoreLyricGapScale, scoreMaximumCoreGap } from './score-layout-policy.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeLayoutQuality } from './native-quality.js'
import { hasPassKeys } from '@m3n/notation'
import { A4_CONTENT_ASPECT_RATIO } from '@m3n/notation'
import { keyedDisplayPerformance } from './display-performance.js'
import { nativeBarInk, nativeLaneBarPositions } from './native-bars.js'
import { nativeCoreGap, nativeStyle } from './native-style.js'
import { placeNativeNavigation, placeNativeBarLabels } from './native-system-labels.js'
import { placeNativeVoltas } from './native-volta-layout.js'
import { placeNativeLyrics } from './native-lyrics.js'
import { placeNativeRelation, type NativeRelationLayout } from './native-relations.js'
import { nativeMarkStack, nativeInnerMark, nativeMarkRank } from './native-marks.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { placeNativeAnnotations, nativeRegionTop, type NativeRegion } from './native-annotations.js'
import { type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import { paginateNativeBlocks, prepareNativePagination, type NativePageBlock } from './native-pagination.js'
import { nativeHeaderGeometry, type NativeHeaderPreparation } from './native-header.js'
import { splitNativeMeasure } from './native-wrapping.js'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
import { greedyNativeLines, planNativeLinesWithinPages } from './native-page-line-breaking.js'
export { wrapNativeText } from './native-header.js'
import { measureNativeHorizontal, nativeHorizontalSpacing, nativeUnitRhythmicGap, nativeLastLineWidth, placeNativeHorizontal } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, NumberedTextMeasurementCache, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, cloneNativeProjection, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'
import { placeNativeLanes, nativeLanePieces } from './native-lanes.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { alignNativeArcs } from './native-relation-alignment.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSystemCore } from './native-core.js'
import { nativeWholeRowFeasibility } from './native-height-feasibility.js'
import { nativeMusicAxis } from './native-axis.js'
import { nativeHeightEnvelope, mergeNativeHeightEnvelopes, nativeEnvelopeBlock, type NativeHeightEnvelope } from './native-height-envelope.js'

export type NativeRenderOptions = {
  systemCjk?: boolean
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  textMeasurementCache?: NumberedTextMeasurementCache
  layoutTask?: NativeLayoutTask
  pageMargin?: number; coreGap?: number
  /** Experimental measured-page ceiling; off until its interactive cost is acceptable. */
  pageConstrainedBreaks?: boolean
  rowEnvelope?: boolean
  /** Allows uncached parity measurements of the experimental solver. */
  cachePageLineGeometry?: boolean
  minimumNoteGap?: number; minimumNoteGapFloor?: number
  equalMeasures?: boolean; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number; arcGroup?: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { horizontalDensity?: number; unitRhythmicGap?: number; coreGap?: number; index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; arcContinuationLeft?: number; decorationLayout?: { lane: string; svg: string; hidden?: boolean }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
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
  alignNativeArcs(relations, projection)
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

/** Break complete measures first, splitting oversized measures at time columns. */
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions, leading: (measures: NativeMeasure[]) => number = () => 0, timings?: Record<string, number>, rowMinimums?: Map<string, number>, endsOverride?: readonly number[], planner?: (graph: NativeLineCandidate[][], fragments: NativeMeasure[]) => number[]): { lines: { measures: NativeMeasure[]; density: number }[]; ends: number[]; candidates: NativeLineCandidate[][] } {
  const graphStarted = timings ? performance.now() : 0
  const fragments = measures.flatMap(measure => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1)))
  const candidates: NativeLineCandidate[][] = Array.from({ length: fragments.length }, () => [])
  const ratio = options.wrapWidthRatio ?? 1
  for (let begin = 0; begin < fragments.length;) {
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
  if (timings) {
    timings.lineCandidateMs = (timings.lineCandidateMs ?? 0) + performance.now() - graphStarted
    timings.lineCandidateCount = (timings.lineCandidateCount ?? 0) + candidates.reduce((sum, list) => sum + list.length, 0)
  }
  const planningStarted = timings ? performance.now() : 0
  const lines: { measures: NativeMeasure[]; density: number }[] = []
  let start = 0
  const ends = endsOverride ? [...endsOverride] : planner ? planner(candidates, fragments) : planNativeLines(candidates, timings)
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
type NativeLayoutPreparation = { projection?: NativeProjection; expanded?: ReturnType<typeof keyedDisplayPerformance>; header: NativeHeaderPreparation; commonHeader?: NativeHeaderPreparation; relations?: NativeRelationPlan
  horizontal?: Map<string, HorizontalMinima>; rowMinimums?: Map<string, Map<string, number>>
  measureHeights?: Map<string, Map<string, NativeHeightEnvelope>>; rowHeights?: Map<string, Map<string, NativeHeightEnvelope>> }

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

export function layoutNativeScore(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, minimumQuality?: number): NativeLayout {
  validate(supplied)
  const cache = supplied.textMeasurementCache ?? new NumberedTextMeasurementCache()
  if (cache.synchronizeFonts() && timings) timings.textMeasureCacheResets = (timings.textMeasureCacheResets ?? 0) + 1
  supplied = { ...supplied, textMeasurementCache: cache }
  const taskPreparationStarted = timings ? performance.now() : 0
  const preparation = supplied.layoutTask?.preparationFor(document, supplied, cache) ?? { header: new Map() }
  if (timings) timings.taskPreparationMs = (timings.taskPreparationMs ?? 0) + performance.now() - taskPreparationStarted
  // Both tiers receive complete horizontal plans; page bounds can skip engraving.
  // Paper use wins before physical spacing cost; continuous and paged modes agree.
  const gaps = supplied.minimumNoteGap === undefined ? nativeStyle.noteGapCandidates : [supplied.minimumNoteGap]
  const trials = gaps.map(minimumNoteGap => ({ minimumNoteGap,
    trial: prepareNativeScoreAtGap(document, { ...supplied, paged: true, coreGap: nativeCoreGap(document), minimumNoteGap }, timings, preparation) }))
  if ((supplied.pageConstrainedBreaks !== true || supplied.rowEnvelope === true) && minimumQuality !== undefined && trials.every(({ trial }) => trial.score < minimumQuality))
    throw Object.assign(new Error('Width cannot improve the horizontal total cost'), { code: 'M3N_WIDTH_QUALITY_PRUNED' })
  trials.sort((a, b) => a.trial.tierCost - b.trial.tierCost || b.minimumNoteGap - a.minimumNoteGap)
  let selected: NativeLayout | undefined, selectedCost = Infinity
  let oversized: { error: Error; minimumNoteGap: number } | undefined
  for (const [trialIndex, { minimumNoteGap, trial }] of trials.entries()) {
    let candidate: NativeLayout
    try {
      if (timings) timings.completedLayoutTrials = (timings.completedLayoutTrials ?? 0) + 1
      candidate = (supplied.pageConstrainedBreaks !== true || supplied.rowEnvelope === true) ? trial.complete()
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
    if ((supplied.pageConstrainedBreaks !== true || supplied.rowEnvelope === true) && selected.pages.length === 1) {
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
}

function layoutNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation): NativeLayout {
  return prepareNativeScoreAtGap(document, supplied, timings, preparation).complete()
}
type NativePageTrialCache = { blocks: Map<string, NativePageBlock>; headers?: NativePageBlock[] }
type NativeGapTrial = { score: number; tierCost: number; systemCount: number; ends: number[]; candidates: NativeLineCandidate[][]; complete(cache?: NativePageTrialCache, pageLimit?: number): NativeLayout }

function completePageConstrainedTrial(document: ScoreDocument, supplied: NativeRenderOptions, trial: NativeGapTrial,
  preparation: NativeLayoutPreparation, timings?: Record<string, number>): NativeLayout {
  const rowCache: NativePageTrialCache | undefined = supplied.cachePageLineGeometry === false ? undefined : { blocks: new Map() }
  const greedyEnds = greedyNativeLines(trial.candidates)
  if (greedyEnds.length === trial.ends.length && greedyEnds.every((end, index) => end === trial.ends[index])) {
    if (timings) timings.pageBoundIdenticalPlans = (timings.pageBoundIdenticalPlans ?? 0) + 1
    return trial.complete()
  }
  const measure = (ends: number[]) => {
    const value = prepareNativeScoreAtGap(document, supplied, timings, preparation, ends).complete(rowCache)
    return { ends, pages: value.pages.length, value }
  }
  const started = timings ? performance.now() : 0
  let greedy: ReturnType<typeof measure>
  try { greedy = measure(greedyEnds) }
  catch (error) {
    if (error instanceof Error && error.message.includes('单个谱行')) return trial.complete(rowCache)
    throw error
  }
  if (timings) timings.pageBoundGreedyMs = (timings.pageBoundGreedyMs ?? 0) + performance.now() - started
  let optimum = { ends: trial.ends, pages: Infinity, value: greedy.value }
  try { const value = trial.complete(rowCache); optimum = { ends: trial.ends, pages: value.pages.length, value } }
  catch (error) { if (!(error instanceof Error && error.message.includes('单个谱行'))) throw error }
  if (timings && optimum.pages > greedy.pages) timings.pageBoundViolations = (timings.pageBoundViolations ?? 0) + 1
  return planNativeLinesWithinPages(trial.candidates, greedy, optimum, ends => {
    try {
      const value = prepareNativeScoreAtGap(document, supplied, timings, preparation, ends).complete(rowCache, greedy.pages)
      return { pages: value.pages.length, value }
    } catch (error) {
      const rejected = error as Error & { code?: string; pageCount?: number }
      if (rejected.code === 'M3N_PAGE_BOUND_REJECTED') return { pages: rejected.pageCount! }
      if (error instanceof Error && error.message.includes('单个谱行')) return { pages: Infinity }
      throw error
    }
  }, timings).value
}

function prepareNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation, endsOverride?: readonly number[], heightProbe = false): NativeGapTrial {
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
  if (!measurer && typeof window !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
    const context = window.document.createElement('canvas').getContext('2d')
    if (context) measurer = new CanvasTextMeasurer(context, timings, options.textMeasurementCache, true, options.systemCjk)
  }
  measurer ??= new DefaultTextMeasurer()
  const projectionStarted = timings ? performance.now() : 0
  let projection: NativeProjection
  if (preparation?.projection) {
    projection = cloneNativeProjection(preparation.projection)
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
  const header = nativeHeaderGeometry(headerDocument, options.width, margin, measurer, (nativeCoreGap(document) * .8), options, preparation?.header, preparation?.commonHeader)
  recordPart('headerGeometryMs', headerStarted)
  const headerHeight = header.height
  record('projectionMs')
  // These minima depend on immutable music, gap and equal-measure settings,
  // never on page width. Keep an unplaced measured projection for each gap;
  // row splitting and final placement still belong to this candidate alone.
  const horizontalKey = `${minimumNoteGap}:${minimumNoteGapFloor}:${options.equalMeasures ?? false}`
  const measuredProjection = preparation?.horizontal?.get(horizontalKey)
  if (measuredProjection) {
    for (const [index, measure] of projection.measures.entries()) {
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
  const arcLeading = (measures: NativeMeasure[]) => {
    const glyphs = measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    const firstByLane = new Map<string, NativeGlyph>()
    for (const glyph of glyphs) if (!firstByLane.has(glyph.lane)) firstByLane.set(glyph.lane,glyph)
    return Math.max(0,...relations.filter(relation => (relation.kind === 'tie' || relation.kind === 'slur')
      && firstByLane.get(relation.last.lane) === relation.last && !glyphs.includes(relation.first))
      .map(relation => nativeStyle.music * .45 * 1.2 - (relation.last.musicLeft ?? relation.last.left)))
  }
  if (preparation) preparation.rowMinimums ??= new Map()
  let rowMinimums = preparation?.rowMinimums?.get(horizontalKey)
  if (preparation && !rowMinimums) preparation.rowMinimums!.set(horizontalKey, rowMinimums = new Map())
  const heightKey = `${horizontalKey}:${options.coreGap ?? nativeCoreGap(document)}:${options.measureNumbers ?? false}:${margin}`
  let measureHeights: Map<string, NativeHeightEnvelope> | undefined
  let rowHeights: Map<string, NativeHeightEnvelope> | undefined
  const planningHeaderBlocks = options.rowEnvelope ? header.blocks.map(block => ({ height: block.height, ink: nativeSvgPieces(block.svg, measurer) })) : undefined
  if (options.rowEnvelope) {
    if (preparation) { preparation.measureHeights ??= new Map(); preparation.rowHeights ??= new Map() }
    measureHeights = preparation?.measureHeights?.get(heightKey)
    if (!measureHeights) {
      const heightStarted = timings ? performance.now() : 0
      const probeWidth = Math.ceil(Math.max(768, ...projection.measures.map(measure =>
        nativeHorizontalSpacing([measure], options).minimumWidth + arcLeading([measure]) + margin * 2)) + 64)
      const probe = prepareNativeScoreAtGap(headerDocument, { ...options, rowEnvelope: false, pageConstrainedBreaks: false,
        width: probeWidth, paged: false }, timings, preparation, undefined, true).complete()
      measureHeights = new Map(probe.systems.map((system, index) => {
        const block = probe.verticalBlocks[index + probe.headerBlocks.length]!
        const centre = (block.baseline ?? 0) + nativeMusicAxis(measurer)
        return [system.measures[0]!.id, nativeHeightEnvelope(block, centre, system.lanes.some(lane => lane.rows.length > 0))]
      }))
      preparation?.measureHeights?.set(heightKey, measureHeights)
      if (timings) {
        timings.measureHeightBuilds = (timings.measureHeightBuilds ?? 0) + measureHeights.size
        timings.measureHeightPreparationMs = (timings.measureHeightPreparationMs ?? 0) + performance.now() - heightStarted
      }
    }
    rowHeights = preparation?.rowHeights?.get(heightKey) ?? new Map()
    preparation?.rowHeights?.set(heightKey, rowHeights)
  }
  const envelopeFor = (measures: NativeMeasure[]) => {
    const key = measures.map(measure => measure.id).join(':')
    let envelope = rowHeights!.get(key)
    if (!envelope) {
      envelope = mergeNativeHeightEnvelopes(measures.map(measure => {
        const measured = measureHeights!.get(measure.id)
        if (!measured) throw new Error('Missing independently engraved measure height')
        if (timings) timings.measureHeightCacheHits = (timings.measureHeightCacheHits ?? 0) + 1
        return measured
      }))
      rowHeights!.set(key, envelope)
      if (timings) timings.rowHeightBuilds = (timings.rowHeightBuilds ?? 0) + 1
    } else if (timings) timings.rowHeightCacheHits = (timings.rowHeightCacheHits ?? 0) + 1
    return envelope
  }
  const blockFor = (measures: NativeMeasure[], centre = 0) => {
    const envelope = envelopeFor(measures)
    return { ...nativeEnvelopeBlock(envelope, options.width, centre), coreGapBefore: measures[0]?.coreGapBefore,
      coreGapScale: envelope.hasLyrics ? scoreLyricGapScale(nativeCoreGap(document)) : 1 }
  }
  const planner = options.rowEnvelope ? (graph: NativeLineCandidate[][], fragments: NativeMeasure[]) => {
    const ends = planNativeLines(graph, timings), greedyEnds = greedyNativeLines(graph)
    const measurePages = (plan: number[]) => {
      const started = timings ? performance.now() : 0
      let start = 0
      const blocks = [...planningHeaderBlocks!, ...plan.map(end => {
        const block = blockFor(fragments.slice(start, end)); start = end; return block
      })]
      const pages = prepareNativePagination(blocks, { wholeRows: true, nonCoreGapRatio: .3 })({
        pageHeight: Math.floor(options.width * A4_CONTENT_ASPECT_RATIO), margin,
        gap: options.coreGap ?? nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8 }).heights.length
      if (timings) {
        timings.cachedHeightPaginationChecks = (timings.cachedHeightPaginationChecks ?? 0) + 1
        timings.cachedHeightPaginationMs = (timings.cachedHeightPaginationMs ?? 0) + performance.now() - started
      }
      return { ends: plan, pages, value: plan }
    }
    const greedy = measurePages(greedyEnds), optimum = measurePages(ends)
    if (timings && optimum.pages > greedy.pages) timings.pageBoundViolations = (timings.pageBoundViolations ?? 0) + 1
    if (optimum.pages <= greedy.pages) return ends
    const canFit = nativeWholeRowFeasibility(graph, (start, end) => blockFor(fragments.slice(start, end)),
      planningHeaderBlocks!, { pageHeight: Math.floor(options.width * A4_CONTENT_ASPECT_RATIO),
        margin, gap: options.coreGap ?? nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8, ratio: .3 })
    return planNativeLinesWithinPages(graph, greedy, optimum, measurePages, timings, canFit).value
  } : undefined
  const linePlan = heightProbe ? { lines: projection.measures.map(measure => ({ measures: [measure], density: 1 })),
    ends: projection.measures.map((_, index) => index + 1), candidates: [] as NativeLineCandidate[][] }
    : breakMeasures(projection.measures, available, options, arcLeading, timings, rowMinimums, endsOverride, planner)
  const { lines } = linePlan
  record('lineBreakMs')
  const systems: NativeSystem[] = lines.map(({ measures, density }, index) => ({ horizontalDensity: density, unitRhythmicGap: nativeUnitRhythmicGap(measures, options, available - arcLeading(measures)), coreGap: nativeCoreGap(document), index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  record('horizontalQualityMs')
  // Named sections are labels within a projected part; expanded performances
  // can also introduce part boundaries. Neither a phrase nor {br} ends a section.
  const startsSection = (current: NativeSystem, previous: NativeSystem) => {
    return startsNativeSection(current.measures[0]!, previous.measures.at(-1))
  }
  const systemOf = new Map<NativeGlyph, number>()
  const placeSystem = (system: NativeSystem) => {
    const leading = arcLeading(system.measures)
    const x = margin + leading
    if (leading > 0) system.arcContinuationLeft = margin
    let width = options.width - margin - x
    const previous = systems[system.index - 1], next = systems[system.index + 1]
    if (previous && !startsSection(system, previous) && (!next || startsSection(next, system))) {
      width = nativeLastLineWidth(nativeHorizontalSpacing(system.measures, options), width,
        nativeHorizontalSpacing(previous.measures, options), available - arcLeading(previous.measures))
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
  }
  const horizontal = { options, margin, systems, pages: [] }
  const quality = nativeLayoutQuality(horizontal)
  return { score: 1 / (1 + quality.totalCost), tierCost: quality.spacingCost + quality.overflowCost, systemCount: systems.length, ends: linePlan.ends, candidates: linePlan.candidates, complete: (rowCache, pageLimit) => {
  stageStarted = timings ? performance.now() : 0
  for (const system of systems) placeSystem(system)
  record('horizontalPlacementMs')
  // Arc fragments and endings are row-local. Hairpins depend on all segment
  // lengths; split tuplets read external endpoints, so neither may reuse rows.
  const cacheSafe = rowCache && !relations.some(relation => relation.kind === 'cresc' || relation.kind === 'decres'
    || relation.kind === 'tuplet' && systemOf.get(relation.first) !== systemOf.get(relation.last))
  const rowKeys = cacheSafe ? systems.map(system => JSON.stringify([
    system.measures.map(measure => measure.id), system.arcContinuationLeft,
    system.measures.map(measure => [measure.start, measure.end, measure.columns.map(column => column.x)]),
  ])) : undefined
  const headerBlocks = planningHeaderBlocks ?? rowCache?.headers ?? header.blocks.map(block => ({ height: block.height, ink: nativeSvgPieces(block.svg, measurer) }))
  if (rowCache) rowCache.headers = headerBlocks
  if (pageLimit !== undefined && rowKeys && rowKeys.every(key => rowCache!.blocks.has(key))) {
    const cachedBlocks = [...headerBlocks, ...rowKeys.map(key => rowCache!.blocks.get(key)!)]
    const pagination = prepareNativePagination(cachedBlocks)({ pageHeight: Math.floor(options.width * A4_CONTENT_ASPECT_RATIO),
      margin, gap: options.coreGap ?? nativeCoreGap(document), headerGap: nativeCoreGap(document) * .8 })
    if (timings) timings.pageBoundCachedPaginationChecks = (timings.pageBoundCachedPaginationChecks ?? 0) + 1
    if (pagination.heights.length > pageLimit) {
      if (timings) timings.pageBoundCachedRejections = (timings.pageBoundCachedRejections ?? 0) + 1
      throw Object.assign(new Error('Cached row geometry exceeds the greedy page ceiling'), {
        code: 'M3N_PAGE_BOUND_REJECTED', pageCount: pagination.heights.length })
    }
  }
  const relationBounds = new Map<NativeSystem, NativeRegion[]>()
  for (const system of systems) {
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
  for (const system of systems) placeNativeBarLabels(system, relationBounds.get(system)!, measurer, Boolean(options.measureNumbers), options.width)
  const relationsStarted = timings ? performance.now() : 0
  // Populate peers before measuring any relation; adjacent groups share height.
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = first; index <= last; index++) {
      if (relation.kind === 'inst' && index !== first && index !== last) continue
      systems[index]!.relations.push(relation)
    }
  }
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = first; index <= last; index++) {
      if (relation.kind === 'inst' && index !== first && index !== last) continue
      const system = systems[index]!
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
        const pieces = relation.kind === 'inst' ? nativeSvgPieces(placed.svg, measurer) : [placed.ink]
        bounds.push(...pieces.map(ink => ({ lane: lane.id, left: ink.left, right: ink.right, top: -ink.top, arc: placed.arc })))
        relationBounds.set(system, bounds)
      }
    }
  }
  recordPart('relationsMs', relationsStarted)
  // Single-note marks already belong to the measured note and its arc port.
  // Dynamics and expression text clear relations outside that local stack.
  const symbols = new NativeSymbols(measurer)
  for (const system of systems) {
    const regions = relationBounds.get(system) ?? []
    const outerMarks = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .flatMap(glyph => glyph.marks.filter(name => !nativeInnerMark(name)).map(name => ({ glyph, name })))
      .sort((a, b) => nativeMarkRank(a.name) - nativeMarkRank(b.name))
    // Local marks and tuplet brackets have already entered regions, including
    // a neighboring note's ornament or fingering that overlaps this expression.
    for (const { glyph, name } of outerMarks) {
      const ink = nativeSvgInk(symbols.rawMark(name), measurer)
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
  placeNativeVoltas(systems, relationBounds, measurer, options.width)
  recordPart('voltasMs', voltasStarted)
  // Place chord names before local descriptions and section headings.
  for (const system of systems) {
    const regions = relationBounds.get(system) ?? []
    relationBounds.set(system, regions)
    placeNativeAnnotations(system, regions, measurer, options.width, margin, false)
  }
  for (const system of systems) placeNativeNavigation(system)
  const lyricsStarted = timings ? performance.now() : 0
  for (const system of systems) for (const lane of system.lanes) placeNativeLyrics(system, lane, measurer)
  recordPart('lyricsPlacementMs', lyricsStarted)
  for (const system of systems) {
    const hasHeading = system.measures.some(measure => measure.columns.some(column => column.glyphs.some(glyph => glyph.event?.sectionLabelBreakAfter)))
    const coreTops = hasHeading ? new Map([...nativeLanePieces(system, measurer, true)]
      .map(([lane, pieces]) => [lane, Math.max(0, ...pieces.map(piece => -piece.top))])) : undefined
    placeNativeAnnotations(system, relationBounds.get(system)!, measurer, options.width, margin, true, coreTops)
  }
  record('decorationsLyricsMs')
  const blocks = [...headerBlocks, ...systems.map(system => {
    const height = placeNativeLanes(system)
    if (options.rowEnvelope) return blockFor(system.measures, (system.lanes[0]?.y ?? 0) + nativeMusicAxis(measurer))
    let geometryStarted = timings ? performance.now() : 0
    const pieces = nativeLanePieces(system, measurer)
    if (timings) { timings.laneInkMs = (timings.laneInkMs ?? 0) + performance.now() - geometryStarted; geometryStarted = performance.now() }
    const core = nativeSystemCore(system, measurer) ?? { top: 0, bottom: height }
    if (timings) timings.coreInkMs = (timings.coreInkMs ?? 0) + performance.now() - geometryStarted
    const ink = system.lanes.flatMap(lane => (pieces.get(lane.id) ?? []).map(piece => ({ ...piece, top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
    ink.push(...nativeSvgPieces(nativeVoiceConnectorSvg(system, margin, measurer), measurer))
    const boundaryInk = (system.decorationLayout ?? []).filter(decoration => decoration.svg.includes('data-m3n-role="measure-number"'))
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
  const layout: NativeLayout = { document, headerDocument, projection, systems, pages: [], relations, options, measurer, headerHeight, margin,
    pagination: prepareNativePagination(blocks, options.rowEnvelope ? { wholeRows: true, nonCoreGapRatio: .3 } : {}), verticalBlocks: blocks, headerBlocks: header.blocks }
  const gap = options.coreGap ?? (nativeCoreGap(document))
  const pageFitStarted = timings ? performance.now() : 0
  const pagination = layout.pagination({ pageHeight: options.paged ? Math.floor(options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin, gap, headerGap: nativeCoreGap(document) * .8, maxGap: options.coreGap ?? (options.paged ? Math.max(scoreMaximumCoreGap(nativeCoreGap(document)), gap) : gap) })
  positionNativeLayout(layout, pagination)
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
