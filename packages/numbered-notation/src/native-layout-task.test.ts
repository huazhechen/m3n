import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, NativeLayoutTask } from './native-layout.js'
import { NumberedTextMeasurementCache, DefaultTextMeasurer } from './native-measure.js'
import { renderNativePages } from './native-svg.js'

afterEach(() => vi.unstubAllGlobals())

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])('shares unplaced preparation across widths and settings without sharing placement: %s', file => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
  const before = structuredClone(document), layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const variants = [{}, { numericLayout: true }, { fixedDo: true }, { includeBass: false }, { transpose: 5 }, { tempoScale: 1.2 }, { measureNumbers: true, equalMeasures: true }]
  for (const variant of variants) for (const width of [480, 720, 540, 640, 480]) {
    const options = { width, pageMargin: 0, paged: true, ...variant }
    const timings: Record<string, number> = {}
    const actual = layoutNativeScore(document, { ...options, layoutTask, textMeasurementCache }, timings)
    const reference = layoutNativeScore(document, options)
    expect(renderNativePages(actual)).toEqual(renderNativePages(reference))
    expect(actual.options.minimumNoteGap).toBe(reference.options.minimumNoteGap)
    if (width === 720) expect(timings.projectionBuilds).toBeUndefined()
    // Mutating one candidate must not modify the shared unplaced preparation.
    actual.projection.glyphs[0]!.x = -100000
  }
  expect(document).toEqual(before)
}, 60000)

it('rebuilds preparation for new tasks, changed fonts, changed measurers and changed metric caches', () => {
  const face = { status: 'loaded' }, fonts = new Set([face])
  vi.stubGlobal('document', { fonts })
  const document = parseM3NDocument('{4/4}\nN: {lg}1 2 3 4{/} |||')
  let task = new NativeLayoutTask(), cache = new NumberedTextMeasurementCache(), measurer = new DefaultTextMeasurer()
  const run = () => {
    const timings: Record<string, number> = {}
    layoutNativeScore(document, { width: 640, paged: true, layoutTask: task, textMeasurementCache: cache, textMeasurer: measurer }, timings)
    return timings
  }
  expect(run().projectionBuilds).toBe(1)
  expect(run().projectionBuilds).toBeUndefined()
  face.status = 'loading'
  expect(run().projectionBuilds).toBe(1)
  fonts.add({ status: 'loaded' })
  expect(run().projectionBuilds).toBe(1)
  measurer = new DefaultTextMeasurer()
  expect(run().projectionBuilds).toBe(1)
  cache = new NumberedTextMeasurementCache()
  expect(run().projectionBuilds).toBe(1)
  task = new NativeLayoutTask()
  expect(run().projectionBuilds).toBe(1)
})

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])('horizontal screening preserves complete engraving and rejects only certified scores: %s', file => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  for (const width of [528, 624, 768]) {
    const options = { width, paged: true, pageMargin: 0, layoutTask, textMeasurementCache }
    const reference = layoutNativeScore(document, options)
    const screened = layoutNativeScore(document, options, undefined, 0)
    expect(renderNativePages(screened)).toEqual(renderNativePages(reference))
    expect(() => layoutNativeScore(document, options, undefined, 1.01)).toThrow('cannot improve')
  }
}, 60000)

it('reuses width-independent row minima across widths without reusing placed geometry', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array(12).fill('1 2 3 4 |').join(' '))
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const run = (width: number, minimumNoteGap = 8) => {
    const timings: Record<string, number> = {}
    const layout = layoutNativeScore(document, { width, minimumNoteGap, paged: true, pageMargin: 0, layoutTask, textMeasurementCache }, timings)
    expect(renderNativePages(layout)).toEqual(renderNativePages(layoutNativeScore(document, { width, minimumNoteGap, paged: true, pageMargin: 0 })))
    return timings
  }
  expect(run(720).lineMinimumBuilds).toBeGreaterThan(0)
  const narrower = run(528)
  expect(narrower.lineMinimumCacheHits).toBeGreaterThan(0)
  expect(narrower.lineMinimumBuilds).toBeUndefined()
  expect(run(528, 16).lineMinimumBuilds).toBeGreaterThan(0)
})
