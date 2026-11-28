import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLayoutQuality } from './native-quality.js'
import { renderNativePages } from './native-svg.js'

const source = readFileSync(new URL('../../../src/scores/bai_hua_lin_01.m3n', import.meta.url), 'utf8')
const options = { width: 564, paged: true, pageMargin: 0 }

it('compares complete tight and loose White Birch page counts before cost and preserves the selected geometry', () => {
  const document = parseM3NDocument(source), before = structuredClone(document)
  const fixed = [8, 16].map(minimumNoteGap => layoutNativeScore(document, { ...options, minimumNoteGap }))
  const timings: Record<string, number> = {}
  const automatic = layoutNativeScore(document, options, timings)
  expect(timings.layoutTrials).toBe(2)
  expect(timings.projectionBuilds).toBe(1)
  expect(timings.projectionReuses).toBe(1)
  expect(timings.relationPlanReuses).toBe(1)
  for (const candidate of fixed) {
    expect(automatic.pages.length).toBeLessThanOrEqual(candidate.pages.length)
    if (automatic.pages.length === candidate.pages.length)
      expect(nativeLayoutQuality(automatic).spacingCost).toBeLessThanOrEqual(nativeLayoutQuality(candidate).spacingCost)
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
  const spacious = layoutNativeScore(document, { ...options, coreGap: 160 })
  expect(spacious.options.minimumNoteGap).toBe(paged.options.minimumNoteGap)
  expect(spacious.systems.map(system => system.measures.map(measure => measure.index)))
    .toEqual(paged.systems.map(system => system.measures.map(measure => measure.index)))
  const timings: Record<string, number> = {}
  layoutNativeScore(document, { ...options, minimumNoteGap: 16 }, timings)
  expect(timings.layoutTrials).toBe(1)
})

it('rejects an extra-page loose tier before comparing physical spacing', () => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/li_hua_you_kai_fang_01.m3n', import.meta.url), 'utf8'))
  const settings = { ...options, width: 528 }
  const tight = layoutNativeScore(document, { ...settings, minimumNoteGap: 8 })
  const loose = layoutNativeScore(document, { ...settings, minimumNoteGap: 16 })
  expect(tight.pages.length).toBeLessThan(loose.pages.length)
  const automatic = layoutNativeScore(document, settings)
  expect(automatic.options.minimumNoteGap).toBe(8)
  expect(renderNativePages(automatic)).toEqual(renderNativePages(tight))
})

it('skips the other tier only after the cheapest tier reaches the one-page floor', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array(6).fill('1 2 3 4 |').join(' '))
  const timings: Record<string, number> = {}
  const automatic = layoutNativeScore(document, { ...options, width: 720 }, timings)
  expect(automatic.pages).toHaveLength(1)
  expect(timings.layoutTrials).toBe(2)
  expect(timings.completedLayoutTrials).toBe(1)
  expect(timings.pageFloorTierPrunes).toBe(1)
  for (const minimumNoteGap of [8, 16]) {
    const fixed = layoutNativeScore(document, { ...options, width: 720, minimumNoteGap })
    expect(nativeLayoutQuality(automatic).spacingCost).toBeLessThanOrEqual(nativeLayoutQuality(fixed).spacingCost)
  }
})
