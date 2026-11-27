import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderSharedNumberedNotationScores } from './native-score.js'

it('applies the score minimum gap to every continuous row without changing horizontal layout', () => {
  const source = '{4/4}\nN: ' + Array(10).fill('1 2 3 4 |{br}').join(' ')
  const document = parseM3NDocument(source)
  const compact = parseM3NDocument(`{leading=${2 / 3}}\n` + source)
  const options = { width: 720, pageMargin: 0, paged: false }
  const normal = layoutNativeScore(document, options)
  const small = layoutNativeScore(compact, options)
  expect(small.pages[0]!.coreGap).toBeCloseTo(19.2)
  expect(normal.pages[0]!.coreGap).toBeCloseTo(28.8)
  expect(small.systems).toHaveLength(normal.systems.length)
  expect(small.projection.glyphs.map(glyph => glyph.x)).toEqual(normal.projection.glyphs.map(glyph => glyph.x))
  small.systems.forEach((system, index) => {
    if (index > 0) {
      const distance = system.top - small.systems[index - 1]!.top
      const original = normal.systems[index]!.top - normal.systems[index - 1]!.top
      expect(distance).toBeLessThanOrEqual(original + 1e-6)
      expect(distance).toBeGreaterThanOrEqual(original - 9.6 - 1e-6)
    }
  })
  expect(small.pages[0]!.height).toBeLessThan(normal.pages[0]!.height)
  expect(layoutNativeScore(compact, { ...options, coreGap: 20 }).pages[0]!.coreGap).toBe(20)
  expect(layoutNativeScore({ ...document, coreGapEm: 44 / 28.8 }, { ...options, paged: true }).pages.every(page => page.coreGap! >= 44 - 1e-6 && page.coreGap! <= 48.4 + 1e-6)).toBe(true)
})

it('uses the score minimum to determine pages, then stretches each page up to the core-derived maximum', () => {
  const document = parseM3NDocument(`{leading=${2 / 3}}{4/4}\nN: ` + Array(10).fill('1 2 3 4 |{br}').join(' '))
  const options = { width: 320, pageMargin: 0, paged: true }
  const compact = layoutNativeScore(document, options)
  const normal = layoutNativeScore({ ...document, coreGapEm: 1 }, options)
  expect(compact.pages).toHaveLength(1)
  expect(normal.pages).toHaveLength(2)
  expect(compact.systems).toHaveLength(normal.systems.length)
  expect(compact.pages[0]!.coreGap).toBeGreaterThan(19.2)
  expect(compact.pages[0]!.coreGap).toBeLessThan(28)
  expect(normal.pages[1]!.coreGap).toBeCloseTo(31.68)
})

it('honors smaller shared-page minima while preserving the ordinary minimum for mixed scores', () => {
  const document = parseM3NDocument(`{leading=${2 / 3}}{4/4}\nN: ` + Array(5).fill('1 2 3 4 |{br}').join(' '))
  const options = { width: 350, pageMargin: 0 }
  const compact = renderSharedNumberedNotationScores([document, document], options)
  expect(compact.coreGap).toBeGreaterThanOrEqual(19.2)
  expect(compact.coreGap).toBeLessThan(28)
  expect(() => renderSharedNumberedNotationScores([document, { ...document, coreGapEm: 1 }], options)).toThrow('最小核心行距')
})
