import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, NativeLayoutTask } from './native-layout.js'
import { NumberedTextMeasurementCache, DefaultTextMeasurer } from './native-measure.js'
import { renderNativePages } from './native-svg.js'
import { PreparedNumberedNotationScore } from './native-score.js'

afterEach(() => vi.unstubAllGlobals())

it.each(['katyusha_01.m3n', 'flower_dance_01.m3n', 'valsentino_01.m3n'])('measurement arenas preserve retained candidates and final drawings: %s', file => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/' + file, import.meta.url), 'utf8'))
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const retained: Array<{ measured: PreparedNumberedNotationScore; reference: PreparedNumberedNotationScore }> = []
  for (const width of [528, 720, 594, 528]) {
    const options = { width, numericLayout: true, pageMargin: 0 }
    const measured = PreparedNumberedNotationScore.measure(document, { ...options, layoutTask, textMeasurementCache })
    const reference = new PreparedNumberedNotationScore(document, options)
    expect(measured.quality).toEqual(reference.quality)
    expect(measured.pageCount).toBe(reference.pageCount)
    expect(measured.systemCount).toBe(reference.systemCount)
    expect(measured.continuousHeight()).toBe(reference.continuousHeight())
    retained.push({ measured, reference })
  }
  for (const { measured, reference } of retained) {
    expect(measured.continuousHeight()).toBe(reference.continuousHeight())
    expect(measured.renderPaged()).toEqual(reference.renderPaged())
    expect(measured.renderContinuous()).toEqual(reference.renderContinuous())
  }
}, 60000)

it('detaches borrowed glyphs, controls and split columns without changing preparation or earlier layouts', () => {
  const document = parseM3NDocument('{4/4}\nN: {inst}{lg}' + '1 2 3 4 | {key=G}5 6 7 1e | '.repeat(8) + '{/}{/} 1^^ |||')
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const options = { width: 720, minimumNoteGap: 16, numericLayout: true, paged: true, pageMargin: 0, wrapWidthRatio: .3 }
  layoutNativeScore(document, { ...options, layoutTask, textMeasurementCache })
  const preparation = layoutTask.preparationFor(document, options, textMeasurementCache)
  const measured = structuredClone(preparation.measuredProjections)
  const rejected: Record<string, number> = {}
  expect(() => layoutNativeScore(document, { ...options, width: 534, layoutTask, textMeasurementCache }, rejected, 1.01, 1))
    .toThrow('cannot improve')
  expect(rejected.deferredGlyphCopyMs).toBeUndefined()
  expect(preparation.measuredProjections).toEqual(measured)
  const saved: Array<{ layout: ReturnType<typeof layoutNativeScore>; svg: string[] }> = []
  for (const width of [320, 534, 624, 720]) {
    const timings: Record<string, number> = {}
    const layout = layoutNativeScore(document, { ...options, width, layoutTask, textMeasurementCache }, timings)
    if (width === 320) expect(layout.systems.some(system => system.measures.some(measure => measure.continuation))).toBe(true)
    const svg = renderNativePages(layout)
    expect(svg).toEqual(renderNativePages(layoutNativeScore(document, { ...options, width })))
    expect(timings.deferredGlyphCopyMs).toBeGreaterThanOrEqual(0)
    expect(preparation.measuredProjections).toEqual(measured)
    saved.push({ layout, svg })
    for (const prior of saved) expect(renderNativePages(prior.layout)).toEqual(prior.svg)
  }
})

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

it('keeps measured preparation independent across gap floors and equal-measure settings', () => {
  const document = parseM3NDocument('{4/4}\nN: {inst}' + '1 2 3 4 | 5 6 7 1e | '.repeat(4) + '{/} 1^^ |||')
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  for (const [width, minimumNoteGap, minimumNoteGapFloor, equalMeasures] of [
    [528, 8, 0, false], [720, 16, 4, true], [534, 8, 4, false], [624, 16, 0, false], [528, 8, 0, false],
  ] as const) {
    const options = { width, minimumNoteGap, minimumNoteGapFloor, equalMeasures, numericLayout: true, paged: true, pageMargin: 0 }
    const actual = layoutNativeScore(document, { ...options, layoutTask, textMeasurementCache })
    expect(renderNativePages(actual)).toEqual(renderNativePages(layoutNativeScore(document, options)))
    actual.projection.glyphs[0]!.parenthesisLeft = -100000
    actual.projection.measures[0]!.columns[0]!.minimumStart = -100000
  }
})


it('compiled surrogate plans preserve unplaced inputs and leave exact final geometry available', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + '{lg}1 2 3 4{/} |{br} '.repeat(18))
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const options = {width:528,numericLayout:true,pageMargin:0,layoutTask,textMeasurementCache}
  vi.stubGlobal('__m3nExperimentalRowReuse',true)
  vi.stubGlobal('__m3nExperimentalInkBin',12)
  PreparedNumberedNotationScore.measure(document,options)
  const preparation = layoutTask.preparationFor(document,options,textMeasurementCache)
  const unplaced = structuredClone(preparation.measuredProjections)
  const timings:Record<string,number> = {}
  const surrogate = PreparedNumberedNotationScore.measure(document,{...options,width:576},timings)
  expect(timings.compiledProxyPlans).toBeGreaterThan(0)
  expect(preparation.measuredProjections).toEqual(unplaced)
  const quality = structuredClone(surrogate.quality)
  vi.stubGlobal('__m3nExperimentalRowReuse',false)
  const final = new PreparedNumberedNotationScore(document,{...options,width:576})
  const fresh = new PreparedNumberedNotationScore(document,{width:576,numericLayout:true,pageMargin:0})
  expect(final.renderPaged()).toEqual(fresh.renderPaged())
  expect(final.renderContinuous()).toEqual(fresh.renderContinuous())
  expect(surrogate.quality).toEqual(quality)
})
