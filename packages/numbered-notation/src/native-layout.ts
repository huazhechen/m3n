import { nativeArcGeometry } from './native-arc.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import { paginateNativeBlocks } from './native-pagination.js'
import { nativeHeaderGeometry } from './native-header.js'
import { splitNativeMeasure } from './native-wrapping.js'
export { wrapNativeText } from './native-header.js'
import { measureNativeHorizontal, placeNativeHorizontal } from './native-horizontal.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'

export type NativeRenderOptions = {
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  pageMargin?: number; systemGap?: number; noteGapEm?: number; minimumNoteGapEm?: number; uniformSystemHeight?: boolean
  equalMeasures?: boolean; wrap?: 'normal' | 'compact'; wrapWidthRatio?: number
  /** @internal Whether a separate minimum spacing policy was requested. */
  pairedSpacing?: boolean
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'octave' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; bodyBottom?: number; rows: number[] }
export type NativeSystem = { index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[] }
export type NativePage = { index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
}

// Bracket hook, clearance, and half the stroke, measured at 22px music size.
const voltaClearance = 22 * (0.2 + 0.6 * 1.2 + 0.055 / 2)

function validate(options: NativeRenderOptions) {
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
    if (interval.display === 'text' || interval.kind === 'accel' || interval.kind === 'rit' || interval.kind === 'inst') continue
    const glyphs = projection.glyphs.filter(glyph => glyph.event && glyph.staff === interval.staff && interval.start! <= glyph.event.sourceStart && glyph.event.sourceStart <= interval.endStart!)
    const first = glyphs[0], last = glyphs.at(-1)
    if (!first || !last) continue
    const kind = interval.kind === 'lg' ? 'slur' : interval.kind === '8va' || interval.kind === '8vb' ? 'octave' : interval.kind
    const end = kind === 'slur' ? head.get(last.event!) ?? [...glyphs].reverse().find(glyph => !glyph.sustain && glyph.pitches.some(pitch => pitch.degree !== '0')) ?? last : last
    relations.push({ kind, first, last: end, level: 0, label: kind === 'octave' ? interval.kind : undefined })
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
  // Inner arcs are placed first. A later overlapping relation occupies an
  // outer band; all fragments retain that band through wrapping/pagination.
  const order = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
  relations.sort((a, b) => (order.get(a.last)! - order.get(a.first)!) - (order.get(b.last)! - order.get(b.first)!))
  for (const [index, relation] of relations.entries()) {
    if (relation.kind === 'inst') continue
    const start = order.get(relation.first)!, end = order.get(relation.last)!
    relation.level = Math.max(-1, ...relations.slice(0, index).filter(other => other.kind !== 'inst' && other.first.lane === relation.first.lane && order.get(other.first)! < end && order.get(other.last)! > start).map(other => other.level)) + 1
  }
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
    cost[group.length] = 0
    for (let index = group.length - 1; index >= 0; index--) {
      let natural = 0, minimum = 0, widestNatural = 0, widestMinimum = 0
      for (let stop = index; stop < group.length; stop++) {
        const measure = group[stop]!, count = stop - index + 1
        natural += measure.natural; minimum += measure.minimum
        widestNatural = Math.max(widestNatural, measure.natural); widestMinimum = Math.max(widestMinimum, measure.minimum)
        const equal = options.equalMeasures
        const minWidth = equal ? widestMinimum * count : measure.minimumEnd !== undefined && group[index]!.minimumStart !== undefined ? measure.minimumEnd - group[index]!.minimumStart! : minimum
        const naturalWidth = equal ? widestNatural * count : measure.naturalEnd !== undefined && group[index]!.naturalStart !== undefined ? measure.naturalEnd - group[index]!.naturalStart! : natural
        const capacity = width * ratio * (options.pairedSpacing ? 1 : options.wrap === 'compact' ? 1.16 : 0.94)
        if ((options.pairedSpacing ? minWidth : naturalWidth) > capacity && count > 1) break
        const slack = (capacity - naturalWidth) / (width * ratio)
        const compressionCost = options.pairedSpacing || options.wrap === 'compact' ? 1 : 100
        const score = slack * slack * (slack < 0 ? compressionCost : 1) + cost[stop + 1]!
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
  const options = { ...supplied, pairedSpacing: supplied.minimumNoteGapEm !== undefined || supplied.noteGapEm === undefined, width: Math.max(320, Math.round(supplied.width)), noteGapEm: supplied.noteGapEm ?? 0.6, minimumNoteGapEm: supplied.minimumNoteGapEm ?? (supplied.noteGapEm === undefined ? 0.4 : 0), equalMeasures: supplied.equalMeasures ?? document.equalMeasures }
  const margin = options.pageMargin ?? 32
  if (margin * 2 + 40 > options.width) throw new Error('简谱页边距过大。')
  let measurer = options.textMeasurer
  if (!measurer && typeof window !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
    const context = window.document.createElement('canvas').getContext('2d')
    if (context) {
      measurer = { measureText(text, style) { context.font = `${style.fontWeight ?? 400} ${style.fontSize}px ${style.fontFamily ?? 'serif'}`; const m = context.measureText(text); return { w: Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight), h: style.fontSize, baseline: style.fontSize * 0.8 } } }
    }
  }
  measurer ??= new DefaultTextMeasurer()
  const projection = projectNativeScore(document, { ...options, textMeasurer: measurer })
  const relations = relationsFor(document, projection), available = options.width - 2 * margin
  const headerHeight = nativeHeaderGeometry(document, options.width, margin, measurer, options.systemGap ?? 24).height
  measureNativeHorizontal(projection.measures, options)
  const lines = breakMeasures(projection.measures, available, options)
  const systems: NativeSystem[] = lines.map((measures, index) => ({ index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  const systemOf = new Map<NativeGlyph, number>()
  for (const system of systems) {
    const x = margin
    const width = options.width - margin - x
    const glyphs = options.equalMeasures
      ? system.measures.flatMap((measure, index) => placeNativeHorizontal([measure], options, x + index * width / system.measures.length, width / system.measures.length, system.measures))
      : placeNativeHorizontal(system.measures, options, x, width)
    for (const glyph of glyphs) systemOf.set(glyph, system.index)
    const laneNames = [...new Set(glyphs.map(glyph => glyph.lane))].sort((a, b) => a === 'melody' ? -1 : b === 'melody' ? 1 : a === 'bass' ? 1 : b === 'bass' ? -1 : a.localeCompare(b))
    for (const lane of laneNames) {
      const members = glyphs.filter(glyph => glyph.lane === lane)
      const rows = [...new Set(members.flatMap(glyph => [...glyph.lyrics].filter(([, row]) => row.texts.some(text => text.replaceAll('\u200B', '').trim())).map(([row]) => row)))].sort((a, b) => a - b)
      const bodyBottom = Math.max(7.15, ...members.map(glyph => glyph.bottom))
      const lyricsHeight = rows.length ? 22 * 0.32 + rows.length * 22 * 0.82 + (rows.length - 1) * 22 * 0.24 : 0
      system.lanes.push({ id: lane, y: 0, top: Math.max(20.35, ...members.map(glyph => glyph.top + glyph.annotations.length * 22)), bodyBottom, bottom: bodyBottom + lyricsHeight, rows })
    }
  }
  const relationBounds = new Map<NativeSystem, { lane: string; left: number; right: number; top: number }[]>()
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
      if (lane && relation.kind !== 'inst') {
        const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === lane.id)
        const selected = members.filter(glyph => relation.first.event && relation.last.event && glyph.event && relation.first.event.sourceStart <= glyph.event.sourceStart && glyph.event.sourceStart <= relation.last.event.sourceStart)
        const covered = selected.length ? selected : members
        const top = relation.kind === 'tie' || relation.kind === 'slur' ? nativeArcGeometry(relation, system).top
          : relation.kind === 'tuplet' ? nativeTupletGeometry(relation, system, measurer).top
          : Math.max(0, ...covered.map(glyph => glyph.top)) + 14 + relation.level * 3.3 + Math.max(...members.map(glyph => glyph.annotations.length)) * 22
        lane.top = Math.max(lane.top, top)
        const bounds = relationBounds.get(system) ?? []
        bounds.push({ lane: lane.id, left: Math.min(...covered.map(glyph => glyph.x)), right: Math.max(...covered.map(glyph => glyph.x)), top })
        relationBounds.set(system, bounds)
      }
    }
  }
  // A volta clears only its own horizontal range. Decorations outside
  // that range must not raise the entire bracket and every following row.
  for (const system of systems) if (system.volta) {
    const lane = system.lanes.find(lane => lane.id === 'melody')
    if (!lane) continue
    for (let begin = 0; begin < system.measures.length;) {
      const ending = system.measures[begin]!.source.ending
      if (!ending) { begin++; continue }
      let end = begin + 1
      while (end < system.measures.length && system.measures[end]!.source.ending === ending) end++
      const measures = system.measures.slice(begin, end)
      const glyphs = measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === lane.id)
      const left = measures[0]!.start, right = measures.at(-1)!.end
      const top = Math.max(20.35, ...glyphs.map(glyph => glyph.top + glyph.annotations.length * 22),
        ...(relationBounds.get(system) ?? []).filter(bound => bound.lane === lane.id && bound.right >= left && bound.left <= right).map(bound => bound.top))
      lane.top = Math.max(lane.top, top + voltaClearance)
      begin = end
    }
  }
  if (options.uniformSystemHeight) {
    const envelopes = new Map<string, { top: number; bottom: number }>()
    for (const system of systems) for (const lane of system.lanes) {
      const paragraph = system.measures[0]?.columns[0]?.glyphs[0]?.paragraph ?? '0'
      const key = `${paragraph}:${lane.id}:${system.volta}`, old = envelopes.get(key)
      envelopes.set(key, { top: Math.max(lane.top, old?.top ?? 0), bottom: Math.max(lane.bodyBottom ?? lane.bottom, old?.bottom ?? 0) })
    }
    for (const system of systems) for (const lane of system.lanes) {
      const paragraph = system.measures[0]?.columns[0]?.glyphs[0]?.paragraph ?? '0'
      const envelope = envelopes.get(`${paragraph}:${lane.id}:${system.volta}`)!
      lane.top = envelope.top; lane.bodyBottom = envelope.bottom; lane.bottom = envelope.bottom + (lane.rows.length ? 7.04 + lane.rows.length * 18.04 + (lane.rows.length - 1) * 5.28 : 0)
    }
  }
  const gap = options.systemGap ?? 24
  const blocks = [{ height: headerHeight - gap }, ...systems.map(system => ({
    height: system.lanes.reduce((sum, lane) => sum + lane.top + lane.bottom, (system.lanes.length - 1) * 20.625),
    gapBefore: system.measures[0]?.extraGap ?? 0,
  }))]
  const pagination = paginateNativeBlocks(blocks, { pageHeight: options.paged ? Math.floor(options.width * 277 / 190) : Infinity,
    margin, gap })
  const pages: NativePage[] = pagination.heights.map((height, index) => ({ index, width: options.width, height, systems: [] }))
  for (const [index, system] of systems.entries()) {
    const position = pagination.positions[index + 1]!
    system.top = position.top; system.page = position.page
    let axis = position.top
    for (const lane of system.lanes) {
      axis += lane.top; lane.y = axis
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) if (glyph.lane === lane.id) glyph.y = axis
      axis += lane.bottom + (lane === system.lanes.at(-1) ? 0 : 20.625)
    }
    system.bottom = axis; pages[position.page]!.systems.push(system)
  }
  return { document, projection, systems, pages, relations, options, measurer, headerHeight, margin }
}
