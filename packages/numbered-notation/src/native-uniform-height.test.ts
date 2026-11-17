import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'

it.each([320, 360])('shares a paragraph host envelope across mixed-paragraph rows at %ipx', width => {
  const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |\n---\nN: 1eeee 2 3 4 | 1 2 3 4 | 1 2 3 4 |||'),
    { width, paged: false, pageMargin: 11, uniformSystemHeight: true })
  expect(score.systems).toHaveLength(2)
  const groups = score.systems.map(system => new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph)))))
  expect(groups[0]!.size).toBe(2)
  expect(groups[1]!.size).toBe(1)
  expect(score.systems[1]!.lanes[0]!.top).toBeCloseTo(score.systems[0]!.lanes[0]!.top, 8)
})

it('does not propagate another paragraph’s tall host through their shared row', () => {
  const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1eeee 2 3 4 |\n---\nN: 1 2 3 4 | 1 2 3 4 | 1 2 3 4 |||'),
    { width: 320, paged: false, pageMargin: 11, uniformSystemHeight: true })
  expect(score.systems).toHaveLength(2)
  expect(score.systems[0]!.lanes[0]!.top).toBeGreaterThan(score.systems[1]!.lanes[0]!.top + 10)
})
