import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { scoreVerticalSpacing } from './layout/policy.js'
import { renderSharedNumberedNotationScores } from './native-score.js'

it('uses the configured hard minimum in continuous output and honors explicit row gaps', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array(10).fill('1 2 3 4 |{br}').join(' '))
  const options = { width: 720, pageMargin: 0, paged: false }
  const compact = layoutNativeScore(document, options)
  const explicit = layoutNativeScore(document, { ...options, coreGap: 25 })
  expect(compact.pages[0]!.coreGap).toBeCloseTo(scoreVerticalSpacing().minimum)
  expect(explicit.pages[0]!.coreGap).toBe(25)
  expect(compact.systems.map(row => row.measures.map(measure => measure.id))).toEqual(explicit.systems.map(row => row.measures.map(measure => measure.id)))
  expect(compact.projection.glyphs.map(glyph => glyph.x)).toEqual(explicit.projection.glyphs.map(glyph => glyph.x))
})

it('fits every page within the normalized minimum and maximum', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array(18).fill('1 2 3 4 |{br}').join(' '))
  const layout = layoutNativeScore(document, {width: 320, pageMargin: 0, paged: true})
  const spacing = scoreVerticalSpacing()
  expect(layout.pages.length).toBeGreaterThan(1)
  expect(layout.pages.every(page => page.coreGap! >= spacing.minimum && page.coreGap! <= spacing.maximum)).toBe(true)
})

it('uses the same normalized limits when fitting shared-score pages', () => {
  const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
  const result = renderSharedNumberedNotationScores([document, document], {width: 720, pageMargin: 0})
  expect(result.coreGap).toBeGreaterThanOrEqual(scoreVerticalSpacing().minimum)
  expect(result.coreGap).toBeLessThanOrEqual(scoreVerticalSpacing().maximum)
})
