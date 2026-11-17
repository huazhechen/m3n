import { parseM3NDocument } from '@m3n/notation'
import { expect, it } from 'vitest'
import { layoutNativeScore } from './native-layout.js'

it.each([
  { name: 'repeat count', music: '1 2 3 4 :||| {x3}', shared: false },
  { name: 'expression', music: '{ff}1 2 3 4 |||', shared: true },
])('uses the correct paragraph scope for $name', ({ music, shared }) => {
  const document = parseM3NDocument(`{4/4}\nN: 1 2 3 4 | {br} 1 2 3 4 |\n---\nN: ${music}`)
  const score = layoutNativeScore(document, { width: 800, paged: false, pageMargin: 11, uniformSystemHeight: true })
  expect(score.systems).toHaveLength(2)
  const groups = score.systems.map(system => new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph)))))
  expect(groups[0]!.size).toBe(1)
  expect(groups[1]!.size).toBe(2)
  if (shared) expect(score.systems[1]!.lanes[0]!.top).toBeCloseTo(score.systems[0]!.lanes[0]!.top, 8)
  else expect(score.systems[1]!.lanes[0]!.top).toBeGreaterThan(score.systems[0]!.lanes[0]!.top + 5)
})
