import { SCORE_TEXT_FONT } from './font-family.js'
import { describe, expect, it } from 'vitest'
import { CanvasTextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { measureNativeControl } from './native-controls.js'

const context = () => ({ font: '', textAlign: 'center', textBaseline: 'top', measureText() {
  return { width: 8.5, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 13, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 }
} }) as unknown as CanvasRenderingContext2D

describe('native logical advance and painted ink', () => {
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
    expect(x - 3).toBeCloseTo(3.5, 4)
    expect(control.width - x - 13).toBeCloseTo(3.5, 4)
  })
})
