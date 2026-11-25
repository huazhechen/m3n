// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { measureNativeControl } from './native-controls.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'

const unusual: TextMeasurer = { measureText(text, style) {
  const ascent = style.fontSize * (text === '12' ? 1.1 : text === '8' ? .35 : .7)
  const descent = style.fontSize * (text === '12' ? .25 : text === '8' ? .4 : .1)
  return { w: text.length * style.fontSize * .6, h: ascent + descent, baseline: ascent }
} }

describe('measured fraction geometry', () => {
  it.each([new DefaultTextMeasurer(), unusual])('reserves the actual digit ink and symmetric rule clearance', measurer => {
    const control = measureNativeControl('meter', '12/8', measurer)
    const svg = new NativeSymbols(measurer).control(control)
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
    const rule = root.querySelector('rect')!, texts = [...root.querySelectorAll('text')]
    const lineY = Number(rule.getAttribute('y')), lineHeight = Number(rule.getAttribute('height'))
    const num = nativeSvgInk(texts[0]!.outerHTML, measurer), den = nativeSvgInk(texts[1]!.outerHTML, measurer)
    const zero = measurer.measureText('0', { fontSize: nativeStyle.music, fontFamily: 'Barlow Semi Condensed' })
    expect(lineY + lineHeight / 2).toBeCloseTo(zero.h / 2 - zero.baseline, 4)
    expect(lineY - num.bottom).toBeCloseTo(nativeStyle.meter * .08, 4)
    expect(den.top - lineY - lineHeight).toBeCloseTo(nativeStyle.meter * .08, 4)
    const ink = nativeSvgInk(svg, measurer)
    expect(control.top).toBeCloseTo(-ink.top, 6)
    expect(control.bottom).toBeCloseTo(ink.bottom, 6)
    expect(ink.left).toBeGreaterThanOrEqual(-.0001)
    expect(ink.right).toBeLessThanOrEqual(control.width + .0001)
    expect(control.meterGeometry).toBeDefined()
    expect(lineY).toBeCloseTo(control.meterGeometry!.lineY, 4)
  })
})
