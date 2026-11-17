import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore } from './score.js'
import { layoutNativeScore } from './native-layout.js'
import { projectNativeScore } from './native-model.js'
import { measureNativeHorizontal, placeNativeHorizontal } from './native-horizontal.js'
import type { TextMeasurer } from './native-measure.js'

const textMeasurer: TextMeasurer = { measureText(text, style) {
  return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 }
} }

it.each([0, 1, 2, 3, 4])('retains the 0.1em floor after rhythmic and beam scaling at level %s', level => {
  const source = `N: ${'('.repeat(level)}1 1 1 1${')'.repeat(level)} |||`
  const document = parseM3NDocument(source)
  const gap = (floor: number) => {
    const projection = projectNativeScore(document, { textMeasurer })
    const options = { noteGapEm: .4, minimumNoteGapEm: .4, minimumNoteGapFloorEm: floor, pairedSpacing: true }
    measureNativeHorizontal(projection.measures, options)
    placeNativeHorizontal(projection.measures, options, 0, projection.measures[0]!.minimum)
    const [first, second] = projection.glyphs
    return second!.x - first!.x - first!.right - second!.left
  }
  const expected = 8.8 * Math.sqrt(2 ** -level) * (level ? .5 : 1)
  // The native iterative solver retains its existing subpixel tolerance.
  expect(gap(.1)).toBeCloseTo(Math.max(expected, 2.2), 1)
  if (level >= 3) expect(gap(.1)).toBeGreaterThan(gap(0))
})

it('validates floor overrides in both rendering engines', () => {
  const document = parseM3NDocument('N: 1 2 3 4 |||')
  for (const floor of [-1, NaN, Infinity, .41]) {
    const options = { width: 600, paged: false, textMeasurer, minimumNoteGapFloorEm: floor }
    expect(() => NumberedNotationScore.create(document).render(options)).toThrow('最小间距下限')
    expect(() => layoutNativeScore(document, options)).toThrow('最小间距下限')
  }
})
