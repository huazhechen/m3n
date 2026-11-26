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
