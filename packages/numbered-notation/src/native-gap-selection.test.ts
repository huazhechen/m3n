import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLayoutQuality } from './native-quality.js'
import { scorePageCost } from './layout/quality.js'
import { renderNativePages } from './native-svg.js'

const source = readFileSync(new URL('../../../src/scores/bai_hua_lin_01.m3n', import.meta.url), 'utf8')
const options = { width: 564, paged: true, pageMargin: 0 }

it('compares complete White Birch paper and spacing costs and preserves the selected geometry', () => {
  const document = parseM3NDocument(source), before = structuredClone(document)
  const fixed = [8, 12, 16].map(minimumNoteGap => layoutNativeScore(document,
    {...options, minimumNoteGap, lineDensityTarget: minimumNoteGap === 16 ? .5 : 2/3}))
  const timings: Record<string, number> = {}
  const automatic = layoutNativeScore(document, options, timings)
  expect(timings.layoutTrials).toBeGreaterThanOrEqual(2)
  expect(timings.projectionBuilds).toBe(1)
  expect(timings.projectionReuses).toBeGreaterThanOrEqual(1)
  expect(timings.relationPlanReuses).toBeGreaterThanOrEqual(1)
  for (const candidate of fixed) {
    expect(nativeLayoutQuality(automatic).totalCost + scorePageCost(automatic.pages.length))
      .toBeLessThanOrEqual(nativeLayoutQuality(candidate).totalCost + scorePageCost(candidate.pages.length))
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
  expect(timings.layoutTrials).toBeGreaterThanOrEqual(1)
})

it('keeps the tight tier when the loose spacing benefit cannot offset an extra page', () => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/li_hua_you_kai_fang_01.m3n', import.meta.url), 'utf8'))
  const settings = { ...options, width: 528 }
  const tight = layoutNativeScore(document, { ...settings, minimumNoteGap: 8, lineDensityTarget: 2/3 })
  const loose = layoutNativeScore(document, { ...settings, minimumNoteGap: 16, lineDensityTarget: .5 })
  expect(tight.pages.length).toBeLessThan(loose.pages.length)
  const automatic = layoutNativeScore(document, settings)
  expect(automatic.options.minimumNoteGap).toBe(8)
  expect(renderNativePages(automatic)).toEqual(renderNativePages(tight))
})

it('preserves the best of all three tiers on the one-page floor with joint spacing costs', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array(6).fill('1 2 3 4 |').join(' '))
  const timings: Record<string, number> = {}
  const automatic = layoutNativeScore(document, { ...options, width: 720 }, timings)
  expect(automatic.pages).toHaveLength(1)
  expect(timings.layoutTrials).toBeGreaterThanOrEqual(2)
  expect(timings.layoutTrials).toBe(3)
  expect(timings.pageFloorTierPrunes ?? 0).toBe(0)
  for (const minimumNoteGap of [8, 12, 16]) {
    const fixed = layoutNativeScore(document, { ...options, width: 720, minimumNoteGap, lineDensityTarget: minimumNoteGap === 16 ? .5 : 2/3 })
    expect(nativeLayoutQuality(automatic).totalCost).toBeLessThanOrEqual(nativeLayoutQuality(fixed).totalCost)
    if (minimumNoteGap === automatic.options.minimumNoteGap) expect(renderNativePages(automatic)).toEqual(renderNativePages(fixed))
  }
})
