import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { splitNativeMeasure } from './native-wrapping.js'
import type { NativeMeasure } from './native-model.js'

// Fixed physical columns let these tests distinguish balancing, beat placement
// and tuplet protection independently of platform font metrics.
const measured = (count: number): NativeMeasure => ({
  id: 'dense', source: { events: [] }, part: 0, index: 0, beats: count / 2,
  columns: Array.from({ length: count }, (_, index) => ({ time: index / 2, glyphs: [], left: 10, right: 10, x: 0,
    minimumStart: index * 20, minimumEnd: (index + 1) * 20 })),
  breakBefore: true, breakAfter: false, extraGap: 12, minimum: count * 20,
  minimumStart: 0, minimumEnd: count * 20,
  start: 0, end: 0, continuation: false, lastFragment: true,
})

describe('native dense-measure wrapping', () => {
  it('balances the complete bar instead of greedily filling its first line', () => {
    const measure = measured(20), before = structuredClone(measure)
    const fragments = splitNativeMeasure(measure, 256)
    expect(fragments.map(fragment => fragment.columns.length)).toEqual([10, 10])
    expect(fragments.map(fragment => fragment.extraGap)).toEqual([12, 0])
    expect(fragments.map(fragment => fragment.continuation)).toEqual([false, true])
    expect(fragments.map(fragment => fragment.lastFragment)).toEqual([false, true])
    expect(fragments.map(fragment => fragment.minimum)).toEqual([200, 200])
    expect(measure).toEqual(before)
  })

  it('prefers an integer beat over an equally balanced off-beat break', () => {
    expect(splitNativeMeasure(measured(17), 220).map(fragment => fragment.columns.length)).toEqual([8, 9])
  })

  it('uses the measured minimum width as the sole capacity limit', () => {
    const measure = measured(20)
    measure.minimum = 200
    measure.columns.forEach((column, index) => { column.minimumStart = index * 10; column.minimumEnd = (index + 1) * 10 })
    expect(splitNativeMeasure(measure, 256)).toEqual([measure])
    expect(splitNativeMeasure(measure, 160)).toHaveLength(2)
  })

  it('keeps a following short bar out of the last dense-bar fragment', () => {
    const source = `{10/4}\nN: (${Array(20).fill('1').join(' ')}) | {1/4} 2 |||`
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 320, paged: false })
    expect(layout.systems).toHaveLength(3)
    expect(layout.systems.map(system => system.measures.map(measure => measure.index + 1))).toEqual([[1], [1], [2]])
  })

  it('keeps every child of a tuplet in one system in narrow layouts', () => {
    const document = parseM3NDocument('{16/4}\nN: [123:2] [345:2] [567:2] [123:2] [345:2] [567:2] [123:2] [345:2] |||')
    const layout = layoutNativeScore(document, { width: 320, paged: false, wrapWidthRatio: 0.6 })
    expect(layout.systems.length).toBeGreaterThan(1)
    const systemsByEvent = new Map<object, Set<number>>()
    for (const system of layout.systems) for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) {
      const systems = systemsByEvent.get(glyph.event!) ?? new Set<number>()
      systems.add(system.index); systemsByEvent.set(glyph.event!, systems)
    }
    expect(systemsByEvent.size).toBe(8)
    for (const systems of systemsByEvent.values()) expect(systems.size).toBe(1)
    expect(layout.projection.glyphs).toHaveLength(24)
  })

  it('protects tuplets in either voice while keeping their columns aligned', () => {
    const document = parseM3NDocument('{8/4}\nN: [123:2] [345:2] [567:2] [123:2] |||\nB: (1d 2d 3d 4d 5d 6d 7d 1) (1d 2d 3d 4d 5d 6d 7d 1) |||')
    const layout = layoutNativeScore(document, { width: 320, paged: false })
    expect(layout.systems.length).toBeGreaterThan(1)
    const voices = layout.systems.flatMap(system => system.measures.flatMap(measure => measure.columns))
    expect(voices.some(column => column.glyphs.length > 1)).toBe(true)
    for (const column of voices) for (const glyph of column.glyphs) expect(glyph.x).toBe(column.x)
    for (const event of [...document.parts.values()][0]!.melody[0]!.events) {
      const systems = layout.systems.filter(system => system.measures.some(measure => measure.columns.some(column => column.glyphs.some(glyph => glyph.event === event))))
      expect(systems).toHaveLength(1)
    }
  })
})
