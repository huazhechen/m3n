import { SCORE_TEXT_FONT } from './font-family.js'
import { describe, expect, it, vi } from 'vitest'
import { CanvasTextMeasurer, NumberedTextMeasurementCache } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { bravuraGeometry } from './bravura.js'
import { nativeSvgInk } from './native-ink.js'
import { measureNativeControl } from './native-controls.js'
import { nativeMarkInk } from './native-marks.js'

const context = () => ({ font: '', textAlign: 'center', textBaseline: 'top', measureText() {
  return { width: 8.5, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 13, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 }
} }) as unknown as CanvasRenderingContext2D

describe('native logical advance and painted ink', () => {
  it('shares complete text metrics only for matching effective fonts inside one task', () => {
    const cache = new NumberedTextMeasurementCache(), timings: Record<string, number> = {}
    const canvas = context(), measurer = new CanvasTextMeasurer(canvas, timings, cache)
    const style = { fontSize: 20, fontFamily: SCORE_TEXT_FONT }
    const original = measurer.measureText('A', style)
    original.advance = 999
    expect(measurer.measureText('A', { ...style, fontWeight: 500, fontStyle: 'normal' }).advance).toBe(8.5)
    for (const changed of [{ fontSize: 21 }, { fontFamily: 'serif' }, { fontWeight: 700 }, { fontStyle: 'italic' as const }])
      measurer.measureText('A', { ...style, ...changed })
    measurer.measureText('AA', style)
    const shared = new CanvasTextMeasurer(context(), timings, cache)
    expect(shared.measureText('A', style).advance).toBe(8.5)
    expect(timings).toMatchObject({ textMeasureRequests: 8, textMeasureCalls: 6, textMeasureCacheHits: 2 })
    const freshTimings: Record<string, number> = {}
    new CanvasTextMeasurer(context(), freshTimings, new NumberedTextMeasurementCache()).measureText('A', style)
    expect(freshTimings.textMeasureCalls).toBe(1)
    expect(freshTimings.textMeasureCacheHits).toBeUndefined()
  })
  it('invalidates task metrics when font membership or loading status changes', () => {
    const first = { status: 'loaded' }, second = { status: 'loaded' }, faces = new Set([first])
    vi.stubGlobal('document', { fonts: faces })
    try {
      const cache = new NumberedTextMeasurementCache(), timings: Record<string, number> = {}
      const measurer = new CanvasTextMeasurer(context(), timings, cache), style = { fontSize: 20 }
      expect(cache.synchronizeFonts()).toBe(true)
      measurer.measureText('A', style)
      expect(cache.synchronizeFonts()).toBe(false)
      measurer.measureText('A', style)
      first.status = 'loading'
      expect(cache.synchronizeFonts()).toBe(true)
      measurer.measureText('A', style)
      faces.delete(first); faces.add(second) // Same count, different font face.
      expect(cache.synchronizeFonts()).toBe(true)
      measurer.measureText('A', style)
      expect(timings).toMatchObject({ textMeasureCalls: 3, textMeasureCacheHits: 1 })
    } finally { vi.unstubAllGlobals() }
  })
  it('remeasures unchanged text and restores externally changed canvas state', () => {
    const canvas = context(), measurer = new CanvasTextMeasurer(canvas)
    const style = { fontSize: 20, fontFamily: SCORE_TEXT_FONT }
    let installedFont = ''
    Object.defineProperty(canvas, 'font', {
      get: () => installedFont,
      set: (value: string) => { installedFont = value.replace(/^normal /, '') },
    })
    let width = 8.5, calls = 0
    canvas.measureText = () => {
      calls++
      expect(canvas.textAlign).toBe('left')
      expect(canvas.textBaseline).toBe('alphabetic')
      expect(canvas.font).toBe(`500 20px ${SCORE_TEXT_FONT}`)
      return { width, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 13, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 } as TextMetrics
    }
    expect(measurer.measureText('A', style).advance).toBe(8.5)
    width = 12 // Newly available font metrics must be read even for the same text.
    expect(measurer.measureText('A', style).advance).toBe(12)
    canvas.font = 'italic 700 14px serif'; canvas.textAlign = 'right'; canvas.textBaseline = 'top'
    expect(measurer.measureText('A', style).advance).toBe(12)
    expect(calls).toBe(3)
  })
  it('keeps overhang separate from advance and still measures the complete painted text', () => {
    const canvas = context(), measurer = new CanvasTextMeasurer(canvas)
    const metrics = measurer.measureText('A', { fontSize: 20, fontFamily: SCORE_TEXT_FONT })
    expect(canvas.font).toBe(`normal 500 20px ${SCORE_TEXT_FONT}`)
    expect(metrics.w).toBe(8.5)
    expect(metrics.advance).toBe(8.5)
    expect(metrics.inkLeft).toBe(-3)
    expect(metrics.inkRight).toBe(13)
    expect(canvas.textAlign).toBe('left')
    expect(canvas.textBaseline).toBe('alphabetic')
    const ink = nativeSvgInk(new NativeSymbols(measurer).text('A', 0, 0, 20), measurer)
    expect(new NativeSymbols(measurer).text('A', 0, 0, 20)).toContain('font-weight="500"')
    expect(ink.left).toBe(-3)
    expect(ink.right).toBe(13)
  })
  it('reserves frame padding beyond negative bearings and right overhang', () => {
    const measurer = new CanvasTextMeasurer(context())
    const control = measureNativeControl('section', 'A', measurer)
    const svg = new NativeSymbols(measurer).control(control)
    const text = /<text[^>]*x="([^"]+)"/.exec(svg)!
    const x = Number(text[1])
    expect(x - 3).toBeCloseTo(3.6, 4)
    expect(control.width - x - 13).toBeCloseTo(3.6, 4)
  })
})

it('shares immutable fixed symbol geometry only inside a task and resets it with fonts', () => {
  const faces = new Set([{status:'loaded'}])
  vi.stubGlobal('document',{fonts:faces})
  try {
    const cache = new NumberedTextMeasurementCache(), timings: Record<string,number> = {}
    cache.synchronizeFonts()
    const first = new CanvasTextMeasurer(context(),timings,cache)
    const glyph = bravuraGeometry('dynamicForte',12,true,first)
    const sameTask = new CanvasTextMeasurer(context(),timings,cache)
    expect(bravuraGeometry('dynamicForte',12,true,sameTask)).toBe(glyph)
    expect(()=>Object.assign(glyph.ink,{left:999})).toThrow()
    expect(bravuraGeometry('dynamicForte',24,true,sameTask).height).toBeCloseTo(glyph.height*2)
    expect(bravuraGeometry('dynamicForte',12,false,sameTask)).not.toBe(glyph)
    const fresh = new CanvasTextMeasurer(context(),undefined,new NumberedTextMeasurementCache())
    expect(bravuraGeometry('dynamicForte',12,true,fresh)).not.toBe(glyph)
    faces.add({status:'loaded'})
    cache.synchronizeFonts()
    expect(bravuraGeometry('dynamicForte',12,true,sameTask)).not.toBe(glyph)
    expect(timings).toMatchObject({fixedSymbolRequests:5,fixedSymbolCacheHits:1,fixedSymbolBuilds:4})
    const mark = nativeMarkInk('mf', first)
    expect(nativeMarkInk('mf', sameTask)).toBe(mark)
    expect(mark).toEqual(nativeSvgInk(new NativeSymbols(first).rawMark('mf'), first))
    expect(Object.isFrozen(mark)).toBe(true)
    faces.add({status:'loaded'})
    cache.synchronizeFonts()
    expect(nativeMarkInk('mf',sameTask)).not.toBe(mark)
  } finally {vi.unstubAllGlobals()}
})

it('uses immutable metrics internally while public calls stay isolated', () => {
  const cache = new NumberedTextMeasurementCache(), timings: Record<string, number> = {}
  const layout = new CanvasTextMeasurer(context(), timings, cache, true)
  const measurer = new CanvasTextMeasurer(context(), undefined, cache)
  const style = {fontSize:20}
  const first = layout.measureText('A', style)
  expect(Object.isFrozen(first)).toBe(true)
  expect(layout.measureText('A', {...style, fontWeight:500, fontStyle:'normal', textAlign:'right'})).toBe(first)
  const publicMetrics = measurer.measureText('A',style)
  publicMetrics.w=999
  expect(layout.measureText('A',style)).toBe(first)
  expect(first.w).toBe(8.5)
  expect(new CanvasTextMeasurer(context(), undefined, cache, true).measureText('A',style)).toBe(first)
  expect(new CanvasTextMeasurer(context(), undefined, new NumberedTextMeasurementCache(), true).measureText('A',style)).not.toBe(first)
  expect(timings).toMatchObject({textMeasureRequests:3,textMeasureCalls:1,textMeasureCacheHits:2,textMeasureFontKeyBuilds:1})
  for (const changed of [{fontSize:21},{fontFamily:'serif'},{fontWeight:700},{fontStyle:'italic' as const}])
    expect(layout.measureText('A',{...style,...changed})).not.toBe(first)
})

it('refreshes an existing layout font bucket after membership and status changes', () => {
  const face={status:'loaded'}, faces=new Set([face])
  vi.stubGlobal('document',{fonts:faces})
  try {
    const cache=new NumberedTextMeasurementCache(),timings:Record<string,number>={}
    cache.synchronizeFonts()
    const layout=new CanvasTextMeasurer(context(),timings,cache,true),style={fontSize:20}
    const a=layout.measureText('A',style)
    expect(layout.measureText('A',style)).toBe(a)
    face.status='loading'; cache.synchronizeFonts()
    const b=layout.measureText('A',style)
    expect(b).not.toBe(a)
    faces.clear(); faces.add({status:'loaded'}); cache.synchronizeFonts()
    expect(layout.measureText('A',style)).not.toBe(b)
    expect(timings).toMatchObject({textMeasureCalls:3,textMeasureCacheHits:1,textMeasureFontKeyBuilds:1})
  } finally {vi.unstubAllGlobals()}
})
