import { expect, it } from 'vitest'
import { nativeMusicAxis } from './native-axis.js'
import { measureNativeControl } from './native-controls.js'
import { nativeSvgInk } from './native-ink.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'

it.each([
  { text: 'A', height: 10, ascent: 10 },
  { text: 'g', height: 11, ascent: 7 },
  { text: '乐段', height: 14, ascent: 12 },
])('centers framed section $text on the measured music axis', ({ text, height, ascent }) => {
  const measurer: TextMeasurer = { measureText(value, style) {
    if (style.fontFamily === 'Barlow Semi Condensed') return { w: 11, h: 18, baseline: 14 }
    return { w: value.length * 9, h: height, baseline: ascent }
  } }
  const control = measureNativeControl('section', text, measurer)
  const svg = new NativeSymbols(measurer).control(control)
  const glyph = nativeSvgInk(svg.match(/<text\b[^]*?<\/text>/)![0], measurer)
  const frame = nativeSvgInk(svg.replace(/<text\b[^]*?<\/text>/, ''), measurer)
  const axis = nativeMusicAxis(measurer)
  expect((glyph.top + glyph.bottom) / 2).toBeCloseTo(axis, 6)
  expect((frame.top + frame.bottom) / 2).toBeCloseTo(axis, 6)
  expect(glyph.top - frame.top).toBeCloseTo(3.5, 6)
  expect(frame.bottom - glyph.bottom).toBeCloseTo(3.5, 6)
  expect(-control.top).toBeCloseTo(frame.top, 6)
  expect(control.bottom).toBeCloseTo(frame.bottom, 6)
})
