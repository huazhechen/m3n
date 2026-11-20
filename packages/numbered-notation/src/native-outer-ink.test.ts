import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcSlice } from './native-curve.js'
import { nativeSvgPieces } from './native-ink.js'
import { nativeStyle } from './native-style.js'

it.each([
  '{lg}{p}1 2 3 4{/}',
  '{lg}1 {mf}2 3 4{/}',
  '{lg}1 2 3 {f}4{/}',
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

it.each(['{text=间奏}2', '{mf}2', '2{tr}'])('ignores the empty span between instrumental parentheses for %s', middle => {
  const textMeasurer = { measureText(text: string, style: {fontSize: number}) {
    const parenthesis = text === '(' || text === ')'
    return { w: [...text].length * style.fontSize * .5, h: style.fontSize * (parenthesis ? 1.3 : .7), baseline: style.fontSize * (parenthesis ? 1.1 : .7) }
  } }
  const results = [false, true].map(instrumental => layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${instrumental ? '{inst}' : ''}1 ${middle} 3 4${instrumental ? '{/}' : ''} |||`), {width:800, paged:false, textMeasurer}))
  const host = (score: typeof results[number]) => score.projection.glyphs[1]!
  const extent = (score: typeof results[number]) => {
    const glyph = host(score)
    return glyph.annotationLayout?.[0]?.top ?? -glyph.markLayout![0]!.top
  }
  expect(extent(results[1]!)).toBeCloseTo(extent(results[0]!), 5)
})

it('still clears a real parenthesis overlapping a wide dynamic', () => {
  const textMeasurer = { measureText(text: string, style: {fontSize: number}) {
    const parenthesis = text === '(' || text === ')'
    return { w: [...text].length * style.fontSize * .5, h: style.fontSize * (parenthesis ? 1.3 : .7), baseline: style.fontSize * (parenthesis ? 1.1 : .7) }
  } }
  const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: {inst}{mf}1 2 3 4{/} |||'), {width:800, paged:false, textMeasurer})
  const system = score.systems[0]!, glyph = score.projection.glyphs[0]!, mark = glyph.markLayout![0]!
  const bracket = [...system.relationLayout!.values()][0]!
  const pieces = nativeSvgPieces(bracket.svg, textMeasurer)
    .filter(piece => piece.left <= glyph.x + mark.right && piece.right >= glyph.x + mark.left)
  expect(pieces).toHaveLength(1)
  expect(pieces[0]!.top - mark.top - mark.height).toBeCloseTo(nativeStyle.markGap, 5)
})
