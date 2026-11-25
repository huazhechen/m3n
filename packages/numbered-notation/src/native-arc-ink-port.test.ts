import { expect, it } from 'vitest'
import { parseM3NDocument, validateM3NDiagnostics } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeArcGeometry } from './native-arc.js'
import { nativeArcSlice } from './native-curve.js'

it('clears the actual intervening octave dots without promoting lower beam widths to their height', () => {
  const source = '{4/4}\nN: ((0 {lg}6 3e 2e 1e 7 6 5)) 4{/} 0 |||'
  expect(validateM3NDiagnostics(source)).toEqual([])
  const layout = layoutNativeScore(parseM3NDocument(source), { width: 320, paged: false, pageMargin: 11 })
  const arc = nativeArcGeometry(layout.relations[0]!, layout.systems[0]!)
  const gaps = layout.projection.glyphs.filter(glyph => glyph.pitches[0]!.octave > 0).flatMap(glyph =>
    glyph.musicInk!.filter(piece => piece.bottom < 0 && Math.abs((piece.right - piece.left) - (piece.bottom - piece.top)) < 1e-6).flatMap(piece =>
      [piece.left, piece.right].map(x => piece.top - nativeArcSlice(arc.commands, glyph.x + x)!.bottom)))
  expect(gaps.length).toBeGreaterThan(0)
  expect(Math.min(...gaps)).toBeCloseTo(24 * .05, 6)
})
