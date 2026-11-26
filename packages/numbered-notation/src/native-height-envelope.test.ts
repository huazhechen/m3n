import { expect, it } from 'vitest'
import { nativeEnvelopeBlock, nativeHeightEnvelope, mergeNativeHeightEnvelopes } from './native-height-envelope.js'
import { prepareNativePagination } from './native-pagination.js'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, NativeLayoutTask } from './native-layout.js'
import { NumberedTextMeasurementCache } from './native-measure.js'
import { nativeLayoutQuality } from './native-quality.js'

it('merges asymmetric cores about their shared music centre, preserving total ink bounds', () => {
  const merged = mergeNativeHeightEnvelopes([
    { coreAbove: 20, coreBelow: 4, extraAbove: 0, extraBelow: 30, hasLyrics: false },
    { coreAbove: 5, coreBelow: 18, extraAbove: 22, extraBelow: 0, hasLyrics: true },
  ])
  expect(merged).toEqual({ coreAbove: 20, coreBelow: 18, extraAbove: 7, extraBelow: 16, hasLyrics: true })
  expect(nativeHeightEnvelope(nativeEnvelopeBlock(merged, 600, -9), -9, true)).toEqual(merged)
})

it('uses the maximum of core clearance and full-envelope clearance with ratio 0.3', () => {
  const upper = { coreAbove: 10, coreBelow: 5, extraAbove: 0, extraBelow: 20, hasLyrics: false }
  const lower = { coreAbove: 15, coreBelow: 7, extraAbove: 12, extraBelow: 0, hasLyrics: false }
  const blocks = [nativeEnvelopeBlock(upper, 500), nativeEnvelopeBlock(lower, 500)]
  const options = { pageHeight: Infinity, margin: 0, gap: 20 }
  const result = prepareNativePagination(blocks, { wholeRows: true, nonCoreGapRatio: .3 })(options)
  expect(result.positions[1]!.top - result.positions[0]!.top).toBe(5 + 15 + Math.max(20, 20 + 12 + 20 * .3))
  const old = prepareNativePagination(blocks, { wholeRows: true, nonCoreGapRatio: .5 })(options)
  expect(old.heights[0]! - result.heights[0]!).toBe(4)
})

it('reuses measure heights across widths without changing fresh-task pagination or quality', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array.from({ length: 20 }, () => "1 2 3 4 |").join(' '))
  const layoutTask = new NativeLayoutTask()
  const firstTiming: Record<string, number> = {}, secondTiming: Record<string, number> = {}
  const options = { paged: true, rowEnvelope: true, pageMargin: 0, layoutTask, textMeasurementCache: new NumberedTextMeasurementCache() }
  layoutNativeScore(document, { ...options, width: 528 }, firstTiming)
  const cached = layoutNativeScore(document, { ...options, width: 648 }, secondTiming)
  const fresh = layoutNativeScore(document, { ...options, width: 648, layoutTask: new NativeLayoutTask() })
  expect(firstTiming.measureHeightBuilds).toBeGreaterThan(0)
  expect(secondTiming.measureHeightBuilds ?? 0).toBe(0)
  expect(secondTiming.rowHeightCacheHits).toBeGreaterThan(0)
  expect(cached.pages.length).toBe(fresh.pages.length)
  expect(nativeLayoutQuality(cached)).toEqual(nativeLayoutQuality(fresh))
  expect(cached.systems.map(row => row.measures.map(measure => measure.id))).toEqual(fresh.systems.map(row => row.measures.map(measure => measure.id)))
})

it('keeps the opening expression below the actual header after cached-height placement', async () => {
  const { readFileSync } = await import('node:fs')
  const { nativeSvgPieces } = await import('./native-ink.js')
  const { nativeCoreGap } = await import('./native-style.js')
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/ai_de_li_zan_01.m3n', import.meta.url), 'utf8'))
  for (const width of [528, 552, 648]) {
    const layout = layoutNativeScore(document, { width, paged: true, rowEnvelope: true, pageMargin: 0 })
    const system = layout.systems[0]!
    const glyph = system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
      .find(glyph => glyph.annotationLayout?.some(item => item.text.includes('Andante')))!
    const expression = glyph.annotationLayout!.find(item => item.text.includes('Andante'))!
    const lane = system.lanes.find(lane => lane.id === glyph.lane)!
    const expressionTop = system.top + lane.y - expression.top
    const headerBottom = Math.max(...nativeSvgPieces(layout.pages[0]!.header!, layout.measurer).map(piece => piece.bottom))
    expect(expressionTop - headerBottom).toBeGreaterThanOrEqual(nativeCoreGap(document) * .8 - 1e-6)
  }
})

it('lets disjoint measure extras cross while retaining full core clearance', () => {
  const core = { top: -10, bottom: 10 }
  const upper = { height: 50, core, ink: [
    { left: 0, right: 90, top: -10, bottom: 50 },
    { left: 100, right: 200, top: -10, bottom: 10 },
  ] }
  const lower = { height: 10, core, ink: [
    { left: 0, right: 90, top: -10, bottom: 10 },
    { left: 100, right: 200, top: -50, bottom: 10 },
  ] }
  const options = { pageHeight: Infinity, margin: 0, gap: 20 }
  const measures = prepareNativePagination([upper, lower], { wholeRows: false, nonCoreGapRatio: .3 })(options)
  const rows = prepareNativePagination([upper, lower], { wholeRows: true, nonCoreGapRatio: .3 })(options)
  expect(rows.heights[0]! - measures.heights[0]!).toBe(40)
  expect(measures.positions[1]!.top - measures.positions[0]!.top).toBe(66)
})

it('reuses minimum-gap measure heights in rectangle mode across width searches', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array.from({ length: 24 }, () => '1 2 3 4 |').join(' '))
  const layoutTask = new NativeLayoutTask(), timings: Record<string, number> = {}
  const options = { paged: true, rowEnvelope: true, measureAvoidance: true, pageMargin: 0, textMeasurementCache: new NumberedTextMeasurementCache() }
  layoutNativeScore(document, { ...options, width: 528, layoutTask })
  const cached = layoutNativeScore(document, { ...options, width: 648, layoutTask }, timings)
  const fresh = layoutNativeScore(document, { ...options, width: 648 })
  expect(timings.measureHeightBuilds ?? 0).toBe(0)
  expect(cached.pages.length).toBe(fresh.pages.length)
  expect(nativeLayoutQuality(cached)).toEqual(nativeLayoutQuality(fresh))
})
