import { hasPassKeys } from '@m3n/notation'
import { A4_CONTENT_ASPECT_RATIO } from '@m3n/notation'
import { keyedDisplayPerformance } from './display-performance.js'
import { nativeBarSvg, nativeLaneBarPositions } from './native-bars.js'
import { nativeStyle } from './native-style.js'
import { placeNativeNavigation, placeNativeBarLabels } from './native-system-labels.js'
import { placeNativeVoltas } from './native-volta-layout.js'
import { placeNativeLyrics } from './native-lyrics.js'
import { placeNativeRelation, type NativeRelationLayout } from './native-relations.js'
import { nativeMarkStack, nativeInnerMark, nativeMarkRank } from './native-marks.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { placeNativeAnnotations, nativeRegionTop, type NativeRegion } from './native-annotations.js'
import { type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import { paginateNativeBlocks, type NativePageBlock } from './native-pagination.js'
import { nativeHeaderGeometry } from './native-header.js'
import { splitNativeMeasure } from './native-wrapping.js'
import { planNativeLines, type NativeLineCandidate } from './native-line-breaking.js'
export { wrapNativeText } from './native-header.js'
import { measureNativeHorizontal, nativeHorizontalSpacing, nativeLastLineWidth, placeNativeHorizontal } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'
import { placeNativeLanes, nativeLanePieces } from './native-lanes.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { alignNativeArcs } from './native-relation-alignment.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeSystemCore } from './native-core.js'

export type NativeRenderOptions = {
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  pageMargin?: number; coreGap?: number; minimumNoteGapEm?: number; minimumNoteGapFloorEm?: number
  equalMeasures?: boolean; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number; arcGroup?: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; arcContinuationLeft?: number; decorationLayout?: { lane: string; svg: string }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
export type NativePage = { coreGap?: number; header?: string; index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; headerDocument: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
  verticalBlocks: NativePageBlock[]; headerBlocks: { height: number; svg: string }[]
}

function validate(options: NativeRenderOptions) {
  if (options.transpose !== undefined && !Number.isInteger(options.transpose)) throw new Error('谱面移调必须为整数半音数。')
  if (options.tempoScale !== undefined && (!Number.isFinite(options.tempoScale) || options.tempoScale <= 0)) throw new Error('显示速度倍率必须为正有限数值。')
  if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
  for (const value of [options.pageMargin, options.coreGap]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('简谱页边距和行距必须为非负有限数值。')
  if (options.minimumNoteGapEm !== undefined && (!Number.isFinite(options.minimumNoteGapEm) || options.minimumNoteGapEm < 0)) throw new Error('最小音符间距必须为非负有限数值。')
  if (options.wrapWidthRatio !== undefined && (!Number.isFinite(options.wrapWidthRatio) || options.wrapWidthRatio <= 0 || options.wrapWidthRatio > 1)) throw new Error('wrapWidthRatio 必须大于 0 且不大于 1。')
}

function relationsFor(document: ScoreDocument, projection: NativeProjection): NativeRelation[] {
  const byEvent = new Map<ScoreEvent, NativeGlyph[]>()
  for (const glyph of projection.glyphs) if (glyph.event) byEvent.set(glyph.event, [...(byEvent.get(glyph.event) ?? []), glyph])
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
      if (event.kind === 'tuplet') relations.push({ kind: 'tuplet', first, last: glyphs.at(-1)!, label: String(event.tuplet?.num ?? glyphs.length), level: 0 })
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
  // Rhythm brackets precede arcs, including a short tie from their last child.
  // Arcs stay inside expression hairpins regardless of the respective spans.
  // Within each layer, inner relations precede outer ones; all fragments
  // retain that ordering through wrapping/pagination.
  const order = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
  const layer = (relation: NativeRelation) => relation.kind === 'tuplet' ? 0
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

/** Break complete measures first, splitting oversized measures at time columns. */
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions, leading: (measures: NativeMeasure[]) => number = () => 0): NativeMeasure[][] {
  const fragments = measures.flatMap((measure, index) => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1), index === measures.length - 1))
  const lines: NativeMeasure[][] = []
  const ratio = options.wrapWidthRatio ?? 1
  for (let begin = 0; begin < fragments.length;) {
    let end = begin + 1
    while (end < fragments.length && !fragments[end]!.breakBefore && !fragments[end - 1]!.breakAfter) end++
    const group = fragments.slice(begin, end), candidates: NativeLineCandidate[][] = Array.from({ length: group.length }, () => [])
    for (let index = group.length - 1; index >= 0; index--) {
      let minimum = 0, widestMinimum = 0
      const available = Math.max(1, width * ratio - leading([group[index]!]))
      for (let stop = index; stop < group.length; stop++) {
        const measure = group[stop]!, count = stop - index + 1
        minimum += measure.minimum
        widestMinimum = Math.max(widestMinimum, measure.minimum)
        const equal = options.equalMeasures
        const minWidth = equal ? widestMinimum * count : measure.minimumEnd !== undefined && group[index]!.minimumStart !== undefined ? measure.minimumEnd - group[index]!.minimumStart! : minimum
        if (minWidth > available && count > 1) break
        candidates[index]!.push({ end: stop + 1, density: minWidth / available })
      }
    }
    let index = 0
    for (const stop of planNativeLines(candidates, { relaxLastLine: end === fragments.length })) { lines.push(group.slice(index, stop)); index = stop }
    begin = end
  }
  return lines
}

export function layoutNativeScore(document: ScoreDocument, supplied: NativeRenderOptions): NativeLayout {
  validate(supplied)
  if (document.minimumCoreGapEm !== undefined && (!Number.isFinite(document.minimumCoreGapEm) || document.minimumCoreGapEm < 0)) throw new Error('最小行距必须为非负有限数值。')
  const headerDocument = document
  const expanded = supplied.fixedDo && (document.orderKeys?.some(Boolean) || hasPassKeys(document)) ? keyedDisplayPerformance(document) : undefined
  if (expanded) document = expanded.document
  const minimumNoteGapEm = supplied.minimumNoteGapEm ?? 0.4
  const minimumNoteGapFloorEm = supplied.minimumNoteGapFloorEm ?? 0
  if (!Number.isFinite(minimumNoteGapFloorEm) || minimumNoteGapFloorEm < 0 || minimumNoteGapFloorEm > minimumNoteGapEm) throw new Error('最小间距下限必须非负且不大于最小基础间距。')
  const options = { ...supplied, width: Math.max(320, Math.round(supplied.width)), minimumNoteGapEm, minimumNoteGapFloorEm, equalMeasures: supplied.equalMeasures ?? document.equalMeasures }
  const margin = options.pageMargin ?? 32
  if (margin * 2 + 40 > options.width) throw new Error('简谱页边距过大。')
  let measurer = options.textMeasurer
  if (!measurer && typeof window !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
    const context = window.document.createElement('canvas').getContext('2d')
    if (context) {
      measurer = new CanvasTextMeasurer(context)
    }
  }
  measurer ??= new DefaultTextMeasurer()
  const projection = projectNativeScore(document, { ...options, textMeasurer: measurer, displayLyrics: expanded?.lyrics, expandedDisplay: Boolean(expanded) })
  const relations = relationsFor(document, projection), available = options.width - 2 * margin
  const header = nativeHeaderGeometry(headerDocument, options.width, margin, measurer, nativeStyle.headerGap, options)
  const headerHeight = header.height
  measureNativeHorizontal(projection.measures, options)
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
  const systems: NativeSystem[] = lines.map((measures, index) => ({ index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  let lastWidth: number | undefined
  const last = systems.at(-1), previous = systems.at(-2)
  if (last && previous && last.measures[0]?.part === previous.measures.at(-1)?.part) {
    lastWidth = nativeLastLineWidth(nativeHorizontalSpacing(last.measures, options), available - arcLeading(last.measures),
      nativeHorizontalSpacing(previous.measures, options), available - arcLeading(previous.measures))
  }
  const systemOf = new Map<NativeGlyph, number>()
  for (const system of systems) {
    const leading = arcLeading(system.measures)
    const x = margin + leading
    if (leading > 0) system.arcContinuationLeft = margin
    const width = system === last && lastWidth !== undefined ? lastWidth : options.width - margin - x
    const glyphs = placeNativeHorizontal(system.measures, options, x, width)
    for (const glyph of glyphs) systemOf.set(glyph, system.index)
    const laneNames = [...new Set(glyphs.map(glyph => glyph.lane))].sort((a, b) => a === 'melody' ? -1 : b === 'melody' ? 1 : a === 'bass' ? 1 : b === 'bass' ? -1 : a.localeCompare(b))
    for (const lane of laneNames) {
      const members = glyphs.filter(glyph => glyph.lane === lane)
      const rows = [...new Set(members.flatMap(glyph => [...glyph.lyrics].filter(([, row]) => row.annotation || row.texts.some(text => text.replaceAll('\u200B', '').trim())).map(([row]) => row)))].sort((a, b) => a - b)
      const bars = system.measures.flatMap((_, index) => nativeLaneBarPositions(system.measures, index, lane))
        .map(bar => nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer))
      const bodyBottom = Math.max(0, ...bars.map(ink => ink.bottom), ...members.map(glyph => glyph.bottom))
      const lyricBottom = Math.max(...members.map(glyph => glyph.musicBottom ?? glyph.bottom))
      system.lanes.push({ id: lane, y: 0, top: Math.max(0, ...bars.map(ink => -ink.top), ...members.map(glyph => glyph.top)), bodyBottom, lyricBottom, bottom: bodyBottom, rows })
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
        const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
        regions.push({ lane: lane.id, left: ink.left, right: ink.right, top: -ink.top, headingClearance: nativeStyle.music * (2 / 22) })
      }
    }
    relationBounds.set(system, regions)
  }
  for (const system of systems) placeNativeBarLabels(system, relationBounds.get(system)!, measurer, Boolean(options.measureNumbers), options.width)
  // Populate peers before measuring any relation; adjacent groups share height.
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = first; index <= last; index++) systems[index]!.relations.push(relation)
  }
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = first; index <= last; index++) {
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
  // Articulations belong to the note; ornaments and expression text clear
  // relations outside it. Never turn a trill or dynamic into an arc endpoint.
  const symbols = new NativeSymbols(measurer)
  for (const system of systems) {
    const regions = relationBounds.get(system) ?? []
    const outerMarks = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .flatMap(glyph => glyph.marks.filter(name => !nativeInnerMark(name)).map(name => ({ glyph, name })))
      .sort((a, b) => nativeMarkRank(a.name) - nativeMarkRank(b.name))
    // Keep expression outside ornaments even when a neighboring note's wider
    // ornament overlaps it. Tuplet brackets have already entered regions.
    for (const { glyph, name } of outerMarks) {
      const ink = nativeSvgInk(symbols.rawMark(name), measurer)
      const x = Math.max(margin - ink.left, Math.min(glyph.x, options.width - margin - ink.right))
      const left = x + ink.left, right = x + ink.right
      const top = Math.max(0, ...regions.filter(r => r.lane === glyph.lane && r.right >= left && r.left <= right).map(r => nativeRegionTop(r, left, right)))
      const mark = nativeMarkStack([name], top, measurer).items[0]!
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
  placeNativeVoltas(systems, relationBounds, measurer, options.width)
  // Place chord names before local descriptions and section headings.
  for (const system of systems) {
    const regions = relationBounds.get(system) ?? []
    relationBounds.set(system, regions)
    placeNativeAnnotations(system, regions, measurer, options.width, margin, false)
  }
  for (const system of systems) placeNativeNavigation(system)
  for (const system of systems) for (const lane of system.lanes) placeNativeLyrics(system, lane, measurer)
  for (const system of systems) {
    const hasHeading = system.measures.some(measure => measure.columns.some(column => column.glyphs.some(glyph => glyph.event?.sectionLabelBreakAfter)))
    const coreTops = hasHeading ? new Map([...nativeLanePieces(system, measurer, true)]
      .map(([lane, pieces]) => [lane, Math.max(0, ...pieces.map(piece => -piece.top))])) : undefined
    placeNativeAnnotations(system, relationBounds.get(system)!, measurer, options.width, margin, true, coreTops)
  }
  const blocks = [...header.blocks.map(block=>({height:block.height, ink: nativeSvgPieces(block.svg, measurer)})), ...systems.map(system => {
    const height = placeNativeLanes(system)
    const pieces = nativeLanePieces(system, measurer)
    const core = nativeSystemCore(system, measurer) ?? { top: 0, bottom: height }
    const ink = system.lanes.flatMap(lane => (pieces.get(lane.id) ?? []).map(piece => ({ ...piece, top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
    ink.push(...nativeSvgPieces(nativeVoiceConnectorSvg(system, margin, measurer), measurer))
    return { height, baseline: system.lanes[0]?.y ?? 0, core, ink, gapBefore: system.measures[0]?.extraGap ?? 0 }
  })]
  const layout: NativeLayout = { document, headerDocument, projection, systems, pages: [], relations, options, measurer, headerHeight, margin,
    verticalBlocks: blocks, headerBlocks: header.blocks }
  const gap = options.coreGap ?? (document.minimumCoreGapEm !== undefined ? document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap)
  const pagination = paginateNativeBlocks(blocks, { pageHeight: options.paged ? Math.floor(options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin, gap, maxGap: options.coreGap ?? (options.paged ? Math.max(32, gap) : gap), elastic: true })
  positionNativeLayout(layout, pagination)
  return layout
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
  return paginateNativeBlocks(layout.verticalBlocks, { pageHeight: Infinity, margin: layout.margin, gap: coreGap, elastic: true })
}

/** Change page membership and vertical spacing without repeating horizontal layout. */
export function repaginateNativeLayout(layout: NativeLayout, paged: boolean, coreGap?: number) {
  const gap = coreGap ?? (layout.document.minimumCoreGapEm !== undefined ? layout.document.minimumCoreGapEm * nativeStyle.music : nativeStyle.minimumCoreGap)
  const pagination = paginateNativeBlocks(layout.verticalBlocks, {
    pageHeight: paged ? Math.floor(layout.options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin: layout.margin, gap, maxGap: coreGap ?? (paged ? Math.max(32, gap) : gap), elastic: true,
  })
  layout.options = { ...layout.options, paged, coreGap }
  positionNativeLayout(layout, pagination)
}

export function reflowNativeContinuousLayout(layout: NativeLayout, coreGap: number) {
  if (layout.options.paged) throw new Error('Only continuous layouts can be reflowed as a shared page')
  positionNativeLayout(layout, nativeContinuousPagination(layout, coreGap))
  layout.options = { ...layout.options, coreGap }
}
