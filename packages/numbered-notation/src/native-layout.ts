import { scoreLyricGapScale, scoreMaximumCoreGap } from './score-layout-policy.js'
import { SCORE_NUMBER_FONT } from './font-family.js'
import { nativeLayoutScore } from './native-quality.js'
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
export { wrapNativeText } from './native-header.js'
import { measureNativeHorizontal, nativeMeasureBars, nativeHorizontalSpacing, nativeLastLineWidth, placeNativeHorizontal } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, NumberedTextMeasurementCache, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, cloneNativeProjection, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'
import { placeNativeLanes, nativeLanePieces } from './native-lanes.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { alignNativeArcs } from './native-relation-alignment.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSystemCore } from './native-core.js'

export type NativeRenderOptions = {
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  textMeasurementCache?: NumberedTextMeasurementCache
  layoutTask?: NativeLayoutTask
  pageMargin?: number; coreGap?: number; minimumNoteGap?: number; minimumNoteGapFloor?: number
  equalMeasures?: boolean; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number; arcGroup?: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { coreGap?: number; index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; arcContinuationLeft?: number; decorationLayout?: { lane: string; svg: string; hidden?: boolean }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
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

export function prepareNativeRelations(document: ScoreDocument, projection: NativeProjection): NativeRelation[] {
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

/** Break complete measures first, splitting oversized measures at time columns. */
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions, leading: (measures: NativeMeasure[]) => number = () => 0): NativeMeasure[][] {
  const fragments = measures.flatMap(measure => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1)))
  const lines: NativeMeasure[][] = []
  const ratio = options.wrapWidthRatio ?? 1
  for (let begin = 0; begin < fragments.length;) {
    let end = begin + 1
    while (end < fragments.length && !fragments[end]!.breakBefore && !fragments[end - 1]!.breakAfter) end++
    const group = fragments.slice(begin, end), candidates: NativeLineCandidate[][] = Array.from({ length: group.length }, () => [])
    // A bar merged into the next repeat opening reappears at a row end;
    // changed boundary bars require the actual row constraint chain.
    const boundaries = group.map((measure, index) => {
      const joined = nativeMeasureBars(group, index), isolated = nativeMeasureBars([measure], 0)
      return {
        changedOpening: joined.opening !== isolated.opening,
        changedClosing: joined.closing !== isolated.closing,
      }
    })
    for (let index = group.length - 1; index >= 0; index--) {
      let minimum = 0, widestMinimum = 0
      const available = Math.max(1, width * ratio - leading([group[index]!]))
      for (let stop = index; stop < group.length; stop++) {
        const measure = group[stop]!, count = stop - index + 1
        minimum += measure.minimum
        widestMinimum = Math.max(widestMinimum, measure.minimum)
        const equal = options.equalMeasures
        let minWidth = equal ? widestMinimum * count : measure.minimumEnd !== undefined && group[index]!.minimumStart !== undefined ? measure.minimumEnd - group[index]!.minimumStart! : minimum
        if (boundaries[index]!.changedOpening || boundaries[stop]!.changedClosing)
          minWidth = nativeHorizontalSpacing(group.slice(index, stop + 1), options).minimumWidth
        if (minWidth > available && count > 1) break
        candidates[index]!.push({ end: stop + 1, density: minWidth / available })
      }
    }
    let index = 0
    for (const stop of planNativeLines(candidates)) { lines.push(group.slice(index, stop)); index = stop }
    begin = end
  }
  return lines
}

type NativeRelationPlan = Array<Omit<NativeRelation, 'first' | 'last'> & { first: number; last: number }>
type HorizontalMinima = Array<Pick<NativeMeasure, 'minimum' | 'minimumStart' | 'minimumEnd'> & {
  columns: Array<{ minimumStart?: number; minimumEnd?: number }>
}>
type NativeLayoutPreparation = { projection?: NativeProjection; expanded?: ReturnType<typeof keyedDisplayPerformance>; header: NativeHeaderPreparation; commonHeader?: NativeHeaderPreparation; relations?: NativeRelationPlan
  horizontal?: Map<string, HorizontalMinima> }

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
    const key = JSON.stringify([options.fixedDo ?? false, options.transpose ?? 0, options.tempoScale ?? 1, options.includeBass ?? true])
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
  // Explicit spacing remains a fixed engraving override. Automatic spacing is
  // selected against the same virtual A4 pages in continuous and paged views;
  // custom vertical gaps must not change the horizontal line breaks.
  if (supplied.minimumNoteGap !== undefined) return layoutNativeScoreAtGap(document, supplied, timings, supplied.layoutTask ? preparation : undefined)
  const minimumCoreGap = nativeCoreGap(document)
  const horizontalTrials = new Map<number, ReturnType<typeof prepareNativeScoreAtGap>>()
  if (minimumQuality !== undefined) {
    for (const minimumNoteGap of [nativeStyle.minimumNoteGap, ...nativeStyle.noteGapCandidates.slice(1).reverse()]) {
      horizontalTrials.set(minimumNoteGap, prepareNativeScoreAtGap(document, { ...supplied, paged: true, coreGap: minimumCoreGap, minimumNoteGap }, timings, preparation))
    }
    const baselineRows = horizontalTrials.get(nativeStyle.minimumNoteGap)!.systemCount
    if ([...horizontalTrials.values()].filter(trial => trial.systemCount <= baselineRows).every(trial => trial.score < minimumQuality))
      throw Object.assign(new Error('Width cannot improve the one-page quality score'), { code: 'M3N_WIDTH_QUALITY_PRUNED' })
  }
  let baseline: NativeLayout
  try {
    baseline = horizontalTrials.get(nativeStyle.minimumNoteGap)?.complete() ?? layoutNativeScoreAtGap(document, { ...supplied, paged: true, coreGap: minimumCoreGap, minimumNoteGap: nativeStyle.minimumNoteGap }, timings, preparation)
  } catch (error) {
    // Continuous engraving still supports a single row taller than A4.
    if (!supplied.paged && error instanceof Error && error.message.includes('单个谱行')) {
      return layoutNativeScoreAtGap(document, { ...supplied, minimumNoteGap: nativeStyle.minimumNoteGap }, timings)
    }
    throw error
  }
  let selected = baseline
  let selectedScore = nativeLayoutScore(selected)
  for (const minimumNoteGap of nativeStyle.noteGapCandidates.slice(1).reverse()) {
    let candidate: NativeLayout
    try {
      const trial = horizontalTrials.get(minimumNoteGap)
      if (trial) {
        if (trial.systemCount > selected.systems.length || trial.systemCount === selected.systems.length
          && (trial.score < selectedScore || trial.score === selectedScore && minimumNoteGap >= selected.options.minimumNoteGap!)) continue
        candidate = trial.complete()
      } else candidate = layoutNativeScoreAtGap(document, { ...supplied, paged: true, coreGap: minimumCoreGap,
        minimumNoteGap, textMeasurer: baseline.measurer }, timings, preparation, { layout: selected, score: selectedScore })
    } catch (error) {
      // Wider spacing can make a decorated row too tall for one A4 page.
      // Other layout failures remain visible instead of becoming fallbacks.
      if (error instanceof Error && error.message.includes('单个谱行')) continue
      throw error
    }
    const score = nativeLayoutScore(candidate)
    if (candidate.systems.length < selected.systems.length || candidate.systems.length === selected.systems.length
      && (score > selectedScore || score === selectedScore && candidate.options.minimumNoteGap! < selected.options.minimumNoteGap!)) {
      selected = candidate
      selectedScore = score
    }
  }
  const repaginationStarted = timings ? performance.now() : 0
  repaginateNativeLayout(selected, supplied.paged, supplied.coreGap)
  if (timings) timings.repaginationMs = (timings.repaginationMs ?? 0) + performance.now() - repaginationStarted
  return selected
}

function layoutNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation, selection?: { layout: NativeLayout; score: number }): NativeLayout {
  return prepareNativeScoreAtGap(document, supplied, timings, preparation, selection).complete()
}
function prepareNativeScoreAtGap(document: ScoreDocument, supplied: NativeRenderOptions, timings?: Record<string, number>, preparation?: NativeLayoutPreparation, selection?: { layout: NativeLayout; score: number }): { score: number; systemCount: number; complete(): NativeLayout } {
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
    if (context) measurer = new CanvasTextMeasurer(context, timings, options.textMeasurementCache, true)
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
    relations = prepareNativeRelations(document, projection)
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
      measure.minimumStart = measured.minimumStart; measure.minimumEnd = measured.minimumEnd
      for (const [columnIndex, column] of measure.columns.entries()) {
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
        columns: measure.columns.map(column => ({ minimumStart: column.minimumStart, minimumEnd: column.minimumEnd })),
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
  const lines = breakMeasures(projection.measures, available, options, arcLeading)
  record('lineBreakMs')
  const systems: NativeSystem[] = lines.map((measures, index) => ({ coreGap: nativeCoreGap(document), index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  // Named sections are labels within a projected part; expanded performances
  // can also introduce part boundaries. Neither a phrase nor {br} ends a section.
  const startsSection = (current: NativeSystem, previous: NativeSystem) => {
    const first = current.measures[0]!
    return first.part !== previous.measures.at(-1)!.part
      || !first.continuation && first.source.events.some(event => event.sectionLabel)
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
  // Quality reads every row's unplaced minima, and only the final row's
  // painted right edge. Place that row first; losing trials never need the
  // other rows' glyphs, bars or lane geometry.
  const lastSystem = systems.at(-1)
  if (lastSystem) placeSystem(lastSystem)
  record('horizontalPlacementMs')
  // Gap ranking uses only horizontal rows and quality. A losing trial cannot
  // become the winner through vertical fitting, so do not build its curves,
  // lyric envelopes and page collision geometry. The baseline still receives
  // full validation, and every replacement must complete the same engraving.
  if (selection) {
    const score = nativeLayoutScore({ options, margin, systems, pages: [] })
    const previous = selection.layout
    const wins = systems.length < previous.systems.length || systems.length === previous.systems.length
      && (score > selection.score || score === selection.score && minimumNoteGap < previous.options.minimumNoteGap!)
    if (!wins) {
      if (timings) timings.horizontalRejectedTrials = (timings.horizontalRejectedTrials ?? 0) + 1
      return { score: selection.score, systemCount: previous.systems.length, complete: () => previous }
    }
  }
  return { score: nativeLayoutScore({ options, margin, systems, pages: [] }), systemCount: systems.length, complete: () => {
  stageStarted = timings ? performance.now() : 0
  for (const system of systems) if (system !== lastSystem) placeSystem(system)
  record('horizontalPlacementMs')
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
  const blocks = [...header.blocks.map(block=>({height:block.height, ink: nativeSvgPieces(block.svg, measurer)})), ...systems.map(system => {
    const height = placeNativeLanes(system)
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
    return { height, baseline: system.lanes[0]?.y ?? 0, core, coreGapScale, ink, boundaryInk, gapBefore: system.measures[0]?.extraGap ?? 0 }
  })]
  const layout: NativeLayout = { document, headerDocument, projection, systems, pages: [], relations, options, measurer, headerHeight, margin,
    pagination: prepareNativePagination(blocks), verticalBlocks: blocks, headerBlocks: header.blocks }
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
