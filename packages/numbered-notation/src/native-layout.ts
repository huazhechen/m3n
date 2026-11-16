import { scoreCreditLines, type ScoreDocument, type ScoreEvent } from '@m3n/notation'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { projectNativeScore, type NativeGlyph, type NativeMeasure, type NativeProjection } from './native-model.js'

export type NativeRenderOptions = {
  paged: boolean; width: number; measureNumbers?: boolean; includeBass?: boolean; textMeasurer?: TextMeasurer
  pageMargin?: number; systemGap?: number; noteGapEm?: number; minimumNoteGapEm?: number; uniformSystemHeight?: boolean
  equalMeasures?: boolean; wrap?: 'normal' | 'compact'; wrapWidthRatio?: number
}
export type NativeRelation = { kind: 'tie' | 'slur' | 'cresc' | 'decres' | 'inst' | 'octave' | 'tuplet'; first: NativeGlyph; last: NativeGlyph; label?: string; level: number }
export type NativeLane = { id: string; y: number; top: number; bottom: number; rows: number[] }
export type NativeSystem = { index: number; measures: NativeMeasure[]; lanes: NativeLane[]; top: number; bottom: number; page: number; volta: boolean; relations: NativeRelation[] }
export type NativePage = { index: number; width: number; height: number; systems: NativeSystem[] }
export type NativeLayout = {
  document: ScoreDocument; projection: NativeProjection; systems: NativeSystem[]; pages: NativePage[]; relations: NativeRelation[]
  options: NativeRenderOptions; measurer: TextMeasurer; headerHeight: number; margin: number
}

function validate(options: NativeRenderOptions) {
  if (!Number.isFinite(options.width)) throw new Error('简谱宽度必须为有限数值。')
  for (const value of [options.pageMargin, options.systemGap]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('简谱页边距和行距必须为非负有限数值。')
  if (options.noteGapEm !== undefined && (!Number.isFinite(options.noteGapEm) || options.noteGapEm < 0)) throw new Error('音符间距比例必须为非负有限数值。')
  if (options.minimumNoteGapEm !== undefined && (!Number.isFinite(options.minimumNoteGapEm) || options.minimumNoteGapEm < 0 || options.minimumNoteGapEm > (options.noteGapEm ?? 0.6))) throw new Error('最小间距必须非负且不大于自然间距。')
  if (options.wrapWidthRatio !== undefined && (!Number.isFinite(options.wrapWidthRatio) || options.wrapWidthRatio <= 0 || options.wrapWidthRatio > 1)) throw new Error('wrapWidthRatio 必须大于 0 且不大于 1。')
}

export function wrapNativeText(text: string, width: number, size: number, measurer: TextMeasurer, weight = 400): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\n') { lines.push(line); line = ''; continue }
    if (line && measurer.measureText(line + character, { fontSize: size, fontFamily: 'serif', fontWeight: weight }).w > width) { lines.push(line); line = character.trimStart() }
    else line += character
  }
  if (line) lines.push(line)
  return lines
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
    if (interval.display === 'text' || interval.kind === 'accel' || interval.kind === 'rit') continue
    const glyphs = projection.glyphs.filter(glyph => glyph.event && glyph.staff === interval.staff && interval.start! <= glyph.event.sourceStart && glyph.event.sourceStart <= interval.endStart!)
    const first = glyphs[0], last = glyphs.at(-1)
    if (!first || !last) continue
    const kind = interval.kind === 'lg' ? 'slur' : interval.kind === '8va' || interval.kind === '8vb' ? 'octave' : interval.kind
    const end = kind === 'slur' ? head.get(last.event!) ?? [...glyphs].reverse().find(glyph => !glyph.sustain && glyph.pitches.some(pitch => pitch.degree !== '0')) ?? last : last
    relations.push({ kind, first, last: end, level: 0, label: kind === 'octave' ? interval.kind : undefined })
  }
  // Inner arcs are placed first. A later overlapping relation occupies an
  // outer band; all fragments retain that band through wrapping/pagination.
  const order = new Map(projection.glyphs.map((glyph, index) => [glyph, index]))
  relations.sort((a, b) => (order.get(a.last)! - order.get(a.first)!) - (order.get(b.last)! - order.get(b.first)!))
  for (const [index, relation] of relations.entries()) {
    if (relation.kind === 'inst') continue
    const start = order.get(relation.first)!, end = order.get(relation.last)!
    relation.level = Math.max(-1, ...relations.slice(0, index).filter(other => other.kind !== 'inst' && other.first.lane === relation.first.lane && order.get(other.first)! <= end && order.get(other.last)! >= start).map(other => other.level)) + 1
  }
  return relations
}

/** Break complete measures first, splitting oversized measures at time columns. */
function breakMeasures(measures: NativeMeasure[], width: number, options: NativeRenderOptions): NativeMeasure[][] {
  const fragments = measures.flatMap(measure => {
    if (measure.minimum <= width || measure.columns.length < 2) return [measure]
    const groups: typeof measure.columns[] = []
    let group: typeof measure.columns = [], occupied = 24
    for (const column of measure.columns) {
      const addition = column.left + column.right + column.minimumGap
      if (group.length && occupied + addition > width) { groups.push(group); group = []; occupied = 24 }
      group.push(column); occupied += addition
    }
    if (group.length) groups.push(group)
    return groups.map((columns, index) => ({ ...measure, columns, continuation: index > 0, lastFragment: index === groups.length - 1,
      breakBefore: index === 0 ? measure.breakBefore : true, breakAfter: index === groups.length - 1 ? measure.breakAfter : true,
      natural: columns.reduce((sum, column) => sum + column.left + column.right + column.gap, 24),
      minimum: columns.reduce((sum, column) => sum + column.left + column.right + column.minimumGap, 24) }))
  })
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
        const minWidth = equal ? widestMinimum * count : minimum
        const naturalWidth = equal ? widestNatural * count : natural
        if (minWidth > width * ratio && count > 1) break
        const slack = (width * ratio - naturalWidth) / (width * ratio)
        const compressionCost = options.wrap === 'compact' && options.minimumNoteGapEm === 0 ? 1 : 100
        const score = 1 + slack * slack * (slack < 0 ? compressionCost : 1) + cost[stop + 1]!
        if (score < cost[index]!) { cost[index] = score; next[index] = stop + 1 }
      }
    }
    for (let index = 0; index < group.length;) { const stop = Math.max(index + 1, next[index]!); lines.push(group.slice(index, stop)); index = stop }
    begin = end
  }
  return lines
}

export function layoutNativeScore(document: ScoreDocument, supplied: NativeRenderOptions): NativeLayout {
  validate(supplied)
  const options = { ...supplied, width: Math.max(320, Math.round(supplied.width)), noteGapEm: supplied.noteGapEm ?? 0.6, minimumNoteGapEm: supplied.minimumNoteGapEm ?? (supplied.noteGapEm === undefined ? 0.4 : 0), equalMeasures: supplied.equalMeasures ?? document.equalMeasures }
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
  const title = wrapNativeText(document.title, available - 2, 32, measurer, 700).length * 42
  const subtitle = wrapNativeText(document.subtitle, available - 2, 16, measurer).length * 24
  const credits = scoreCreditLines(document).length * 21
  const order = document.order?.length ? Math.ceil((100 + document.order.reduce((sum, name) => sum + measurer.measureText(name, { fontSize: 16 }).w + 43, 0)) / available) * 34 : 0
  const headerHeight = title + subtitle + Math.max(credits, options.width < 600 ? credits + 28 : 28) + order + 20
  const lines = breakMeasures(projection.measures, available - (projection.hasBass ? 16 : 0), options)
  const systems: NativeSystem[] = lines.map((measures, index) => ({ index, measures, lanes: [], top: 0, bottom: 0, page: 0, volta: measures.some(measure => measure.source.ending), relations: [] }))
  const systemOf = new Map<NativeGlyph, number>()
  for (const system of systems) {
    let x = margin + (projection.hasBass ? 16 : 0)
    const total = system.measures.reduce((sum, measure) => sum + measure.natural, 0)
    const width = options.width - margin - x
    const minimum = system.measures.reduce((sum, measure) => sum + measure.minimum, 0)
    for (const measure of system.measures) {
      const share = options.equalMeasures ? width / system.measures.length : measure.minimum + (width - minimum) * (measure.natural / Math.max(1, total))
      measure.start = x; measure.end = x + share
      const fixed = measure.columns.reduce((sum, column) => sum + column.left + column.right, 24)
      const springs = measure.columns.reduce((sum, column) => sum + column.gap, 0)
      let cursor = x + 12
      for (const column of measure.columns) {
        column.x = cursor + column.left
        for (const glyph of column.glyphs) { glyph.x = column.x; systemOf.set(glyph, system.index) }
        cursor += column.left + column.right + Math.max(0, share - fixed) * column.gap / Math.max(1e-9, springs)
      }
      x += share
    }
    const glyphs = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
    const laneNames = [...new Set(glyphs.map(glyph => glyph.lane))].sort((a, b) => a === 'melody' ? -1 : b === 'melody' ? 1 : a === 'bass' ? 1 : b === 'bass' ? -1 : a.localeCompare(b))
    for (const lane of laneNames) {
      const members = glyphs.filter(glyph => glyph.lane === lane)
      const rows = [...new Set(members.flatMap(glyph => [...glyph.lyrics].filter(([, row]) => row.texts.some(text => text.replaceAll('\u200B', '').trim())).map(([row]) => row)))].sort((a, b) => a - b)
      system.lanes.push({ id: lane, y: 0, top: Math.max(28, ...members.map(glyph => glyph.top + glyph.annotations.length * 22)), bottom: Math.max(10, ...members.map(glyph => glyph.bottom)) + rows.length * 24 + (lane.startsWith('alternative:') ? 8 : 0), rows })
    }
  }
  for (const relation of relations) {
    const first = systemOf.get(relation.first), last = systemOf.get(relation.last)
    if (first === undefined || last === undefined) continue
    for (let index = first; index <= last; index++) {
      const system = systems[index]!
      system.relations.push(relation)
      const lane = system.lanes.find(lane => lane.id === relation.first.lane)
      if (lane && relation.kind !== 'inst') {
        const members = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs)).filter(glyph => glyph.lane === lane.id)
        lane.top = Math.max(lane.top, Math.max(...members.map(glyph => glyph.top)) + 32 + relation.level * 14 + Math.max(...members.map(glyph => glyph.annotations.length)) * 22)
      }
    }
  }
  if (options.uniformSystemHeight) {
    const envelopes = new Map<string, { top: number; bottom: number }>()
    for (const system of systems) for (const lane of system.lanes) {
      const paragraph = system.measures[0]?.columns[0]?.glyphs[0]?.paragraph ?? '0'
      const key = `${paragraph}:${lane.id}:${system.volta}`, old = envelopes.get(key)
      envelopes.set(key, { top: Math.max(lane.top, old?.top ?? 0), bottom: Math.max(lane.bottom - lane.rows.length * 24, old?.bottom ?? 0) })
    }
    for (const system of systems) for (const lane of system.lanes) {
      const paragraph = system.measures[0]?.columns[0]?.glyphs[0]?.paragraph ?? '0'
      const envelope = envelopes.get(`${paragraph}:${lane.id}:${system.volta}`)!
      lane.top = envelope.top; lane.bottom = envelope.bottom + lane.rows.length * 24
    }
  }
  const pageHeight = Math.floor(options.width * 277 / 190), pages: NativePage[] = [{ index: 0, width: options.width, height: 0, systems: [] }]
  let y = margin + headerHeight
  for (const system of systems) {
    const height = system.lanes.reduce((sum, lane) => sum + lane.top + lane.bottom + 14, system.volta ? 28 : 0)
    let page = pages.at(-1)!
    if (page.systems.length) y += system.measures[0]?.extraGap ?? 0
    if (options.paged && y + height > pageHeight - margin && page.systems.length) { page.height = pageHeight; page = { index: pages.length, width: options.width, height: 0, systems: [] }; pages.push(page); y = margin }
    if (options.paged && height > pageHeight - 2 * margin) throw new Error('单个谱行高于页面，请增加版宽或使用连续布局。')
    system.top = y; system.page = page.index
    let axis = y + (system.volta ? 28 : 0)
    for (const lane of system.lanes) {
      axis += lane.top; lane.y = axis
      for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) if (glyph.lane === lane.id) glyph.y = axis
      axis += lane.bottom + 14
    }
    system.bottom = axis; page.systems.push(system)
    y = axis + (options.systemGap ?? 24)
    page.height = options.paged ? pageHeight : axis + margin
  }
  if (!systems.length) pages[0]!.height = Math.max(1, margin * 2 + headerHeight)
  return { document, projection, systems, pages, relations, options, measurer, headerHeight, margin }
}
