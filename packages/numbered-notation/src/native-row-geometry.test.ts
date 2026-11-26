import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore, NativeLayoutTask } from './native-layout.js'
import { NumberedTextMeasurementCache } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeAnnotationPieces, nativeAnnotationSvg } from './native-annotations.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeLayoutQuality } from './native-quality.js'

it('publishes continuous coordinates when one numeric row exceeds a paged canvas', () => {
  const chord=Array.from({length:40},(_,index)=>String(index%7+1)).join(' ')
  const score=parseM3NDocument(`{4/4}\nN: [${chord}:h]^^ |||`)
  const result=layoutNativeScore(score,{numericLayout:true,width:528,paged:false})
  expect(result.pages).toHaveLength(1)
  expect(result.pages[0]!.systems).toEqual(result.systems)
  expect(result.pages[0]!.height).toBeGreaterThan(800)
  expect(result.projection.glyphs[0]!.y).toBeGreaterThan(800)
})

it.each(['row', 'measure', 'element'] as const)('shares resolved lyric geometry with %s pagination and creates no height probes', avoidance => {
  const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/xing_xing_dian_deng_01.m3n', import.meta.url), 'utf8'))
  const timings: Record<string, number> = {}
  const layout = layoutNativeScore(document, { numericLayout: true, avoidance, width: 558, minimumNoteGap: 8, paged: true, pageMargin: 0 }, timings)
  expect(timings.measureHeightBuilds ?? 0).toBe(0)
  expect(timings.measureAvoidancePageCorrections ?? 0).toBe(0)
  for (const row of layout.systems) {
    const lane = row.lanes[0]!
    const glyphs = row.measures.flatMap(m => m.columns.flatMap(c => c.glyphs))
    const firstTier = glyphs.flatMap(g => [...(g.lyricBaselines ?? [])].filter(([index]) => index === 0).map(([, baseline]) => baseline))
    if (firstTier.length) expect(new Set(firstTier).size).toBe(1)
    expect(lane.bottom).toBeGreaterThanOrEqual(lane.lyricBottom ?? 0)
  }
  for (const system of layout.systems) for (const placed of system.relationLayout?.values() ?? []) {
    const actual = nativeSvgInk(placed.svg, layout.measurer)
    for (const key of ['left','right','top','bottom'] as const) expect(placed.ink[key]).toBeCloseTo(actual[key], 4)
  }
})

it('reuses foundational geometry across widths with fresh-task parity', () => {
  const document = parseM3NDocument('{4/4}\nN: (1 2) 3 4 | 1 2 (3 4) | 1 2 3 4 | 1 2 3 4 |\nL: 一二三四 | 五六七八 | 九十一二 | 三四五六')
  const layoutTask = new NativeLayoutTask(), textMeasurementCache = new NumberedTextMeasurementCache()
  const options = { numericLayout: true, paged: true, pageMargin: 0, layoutTask, textMeasurementCache }
  layoutNativeScore(document, { ...options, width: 528 })
  const timing: Record<string,number> = {}
  const cached = layoutNativeScore(document, { ...options, width: 648 }, timing)
  const fresh = layoutNativeScore(document, { ...options, width: 648, layoutTask: new NativeLayoutTask() })
  expect(timing.projectionBuilds ?? 0).toBe(0)
  expect(timing.projectionReuses).toBeGreaterThan(0)
  expect(nativeLayoutQuality(cached)).toEqual(nativeLayoutQuality(fresh))
  expect(cached.pages.length).toBe(fresh.pages.length)
})

it('numerical annotation bounds match the rendered text and frame', () => {
  const l=layoutNativeScore(parseM3NDocument('{4/4}\nN: {expression=Andante}1 2 3 4 |'), { numericLayout:true,width:528,paged:true })
  const g=l.systems[0]!.measures[0]!.columns[0]!.glyphs[0]!, painter=new NativeSymbols(l.measurer)
  for(const annotation of g.annotationLayout ?? []) {
    const pieces=nativeAnnotationPieces(annotation,l.measurer), ink=nativeSvgInk(nativeAnnotationSvg(annotation,0,painter),l.measurer)
    expect(Math.min(...pieces.map(p=>p.top))).toBeCloseTo(ink.top,4)
    expect(Math.max(...pieces.map(p=>p.bottom))).toBeCloseTo(ink.bottom,4)
  }
})

it('keeps row-cache output identical to uncached geometry evaluation', async () => {
  const { renderNativePages } = await import('./native-svg.js')
  const { nativeRowCoreLowerBound } = await import('./native-row-geometry.js')
  const source = readFileSync(new URL('../../../src/works/snail-mushroom-waves.m3n', import.meta.url), 'utf8')
  const document = parseM3NDocument(source)
  const options = {numericLayout:true,width:624,paged:true,pageMargin:0,minimumNoteGap:8}
  const cached=layoutNativeScore(document,options)
  const fresh=layoutNativeScore(document,{...options,cachePageLineGeometry:false})
  expect(cached.pages.length).toBe(fresh.pages.length)
  expect(nativeLayoutQuality(cached)).toEqual(nativeLayoutQuality(fresh))
  expect(renderNativePages(cached)).toEqual(renderNativePages(fresh))
  for(const [index, row] of cached.systems.entries()) {
    const block=cached.verticalBlocks[cached.headerBlocks.length+index]!
    expect(block.resolvedInk).toBe(true)
    const lower=nativeRowCoreLowerBound(row.measures,cached.measurer,row.coreGap!)
    expect(lower.core!.bottom).toBeLessThanOrEqual(block.core!.bottom-block.baseline!+1e-5)
    expect(lower.core!.top).toBeGreaterThanOrEqual(block.core!.top-block.baseline!-1e-5)
    expect(Math.max(...lower.ink!.map(p=>p.bottom))).toBeLessThanOrEqual(Math.max(...block.ink!.map(p=>p.bottom-block.baseline!))+1e-5)
    expect(Math.min(...lower.ink!.map(p=>p.top))).toBeGreaterThanOrEqual(Math.min(...block.ink!.map(p=>p.top-block.baseline!))-1e-5)
  }
})
