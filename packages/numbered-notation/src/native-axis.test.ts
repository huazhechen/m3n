// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativeStyle } from './native-style.js'
import { NativeSymbols } from './native-symbols.js'
import { NativeMusicPainter } from './native-music.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { nativeSvgInk } from './native-ink.js'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'

const unusual: TextMeasurer = { measureText(text, style) {
  return { w: text.length * style.fontSize * .6, h: style.fontSize * .4, baseline: style.fontSize * .1 }
} }

describe('shared measured music axis', () => {
  it.each([new DefaultTextMeasurer(), unusual])('uses one sustain fragment for measurement and painting', measurer => {
    const zero = measurer.measureText('0', { fontSize: nativeStyle.music, fontFamily: 'Barlow Semi Condensed' })
    const axis = zero.h / 2 - zero.baseline, svg = new NativeSymbols(measurer).sustain(0, 0)
    const ink = nativeSvgInk(svg, measurer)
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(axis, 4)
    const metrics = nativeNoteMetrics([{ degree: '1', accidental: '', octave: 0 }], 1, true, measurer)
    expect(metrics.top).toBeCloseTo(-ink.top, 4)
    expect(metrics.bottom).toBeCloseTo(ink.bottom, 4)
  })
  it.each([new DefaultTextMeasurer(), unusual])('aligns multi-rest caps and count to that same axis', measurer => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {rest=2} |||'), { width: 800, paged: false, textMeasurer: measurer })
    const glyph = { ...layout.projection.glyphs[0]!, x: 0, y: 0 }
    const svg = new NativeMusicPainter(measurer).music(glyph)
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
    const beam = root.querySelector('line')!
    const zero = measurer.measureText('0', { fontSize: nativeStyle.music, fontFamily: 'Barlow Semi Condensed' })
    const axis = zero.h / 2 - zero.baseline
    expect(Number(beam.getAttribute('y1'))).toBeCloseTo(axis, 4)
    expect(Number(beam.getAttribute('y2'))).toBeCloseTo(axis, 4)
    const count = nativeSvgInk(root.querySelector('text')!.outerHTML, measurer)
    expect(axis - count.bottom).toBeCloseTo(nativeStyle.music * .175, 4)
  })
})
