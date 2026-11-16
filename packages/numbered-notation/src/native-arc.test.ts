import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeArcGeometry, nativeArcPath } from './native-arc.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'

const options = { width: 800, paged: false }
describe('native musical arc geometry', () => {
  it('uses a tapered ribbon whose measured height equals its cubic extremum', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1e 2e{/} |||'), options)
    const relation = layout.relations[0]!, system = layout.systems[0]!
    const arc = nativeArcGeometry(relation, system)
    const [start, outer, inner, close] = arc.commands
    if (start?.op !== 'M' || outer?.op !== 'C' || inner?.op !== 'C') throw new Error('expected a closed cubic ribbon')
    expect(close?.op).toBe('Z')
    expect(start.x).toBe(relation.first.x)
    expect(outer.x).toBe(relation.last.x)
    expect(inner.x).toBe(start.x)
    expect(inner.y).toBe(start.y)
    const topAtMidpoint = (start.y + outer.y + 3 * outer.cy1 + 3 * outer.cy2) / 8
    const innerAtMidpoint = (outer.y + inner.y + 3 * inner.cy1 + 3 * inner.cy2) / 8
    expect(-topAtMidpoint).toBeCloseTo(arc.top)
    expect(innerAtMidpoint - topAtMidpoint).toBeCloseTo(22 * 0.09)
    expect(system.lanes[0]!.top).toBeCloseTo(arc.top)
  })

  it('continues across systems with an opening curve, a flat ribbon and a closing curve', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2 | {br}3 4 | {br}5 6{/} |||'), options)
    expect(layout.systems).toHaveLength(3)
    const relation = layout.relations[0]!
    const arcs = layout.systems.map(system => nativeArcGeometry(relation, system))
    expect(arcs.map(arc => arc.commands.filter(command => command.op === 'Q').length)).toEqual([2, 0, 2])
    expect(arcs.map(arc => arc.height)).toEqual([9.9, 9.9, 9.9])
    for (const [index, arc] of arcs.entries()) {
      expect(arc.commands.at(-1)?.op).toBe('Z')
      expect(nativeArcPath(arc)).not.toMatch(/NaN|Infinity/)
      expect(layout.systems[index]!.lanes[0]!.top).toBeCloseTo(arc.top)
    }
  })

  it('clears a high intervening note and shares that envelope with pagination', () => {
    const layout = layoutNativeScore(parseM3NDocument('{3/4}\nN: {lg}1 2ee 3{/} |||'), options)
    const arc = nativeArcGeometry(layout.relations[0]!, layout.systems[0]!)
    const high = layout.projection.glyphs[1]!
    expect(arc.top - arc.height).toBeGreaterThan(high.top)
    expect(layout.systems[0]!.lanes[0]!.top).toBeCloseTo(arc.top)
  })

  it('starts a continued arc after the shared voice connector', () => {
    const layout = layoutNativeScore(parseM3NDocument('{2/4}\nN: {lg}1 2 | {br}3 4{/} |||\nB: 1d^ | 5d^ |||'), options)
    const second = layout.systems[1]!, relation = layout.relations.find(relation => relation.kind === 'slur')!
    const firstNote = second.measures[0]!.columns[0]!.glyphs.find(glyph => glyph.lane === 'melody')!
    const arc = nativeArcGeometry(relation, second)
    expect(arc.left).toBeGreaterThan(second.measures[0]!.start + 20)
    expect(arc.left).toBeCloseTo(firstNote.x - firstNote.musicLeft!)
  })

  it('fills the measured ribbon without adding an outline that thickens its tips', () => {
    const document = parseM3NDocument('{2/4}\nN: {lg}1 2{/} |||')
    const svg = NativeNumberedNotationScore.create(document).render(options).join('')
    const arcs = svg.match(/<path[^>]+data-m3n-relation="slur"[^>]*>/g)!
    expect(arcs).toHaveLength(1)
    expect(arcs[0]).toContain('fill="#000"')
    expect(arcs[0]).not.toMatch(/\sstroke=/)
    expect(arcs[0]).toContain('transform="translate(0 ')
  })
})
