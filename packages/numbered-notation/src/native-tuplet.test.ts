import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeTupletGeometry } from './native-tuplet.js'
import { nativeRibbonRange } from './native-curve.js'
import { nativeSvgPieces } from './native-ink.js'
import { nativeCoreGap } from './native-style.js'
import { NativeNumberedNotationScore } from './native-score.js'

const measurer = new DefaultTextMeasurer()
const options = { width: 800, paged: false }
const layout = (music: string) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), options)
const brackets = (score: ReturnType<typeof layout>) => score.systems.flatMap(system => system.relations
  .filter(relation => relation.kind === 'tuplet').map(relation => ({ system, relation, geometry: nativeTupletGeometry(relation, system, measurer) })))

describe('native tuplet brackets', () => {
  it('clears its own contents and shares the measured top with pagination', () => {
    const score = layout('([1 2ee 3:2]) 4 5 6')
    const { geometry, system, relation } = brackets(score)[0]!
    const high = score.projection.glyphs[1]!
    expect(geometry.segments[0]![3]).toBeLessThan(-high.top)
    expect(system.lanes[0]!.top).toBeCloseTo(geometry.top)
    const halfBody = measurer.measureText('0', { fontSize: 24, fontFamily: 'Barlow Semi Condensed' }).w / 2
    expect(geometry.segments[0]![0]).toBeCloseTo(Math.max(system.measures[0]!.start + geometry.stroke / 2, relation.first.x - halfBody))
    expect(geometry.segments[1]![0]).toBeCloseTo(relation.last.x + halfBody)
  })

  it.each([320, 580, 720])('keeps the full stroke inside a zero-margin row at %spx', width => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: ([1 2 3:2]) 4 5 6 |||'), {
      width, paged: true, pageMargin: 0, minimumNoteGap: 9,
    })
    for (const { geometry } of brackets(score)) {
      expect(geometry.left).toBeGreaterThanOrEqual(-.000001)
      expect(geometry.right).toBeLessThanOrEqual(width + .000001)
    }
  })

  it('aligns adjacent tuplets but does not let an unrelated high note raise them', () => {
    const adjacent = brackets(layout('([1 2 3:2]) ([4ee 5 6:2]) 7 1e'))
    expect(adjacent).toHaveLength(2)
    expect(adjacent[0]!.geometry.baseline).toBeCloseTo(adjacent[1]!.geometry.baseline)
    const plain = brackets(layout('([1 2 3:2]) 4 5 6'))[0]!
    const high = brackets(layout('([1 2 3:2]) 4eee 5 6'))[0]!
    expect(high.geometry).toEqual(plain.geometry)
  })

  it.each([true, false])('lowers brackets when octave dots clear the label, numeric=%s', numericLayout => {
    const make = (music: string) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), {
      ...options, numericLayout, textMeasurer: measurer,
    })
    const side = brackets(make('([1e 2 3e:2]) ([4 5 6:2]) 7 1'))
    const middle = brackets(make('([1e 2e 3e:2]) ([4 5 6:2]) 7 1'))
    expect(side[0]!.geometry.baseline).toBeGreaterThan(middle[0]!.geometry.baseline)
    expect(side[0]!.geometry.baseline).toBeCloseTo(side[1]!.geometry.baseline)
    expect(middle[0]!.geometry.baseline).toBeCloseTo(middle[1]!.geometry.baseline)
    let nearest = Infinity
    for (const { system, relation } of side) {
      const placed = system.relationLayout!.get(relation)!
      for (const mark of placed.pieces ?? nativeSvgPieces(placed.svg, measurer)) {
        for (const glyph of system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))) {
          for (const ink of glyph.musicInk ?? []) {
            if (glyph.x + ink.right <= mark.left || glyph.x + ink.left >= mark.right) continue
            const clearance = ink.top - mark.bottom
            expect(clearance).toBeGreaterThanOrEqual(24 * .14 - 1e-7)
            nearest = Math.min(nearest, clearance)
          }
        }
      }
    }
    expect(nearest).toBeCloseTo(24 * .14)
  })

  it.each([320, 600, 768])('aligns final adjacent brackets after clearing an incoming tie at %spx', width => {
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 5d~ (([5d 7d 2:2])) (([4 5 7:2])) ((2e. (1e) 7. (6))) (5 4) |'), { width, paged: false })
    for (const system of score.systems) {
      const tuplets = system.relations.filter(r => r.kind === 'tuplet')
      if (tuplets.length !== 2) continue
      const first = system.relationLayout!.get(tuplets[0]!)!, second = system.relationLayout!.get(tuplets[1]!)!
      expect(first.ink.top).toBeCloseTo(second.ink.top)
      expect(first.ink.bottom).toBeCloseTo(second.ink.bottom)
      const tie = system.relations.find(r => r.kind === 'tie')!
      expect(first.ink.bottom).toBeLessThan(system.relationLayout!.get(tie)!.ink.top)
      expect(system.lanes[0]!.top).toBeGreaterThanOrEqual(-first.ink.top)
    }
  })
  it('breaks alignment at ordinary notes and at system or lane boundaries', () => {
    const separated = brackets(layout('([1 2 3:2]) 4 ([5ee 6 7:2]) 1e'))
    expect(separated[0]!.geometry.baseline).toBeGreaterThan(separated[1]!.geometry.baseline)
    const wrapped = brackets(layout('([1 2 3:2]) 4 5 6 | {br} ([4ee 5 6:2]) 7 1e 2e'))
    expect(wrapped[0]!.system).not.toBe(wrapped[1]!.system)
    expect(wrapped[0]!.geometry.baseline).toBeGreaterThan(wrapped[1]!.geometry.baseline)
    const dual = layoutNativeScore(parseM3NDocument('{4/4}\nN: ([1 2 3:2]) 4 5 6 |||\nB: ([1ee 2 3:2]) 4 5 6 |||'), options)
    const lanes = brackets(dual)
    expect(lanes[0]!.relation.first.lane).not.toBe(lanes[1]!.relation.first.lane)
    expect(lanes[0]!.geometry.baseline).toBeGreaterThan(lanes[1]!.geometry.baseline)
  })

  it('keeps an outgoing tie attached to its note inside the tuplet layer', () => {
    const score = layout('[1 2 3~:2] (3) 0.')
    const system = score.systems[0]!
    const bracket = system.relations.find(r => r.kind === 'tuplet')!
    const tie = system.relations.find(r => r.kind === 'tie')!
    expect(system.relations.indexOf(tie)).toBeLessThan(system.relations.indexOf(bracket))
    expect(system.relationLayout!.get(bracket)!.ink.bottom).toBeLessThan(system.relationLayout!.get(tie)!.ink.top)
  })

  it.each(['([3~ 3 3:2]) 4 5 6', '([3 {lg}4 5{/}:2]) 4 5 6'])('nests an internal connection beneath the rhythm bracket: %s', music => {
    const system = layout(music).systems[0]!
    const bracket = system.relations.find(r => r.kind === 'tuplet')!
    const arc = system.relations.find(r => r.kind === 'tie' || r.kind === 'slur')!
    expect(system.relations.indexOf(arc)).toBeLessThan(system.relations.indexOf(bracket))
    expect(system.relationLayout!.get(bracket)!.ink.bottom).toBeLessThan(system.relationLayout!.get(arc)!.ink.top)
  })

  it('keeps a phrase slur outside the whole rhythm group', () => {
    const system = layout('{lg}([1 2 3:2]) 4{/} 5 6').systems[0]!
    const bracket = system.relations.find(r => r.kind === 'tuplet')!
    const slur = system.relations.find(r => r.kind === 'slur')!
    expect(system.relations.indexOf(bracket)).toBeLessThan(system.relations.indexOf(slur))
    const arc = system.relationLayout!.get(slur)!.arc!
    const placed = system.relationLayout!.get(bracket)!
    for (const piece of placed.pieces ?? nativeSvgPieces(placed.svg,measurer)) {
      const edge = nativeRibbonRange(arc,piece.left,piece.right)
      if (edge) expect(piece.top - edge.bottom).toBeGreaterThanOrEqual(nativeCoreGap() * .12 - .005)
    }
  })

  it.each([['[1 2 3:2] 4 5', '3'], ['[1 2 3 4 5:3] 6', '5:3'], ['[1 2 3 4 5:4]', '5']])('preserves enough ratio information for %s', (music, label) => {
    expect(layout(music).relations.find(r => r.kind === 'tuplet')!.label).toBe(label)
  })

  it('only lifts for music ink beneath a painted bracket primitive', () => {
    const { relation, system, geometry } = brackets(layout('([1 2 3:2]) 4 5 6'))[0]!
    const note = relation.first
    // A side accidental clears the hook horizontally, even though it is tall.
    note.musicTop = 80
    note.musicInk = [{ left: -30, right: -20, top: -80, bottom: -10 }]
    expect(nativeTupletGeometry(relation, system, measurer).baseline).toBeCloseTo(geometry.baseline)
    // The same ink under the label must reserve exactly the configured gap.
    const middle = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))[1]!
    middle.musicTop = 80
    middle.musicInk = [{ left: -2, right: 2, top: -80, bottom: -10 }]
    const moved = nativeTupletGeometry(relation, system, measurer)
    const metrics = measurer.measureText('3', { fontSize: moved.fontSize, fontFamily: 'Barlow Semi Condensed' })
    const bottom = moved.baseline - metrics.baseline + (metrics.inkBottom ?? metrics.h)
    expect(-80 - bottom).toBeCloseTo(24 * .14)
  })

  it('draws separated strokes without painting a white mask over other content', () => {
    const score = parseM3NDocument('{4/4}\nN: ([1 2 3:2]) 4 5 6 |||')
    const svg = NativeNumberedNotationScore.create(score).render(options).join('')
    const group = svg.match(/<g[^>]+data-m3n-relation="tuplet"[^>]*>(.*?)<\/g>/)![1]!
    expect(group.match(/<line\b/g)).toHaveLength(4)
    expect(group).not.toContain('<rect')
    expect(group).toContain('font-family="Barlow Semi Condensed"')
  })
})
