import type { ScoreDocument, ScoreEvent } from '@m3n/notation'
import type { NativeGlyph, NativeProjection } from './native-model.js'
import type { NativeRelation } from './native-layout-model.js'

export function relationsFor(document: ScoreDocument, projection: NativeProjection): NativeRelation[] {
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

export function reserveInstrumentalEndpoints(relations: NativeRelation[], projection: NativeProjection): void {
  const starts = new Set<NativeGlyph>(), ends = new Set<NativeGlyph>()
  for (const relation of relations) if (relation.kind === 'inst') { starts.add(relation.first); ends.add(relation.last) }
  for (const glyph of projection.glyphs) if (glyph.instrumental) {
    if (!starts.has(glyph)) glyph.parenthesisLeft = 0
    if (!ends.has(glyph)) glyph.parenthesisRight = 0
  }
}

