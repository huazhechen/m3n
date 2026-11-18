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
import { paginateNativeBlocks } from './native-pagination.js'
import { nativeHeaderGeometry } from './native-header.js'
import { splitNativeMeasure } from './native-wrapping.js'
export { wrapNativeText } from './native-header.js'
import { measureNativeHorizontal, placeNativeHorizontal } from './native-horizontal.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'
import { placeNativeLanes, nativeLanePieces } from './native-lanes.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { alignNativeArcs } from './native-relation-alignment.js'
import { placedNativeControlInk } from './native-controls.js'
import { nativeUniformHosts, shareNativeUniformHeight } from './native-uniform-height.js'

export type NativeRenderOptions = {
  fixedDo?: boolean; transpose?: number; tempoScale?: number
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  pageMargin?: number; systemGap?: number; noteGapEm?: number; minimumNoteGapEm?: number; minimumNoteGapFloorEm?: number; uniformSystemHeight?: boolean
  equalMeasures?: boolean; wrap?: 'normal' | 'compact'; wrapWidthRatio?: number
  /** @internal Whether a separate minimum spacing policy was requested. */
  pairedSpacing?: boolean
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number; arcGroup?: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; lyricBottom?: number; rows: number[] }
export type NativeSystem = { index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[]; decorationLayout?: { lane: string; svg: string; paragraph?: string }[]; relationLayout?: Map<NativeRelation, NativeRelationLayout>; voltas?: { left: number; right: number; ending: string; top: number; svg: string }[] }
export type NativePage = { header?: string; index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; headerDocument: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
}

function validate(options: NativeRenderOptions) {
  if (options.transpose !== undefined && !Number.isInteger(options.transpose)) throw new Error('谱面移调必须为整数半音数。')
  if (options.tempoScale !== undefined && (!Number.isFinite(options.tempoScale) || options.tempoScale <= 0)) throw new Error('显示速度倍率必须为正有限数值。')
  if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
  for (const value of [options.pageMargin, options.systemGap]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('简谱页边距和行距必须为非负有限数值。')
  if (options.noteGapEm !== undefined && (!Number.isFinite(options.noteGapEm) || options.noteGapEm < 0)) throw new Error('音符间距比例必须为非负有限数值。')
  if (options.minimumNoteGapEm !== undefined && (!Number.isFinite(options.minimumNoteGapEm) || options.minimumNoteGapEm < 0 || options.minimumNoteGapEm > (options.noteGapEm ?? 0.6))) throw new Error('最小间距必须非负且不大于自然间距。')
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
  // Alternative lanes can span several measures, but never tie to a main lane.
  const lanes = new Map<string, NativeGlyph[]>()
  for (const glyph of projection.glyphs.filter(glyph => glyph.lane.startsWith('alternative:'))) lanes.set(glyph.lane, [...(lanes.get(glyph.lane) ?? []), glyph])
  for (const glyphs of lanes.values()) {
    let previous: NativeGlyph | undefined
    for (const glyph of glyphs) {
      if (previous?.event?.tie && previous.event !== glyph.event && !glyph.sustain) relations.push({ kind: 'tie', first: previous, last: glyph, level: 0 })
      previous = glyph
      if (glyph.event?.kind === 'tuplet' && glyph.slot === 0) relations.push({ kind: 'tuplet', first: glyph, last: glyphs.findLast(item => item.event === glyph.event)!, label: String(glyph.event.tuplet?.num), level: 0 })
    }
  }
  const intervals = [...document.intervals, ...new Set((document.alternatives ?? []).flatMap(alternative => alternative.intervals))]
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
  // Each alternative measure is a separate parenthesized phrase. Reuse the
  // measured relation painter so wrapping and occupied bounds stay in sync.
  for (const measure of projection.measures) {
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    for (const lane of new Set(glyphs.filter(glyph => glyph.lane.startsWith('alternative:')).map(glyph => glyph.lane))) {
      const members = glyphs.filter(glyph => glyph.lane === lane)
      relations.push({ kind: 'inst', first: members[0]!, last: members.at(-1)!, level: 0 })
    }
  }
  // Adjacent instrumental declarations form one passage, just as their shared
  // horizontal occupancy does. Part and voice boundaries remain independent.
  const instrumentalLanes = new Map<string, NativeGlyph[]>()
  for (const measure of projection.measures) for (const column of measure.columns) for (const glyph of column.glyphs) {
    if (glyph.lane.startsWith('alternative:')) continue
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
  // Inner arcs are placed first. A later overlapping relation occupies an
  // outer band; all fragments retain that band through wrapping/pagination.
  const order = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
  relations.sort((a, b) => Number(b.kind === 'tuplet') - Number(a.kind === 'tuplet')
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
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions): NativeMeasure[][] {
  const fragments = measures.flatMap(measure => splitNativeMeasure(measure, width * (options.wrapWidthRatio ?? 1), Boolean(options.pairedSpacing)))
  const lines: NativeMeasure[][] = []
  const ratio = options.wrapWidthRatio ?? 1
  for (let begin = 0; begin < fragments.length;) {
    let end = begin + 1
    while (end < fragments.length && !fragments[end]!.breakBefore && !fragments[end - 1]!.breakAfter) end++
    const group = fragments.slice(begin, end), cost = Array<number>(group.length + 1).fill(Infinity), next = Array<number>(group.length).fill(0)
    const sparse = group.map(measure => {
      const glyphs = measure.columns.flatMap(column => column.glyphs)
      return glyphs.length <= 4 && glyphs.every(glyph => glyph.beats >= 1
        && Math.max(glyph.musicLeft ?? glyph.left, glyph.lyricLeft ?? 0) + Math.max(glyph.musicRight ?? glyph.right, glyph.lyricRight ?? 0)
          <= ((glyph.musicLeft ?? glyph.left) + (glyph.musicRight ?? glyph.right)) * 1.5)
    })
    cost[group.length] = 0
    for (let index = group.length - 1; index >= 0; index--) {
      let natural = 0, minimum = 0, widestNatural = 0, widestMinimum = 0
      let compactEqual = options.wrap === 'compact' && options.equalMeasures
      for (let stop = index; stop < group.length; stop++) {
        const measure = group[stop]!, count = stop - index + 1
        natural += measure.natural; minimum += measure.minimum
        widestNatural = Math.max(widestNatural, measure.natural); widestMinimum = Math.max(widestMinimum, measure.minimum)
        const equal = options.equalMeasures
        compactEqual &&= sparse[stop]
        const minWidth = equal ? widestMinimum * count : measure.minimumEnd !== undefined && group[index]!.minimumStart !== undefined ? measure.minimumEnd - group[index]!.minimumStart! : minimum
        const naturalWidth = equal ? widestNatural * count : measure.naturalEnd !== undefined && group[index]!.naturalStart !== undefined ? measure.naturalEnd - group[index]!.naturalStart! : natural
        const available = width * ratio
        const capacity = available * (options.pairedSpacing ? 1 : equal ? compactEqual ? 1.16 : 0.94 : options.wrap === 'compact' ? 1.16 : 0.94)
        if ((options.pairedSpacing ? minWidth : naturalWidth) > capacity && count > 1) break
        const slack = Math.max(0, capacity - naturalWidth) / available
        const compression = Math.max(0, naturalWidth - available) / available
        const compressionCost = options.pairedSpacing || options.wrap === 'compact' && !equal ? 1 : 100
        const score = slack * slack + compression * compression * compressionCost + cost[stop + 1]!
        // Equal-energy partitions should leave the shorter row at the end.
        // Ignore round-off from subtracting cumulative measured coordinates.
        if (score < cost[index]! - 1e-12 || Math.abs(score - cost[index]!) <= 1e-12 && stop + 1 > next[index]!) { cost[index] = score; next[index] = stop + 1 }
      }
    }
    for (let index = 0; index < group.length;) { const stop = Math.max(index + 1, next[index]!); lines.push(group.slice(index, stop)); index = stop }
    begin = end
  }
  return lines
}

export function layoutNativeScore(document: ScoreDocument, supplied: NativeRenderOptions): NativeLayout {
  validate(supplied)
  const headerDocument = document
  const expanded = supplied.fixedDo && document.orderKeys?.some(Boolean) ? keyedDisplayPerformance(document) : undefined
  if (expanded) document = expanded.document
  const minimumNoteGapEm = supplied.minimumNoteGapEm ?? (supplied.noteGapEm === undefined ? 0.4 : 0)
  const minimumNoteGapFloorEm = supplied.minimumNoteGapFloorEm ?? 0
  if (!Number.isFinite(minimumNoteGapFloorEm) || minimumNoteGapFloorEm < 0 || minimumNoteGapFloorEm > minimumNoteGapEm) throw new Error('最小间距下限必须非负且不大于最小基础间距。')
  const options = { ...supplied, pairedSpacing: supplied.minimumNoteGapEm !== undefined || supplied.noteGapEm === undefined, width: Math.max(320, Math.round(supplied.width)), noteGapEm: supplied.noteGapEm ?? 0.6, minimumNoteGapEm, minimumNoteGapFloorEm, equalMeasures: supplied.equalMeasures ?? document.equalMeasures }
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
  const header = nativeHeaderGeometry(headerDocument, options.width, margin, measurer, options.systemGap ?? nativeStyle.systemGap, options)
  const headerHeight = header.height
  measureNativeHorizontal(projection.measures, options)
  const lines = breakMeasures(projection.measures, available, options)
  const systems: NativeSystem[] = lines.map((measures, index) => ({ index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  const systemOf = new Map<NativeGlyph, number>()
  for (const system of systems) {
    const x = margin
    const width = options.width - margin - x
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
  const uniformHosts = options.uniformSystemHeight ? nativeUniformHosts(systems, measurer) : undefined
  const relationBounds = new Map<NativeSystem, NativeRegion[]>()
  for (const system of systems) {
    const regions = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      .flatMap(g => [
        ...(g.musicInk ?? [{ left: -(g.inkLeft ?? g.left), right: g.inkRight ?? g.right, top: -(g.musicTop ?? g.top), bottom: g.musicBottom ?? g.bottom }])
          .map(ink => ({ lane: g.lane, left: g.x + ink.left, right: g.x + ink.right, top: -ink.top })),
        ...g.controls.flatMap(placedNativeControlInk).map(ink => ({ lane: g.lane, left: ink.left, right: ink.right, top: -ink.top })),
      ])
    for (const [index] of system.measures.entries()) for (const lane of system.lanes) {
      for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) {
        const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
        regions.push({ lane: lane.id, left: ink.left, right: ink.right, top: -ink.top })
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
  placeNativeVoltas(systems, relationBounds, measurer)
  // Chord names participate in shared music height; local descriptions and
  // section headings are placed afterwards so they cannot enlarge peer rows.
  for (const system of systems) {
    const regions = relationBounds.get(system) ?? []
    relationBounds.set(system, regions)
    placeNativeAnnotations(system, regions, measurer, options.width, margin, false)
  }
  for (const system of systems) placeNativeNavigation(system)
  if (uniformHosts) shareNativeUniformHeight(systems, uniformHosts, measurer)
  for (const system of systems) for (const lane of system.lanes) placeNativeLyrics(system, lane, measurer)
  for (const system of systems) placeNativeAnnotations(system, relationBounds.get(system)!, measurer, options.width, margin, true)
  const gap = options.systemGap ?? nativeStyle.systemGap
  const blocks = [...header.blocks.map(block=>({height:block.height, ink: nativeSvgPieces(block.svg, measurer)})), ...systems.map(system => {
    const height = placeNativeLanes(system, measurer, options.uniformSystemHeight)
    const pieces = nativeLanePieces(system, measurer)
    const corePieces = nativeLanePieces(system, measurer, true)
    const coreInk = system.lanes.flatMap(lane => (corePieces.get(lane.id) ?? []).map(piece => ({ ...piece, top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
    const core = options.uniformSystemHeight || !coreInk.length ? { top: 0, bottom: height } : { top: Math.min(...coreInk.map(piece => piece.top)), bottom: Math.max(...coreInk.map(piece => piece.bottom)) }
    const ink = system.lanes.flatMap(lane => (pieces.get(lane.id) ?? []).map(piece => ({ ...piece, top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
    ink.push(...nativeSvgPieces(nativeVoiceConnectorSvg(system, margin, measurer), measurer))
    if (options.uniformSystemHeight) ink.push({ left: margin, right: options.width - margin, top: 0, bottom: height })
    return { height, baseline: system.lanes[0]?.y ?? 0, core, ink, gapBefore: system.measures[0]?.extraGap ?? 0 }
  })]
  const pagination = paginateNativeBlocks(blocks, { pageHeight: options.paged ? Math.floor(options.width * A4_CONTENT_ASPECT_RATIO) : Infinity,
    margin, gap, elastic: true })
  const pages: NativePage[] = pagination.heights.map((height, index) => ({ index, width: options.width, height, systems: [] }))
  for (const [index,block] of header.blocks.entries()) {
    const position = pagination.positions[index]!
    pages[position.page]!.header = (pages[position.page]!.header ?? '') + `<g transform="translate(0 ${position.top})">${block.svg}</g>`
  }
  for (const [index, system] of systems.entries()) {
    const position = pagination.positions[index + header.blocks.length]!
    system.top = position.top; system.page = position.page
    for (const lane of system.lanes) {
      lane.y += position.top
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) if (glyph.lane === lane.id) glyph.y = lane.y
    }
    system.bottom = position.top + blocks[index + header.blocks.length]!.height; pages[position.page]!.systems.push(system)
  }
  return { document, headerDocument, projection, systems, pages, relations, options, measurer, headerHeight, margin }
}
