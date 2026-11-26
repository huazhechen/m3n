import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLayoutScore } from './native-quality.js'
import { renderNativePages } from './native-svg.js'

const source = readFileSync(new URL('../../../src/scores/bai_hua_lin_01.m3n', import.meta.url), 'utf8')
const options = { width: 564, paged: true, pageMargin: 0 }

it('compares complete tight and loose White Birch layouts and preserves the selected geometry', () => {
  const document = parseM3NDocument(source), before = structuredClone(document)
  const fixed = [8, 12].map(minimumNoteGap => layoutNativeScore(document, { ...options, minimumNoteGap }))
  const timings: Record<string, number> = {}
  const automatic = layoutNativeScore(document, options, timings)
  expect(timings.layoutTrials).toBe(2)
  expect(timings.projectionBuilds).toBe(1)
  expect(timings.projectionReuses).toBe(1)
  expect(timings.relationPlanReuses).toBe(1)
  for (const candidate of fixed) {
    expect(automatic.pages.length).toBeLessThanOrEqual(candidate.pages.length)
    if (automatic.pages.length === candidate.pages.length)
      expect(nativeLayoutScore(automatic)).toBeGreaterThanOrEqual(nativeLayoutScore(candidate))
  }
  const selected = fixed.find(candidate => candidate.options.minimumNoteGap === automatic.options.minimumNoteGap)!
  expect(renderNativePages(automatic)).toEqual(renderNativePages(selected))
  expect(document).toEqual(before)
})

it('keeps White Birch horizontal geometry identical in paged and continuous display', () => {
  const document = parseM3NDocument(source)
  const paged = layoutNativeScore(document, options)
  const continuous = layoutNativeScore(document, { ...options, paged: false })
  expect(continuous.options.minimumNoteGap).toBe(paged.options.minimumNoteGap)
  expect(continuous.systems.map(system => system.measures.map(measure => measure.index)))
    .toEqual(paged.systems.map(system => system.measures.map(measure => measure.index)))
  expect(continuous.projection.glyphs.map(glyph => glyph.x)).toEqual(paged.projection.glyphs.map(glyph => glyph.x))
  const timings: Record<string, number> = {}
  layoutNativeScore(document, { ...options, minimumNoteGap: 12 }, timings)
  expect(timings.layoutTrials).toBe(1)
})
