import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { nativeArcGeometry } from './native-arc.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeStyle } from './native-style.js'

describe('independent phrase arc heights', () => {
  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('uses each complete arc span at $width, paged=$paged', ({ width, paged }) => {
    const result = layoutNativeScore(parseM3NDocument('{5/4}\nN: {lg}(1 2){/} {lg}3 (4 5) 6 7{/} |||'), {width, paged})
    let checked = 0
    for (const system of result.systems) for (const relation of system.relations) {
      if (relation.kind !== 'slur') continue
      const members = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
      if (!members.includes(relation.first) || !members.includes(relation.last)) continue
      const span = Math.abs(relation.last.x - relation.first.x)
      const ratio = Math.min(1, span / (nativeStyle.music * 2.3))
      expect(nativeArcGeometry(relation, system).height).toBeCloseTo(nativeStyle.music * .5 * ratio * (2 - ratio), 8)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('does not let an adjacent long phrase raise a short phrase', () => {
    const result = layoutNativeScore(parseM3NDocument('{5/4}\nN: {lg}(1 2){/} {lg}3 (4 5) 6 7{/} |||'), {width:320,paged:false})
    const system = result.systems[0]!, [short, long] = system.relations.filter(r => r.kind === 'slur')
    expect(nativeArcGeometry(short!, system).height).toBeLessThan(nativeArcGeometry(long!, system).height)
  })

  it('retains source and performance at different widths', () => {
    const document = parseM3NDocument('{4/4}\nN: {lg}(1 2){/} {lg}3 4 5{/} |||')
    const before = structuredClone(document), performance = compileScorePerformance(document)
    for (const width of [320, 1000]) layoutNativeScore(document, { width, paged: true })
    expect(document).toEqual(before)
    expect(compileScorePerformance(document)).toEqual(performance)
  })
})
