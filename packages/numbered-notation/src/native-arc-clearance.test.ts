import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeStyle } from './native-style.js'

// Dense independent verification is deliberately confined to tests. Layout
// must solve measured curve intervals without a pixel grid or a raster margin.
describe('nested arc clearance', () => {
  it.each([
    '{4/4}\nN: {lg}1 2 {lg}3 4{/}{/} |||',
    '{4/4}\nN: {lg}{lg}1 2{/} 3 4{/} |||',
    '{4/4}\nN: {lg}1 {lg}2 3{/} 4{/} |||',
  ])('packs the actual curved ribbons to the music-size gap: %s', source => {
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false })
    const system = layout.systems[0]!, [inner, outer] = system.relations
    const a = nativeArcGeometry(outer!, system), b = nativeArcGeometry(inner!, system)
    const ay = system.relationLayout!.get(outer!)!.ink.top + a.top
    const by = system.relationLayout!.get(inner!)!.ink.top + b.top
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right)
    let gap = Infinity
    for (let i = 0; i <= 2000; i++) {
      const x = left + (right - left) * i / 2000
      gap = Math.min(gap, nativeArcSlice(b.commands, x)!.top + by - nativeArcSlice(a.commands, x)!.bottom - ay)
    }
    expect(gap).toBeCloseTo(nativeStyle.music / 12, 3)
  })
})

it('bounds stationary clearances across unequal spans, narrow overlaps and flat inner edges', async () => {
  const { nativeRibbonClearance } = await import('./native-curve.js')
  const ribbon = (left: number, right: number, height: number) => {
    const run = (right - left) / 4, low = Math.max(0, height - 1.98) * 4 / 3
    return { left, right, commands: [
      { op: 'M' as const, x: left, y: 0 },
      { op: 'C' as const, cx1: left + run, cy1: -height * 4 / 3, cx2: right - run, cy2: -height * 4 / 3, x: right, y: 0 },
      { op: 'C' as const, cx1: right - run, cy1: -low, cx2: left + run, cy2: -low, x: left, y: 0 },
      { op: 'Z' as const },
    ] }
  }
  for (const [left, right] of [[0, 50], [50, 100], [20, 70], [0, 100], [.000001, .01], [80, 140]]) for (const height of [1, 11, 44]) {
    const outer = ribbon(0, 100, height!), inner = ribbon(left!, right!, height! * .8)
    const gap = height! * .15, precision = height! * 1e-6
    const lift = nativeRibbonClearance(outer, inner, gap, precision)
    let sampled = 0
    for (let i = 0; i <= 1000; i++) {
      const a = Math.max(outer.left, inner.left), b = Math.min(outer.right, inner.right), x = a + (b - a) * i / 1000
      sampled = Math.max(sampled, nativeArcSlice(outer.commands, x)!.bottom - nativeArcSlice(inner.commands, x)!.top + gap)
    }
    expect(lift).toBeGreaterThanOrEqual(sampled - 1e-7)
    expect(lift - sampled).toBeLessThan(height! * 1e-4)
  }
})
