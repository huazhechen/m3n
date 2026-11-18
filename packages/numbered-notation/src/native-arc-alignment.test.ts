import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { nativeArcGeometry } from './native-arc.js'
import { layoutNativeScore, type NativeLayout } from './native-layout.js'

const arcs = (layout: NativeLayout) => layout.relations.filter(r => r.kind === 'tie' || r.kind === 'slur')
const heights = (layout: NativeLayout) => arcs(layout).map(relation => {
  const system = layout.systems.find(s => s.measures.some(m => m.columns.some(c => c.glyphs.includes(relation.first))))!
  return nativeArcGeometry(relation, system).height
})
const layout = (source: string, width = 800, paged = false) => layoutNativeScore(parseM3NDocument(source), { width, paged })

describe('semantic automatic arc alignment', () => {
  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('shares height between adjacent short and long phrases at $width, paged=$paged', ({ width, paged }) => {
    const result = layout('{5/4}\nN: {lg}(1 2){/} {lg}3 (4 5) 6 7{/} |||', width, paged)
    const relations = arcs(result)
    expect(relations).toHaveLength(2)
    expect(relations[0]!.arcGroup).toBe(relations[1]!.arcGroup)
    expect(heights(result)[0]).toBeCloseTo(heights(result)[1]!, 8)
    if (width === 320) expect(Math.abs(relations[0]!.last.x - relations[0]!.first.x)).toBeLessThan(55)
  })

  it('keeps local heights when a regular note interrupts the phrases', () => {
    const result = layout('{8/4}\nN: {lg}(1 2){/} 3 {lg}4 5 6 7 1e 2e{/} |||', 320)
    const relations = arcs(result)
    expect(relations[0]!.arcGroup).not.toBe(relations[1]!.arcGroup)
    expect(heights(result)[0]).toBeLessThan(heights(result)[1]!)
  })

  it('joins fractional durations across a bar without treating the bar as a musical gap', () => {
    const result = layout('{1/4}\nN: {lg}(1 2){/} | {3/4}{lg}3 4 5{/} |||', 320)
    const relations = arcs(result)
    expect(relations[0]!.arcGroup).toBe(relations[1]!.arcGroup)
    expect(heights(result)[0]).toBeCloseTo(heights(result)[1]!, 8)
  })

  it('uses only local complete arcs when the semantic chain continues on another system', () => {
    const result = layout('{4/4}\nN: {lg}(1 2){/} {lg}(3 4){/} {lg}(5 6){/} {lg}(7 1e){/} | {br}{2/4}{lg}2e 3e{/} |||', 320)
    const relations = arcs(result)
    expect(result.systems).toHaveLength(2)
    expect(new Set(relations.map(r => r.arcGroup)).size).toBe(1)
    const values = heights(result)
    expect(values[0]).toBeLessThan(values.at(-1)!)
    expect(values.slice(0, -1).every(h => Math.abs(h - values[0]!) < 1e-9)).toBe(true)
  })

  it('aligns siblings independently of nested inner phrases', () => {
    const result = layout('{8/4}\nN: {lg}{lg}1 2{/} 3{/} {lg}{lg}4 5{/} 6 7 1e{/} |||')
    const relations = arcs(result)
    const outers = relations.filter(r => relations.some(inner => inner !== r && inner.first === r.first
      && inner.last.event!.sourceStart < r.last.event!.sourceStart))
    expect(outers).toHaveLength(2)
    expect(outers[0]!.arcGroup).toBe(outers[1]!.arcGroup)
    for (const outer of outers) {
      const inner = relations.find(r => r !== outer && r.first === outer.first)!
      expect(outer.arcGroup).not.toBe(inner.arcGroup)
    }
    const h = outers.map(r => nativeArcGeometry(r, result.systems[0]!).height)
    expect(h[0]).toBeCloseTo(h[1]!, 8)
  })

  it('keeps melody and bass groups independent', () => {
    const result = layout('{4/4}\nN: {lg}(1 2){/} {lg}3 4 5{/} |||\nB: {lg}1d 2d 3d 4d{/} |')
    const melody = arcs(result).filter(r => r.first.lane === 'melody'), bass = arcs(result).find(r => r.first.lane === 'bass')!
    expect(melody).toHaveLength(2)
    expect(melody[0]!.arcGroup).toBe(melody[1]!.arcGroup)
    expect(melody[0]!.arcGroup).not.toBe(bass.arcGroup)
  })

  it('retains source and performance while alignment is recomputed for each width', () => {
    const document = parseM3NDocument('{4/4}\nN: {lg}(1 2){/} {lg}3 4 5{/} |||')
    const before = structuredClone(document), performance = compileScorePerformance(document)
    for (const width of [320, 1000]) layoutNativeScore(document, { width, paged: true })
    expect(document).toEqual(before)
    expect(compileScorePerformance(document)).toEqual(performance)
  })
})
