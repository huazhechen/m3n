import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeStyle } from './native-style.js'

it.each([
  '{lg}{p}1 2 3 4{/}',
  '{lg}1 {mf}2 3 4{/}',
  '{lg}1 2 3 4{tr}{/}',
])('places an outer mark at its local curve clearance instead of the whole bow top: %s', music => {
  const score = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} |||`), { width: 800, paged: false })
  const system = score.systems[0]!, placed = [...system.relationLayout!.values()][0]!
  const glyph = score.projection.glyphs.find(g => g.markLayout?.length)!, mark = glyph.markLayout![0]!
  const left = Math.max(placed.arc!.left, glyph.x + mark.left), right = Math.min(placed.arc!.right, glyph.x + mark.right)
  let top = Infinity
  for (let i = 0; i <= 2000; i++) {
    top = Math.min(top, nativeArcSlice(placed.arc!.commands, left + (right - left) * i / 2000)!.top)
  }
  expect(top - mark.top - mark.height).toBeCloseTo(nativeStyle.markGap, 4)
  expect(mark.top + mark.height).toBeGreaterThan(placed.ink.top - nativeStyle.markGap + 0.1)
})
