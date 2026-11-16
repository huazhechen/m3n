// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { measureNativeTempo } from './native-controls.js'
import { NativeSymbols } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { nativeMusicAxis } from './native-axis.js'
import { layoutNativeScore } from './native-layout.js'
import { nativeHeaderGeometry } from './native-header.js'

const unusual: TextMeasurer = { measureText(text, style) {
  const ascent = style.fontSize * (text.startsWith('=') ? .3 : 1.1)
  const descent = style.fontSize * (text.startsWith('=') ? .7 : .1)
  return { w: text.length * style.fontSize * .6, h: ascent + descent, baseline: ascent }
} }

describe('measured metronome marks', () => {
  it.each([new DefaultTextMeasurer(), unusual])('aligns measured text and reserves the complete filled outline for every beat unit', measurer => {
    for (const unit of [1, 2, 4, 8, 16, 32, 64]) {
      const control = measureNativeTempo({ unit, bpm: 96 }, measurer)
      const svg = new NativeSymbols(measurer).control(control)
      const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
      const text = root.querySelector('text')!, path = root.querySelector('path')!
      const textInk = nativeSvgInk(text.outerHTML, measurer), ink = nativeSvgInk(svg, measurer)
      expect((textInk.top + textInk.bottom) / 2).toBeCloseTo(nativeMusicAxis(measurer), 4)
      expect(control.top).toBeCloseTo(-ink.top, 6)
      expect(control.bottom).toBeCloseTo(ink.bottom, 6)
      expect(ink.left).toBeGreaterThanOrEqual(-.0001)
      expect(ink.right).toBeLessThanOrEqual(control.width + .0001)
      expect(path.hasAttribute('stroke')).toBe(false)
      expect(control.tempoGeometry!.unit).toBe(unit)
      const subpaths = path.getAttribute('d')!.match(/M/g)!.length
      expect(subpaths).toBe(unit < 4 ? 2 : 1 + Math.max(0, Math.log2(unit / 4)))
    }
  })

  it.each([1, 2, 4, 8, 16, 32, 64])('keeps unit %i in the header, inline changes and multirest onsets without changing playback', unit => {
    const document = parseM3NDocument(`{key=C}{2/${unit}}{120qpm}\nN: 1 2 | {60qpm}{rest=2} | 3 4 |||`)
    const performance = compileScorePerformance(document), before = structuredClone(document)
    const measurer = new DefaultTextMeasurer()
    const layout = layoutNativeScore(document, { width: 800, paged: false, tempoScale: .5, textMeasurer: measurer })
    const controls = layout.projection.glyphs.flatMap(g => g.controls).filter(c => c.kind === 'tempo')
    expect(controls).toHaveLength(1)
    expect(controls[0]!.tempoGeometry!.unit).toBe(unit)
    expect(controls[0]!.tempoGeometry!.text).toBe(`= ${30 * unit / 4}`)
    const header = nativeHeaderGeometry(document, 800, 32, measurer, 24, { tempoScale: .5 })
    const root = new DOMParser().parseFromString(`<svg>${header.svg}</svg>`, 'image/svg+xml')
    expect(root.querySelector('[data-m3n-role="tempo"]')!.getAttribute('data-m3n-tempo-unit')).toBe(String(unit))
    expect(root.querySelector('[data-m3n-role="tempo"] text')!.textContent).toBe(`= ${60 * unit / 4}`)
    expect(document).toEqual(before)
    expect(compileScorePerformance(document)).toEqual(performance)
  })
})
