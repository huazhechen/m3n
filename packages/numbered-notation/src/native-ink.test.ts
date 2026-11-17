// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { nativePathInk, nativeSvgInk, nativeSvgPieces } from './native-ink.js'
import { CanvasTextMeasurer, DefaultTextMeasurer, type TextMeasurer } from './native-measure.js'
import { NativeSymbols } from './native-symbols.js'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { nativeStyle } from './native-style.js'
import { nativeArcSlice } from './native-curve.js'

const fallback = new DefaultTextMeasurer()
// Deliberately taller/uneven ink, italic overhang and nonstandard descenders.
const measured: TextMeasurer = { measureText(text, style) {
  const advance = [...text].length * style.fontSize * 0.7
  const ascent = style.fontSize * (/[春奏1]/.test(text) ? 1.15 : 0.65), descent = style.fontSize * (/[gp]/.test(text) ? 0.4 : 0.12)
  const left = style.fontStyle === 'italic' ? -style.fontSize * 0.15 : 0
  return { w: advance - left, h: ascent + descent, baseline: ascent, advance, inkLeft: left, inkRight: advance, centerOffset: left / 2 }
} }

describe('native painted geometry', () => {
  it('finds the true quadratic and cubic extrema instead of control-point heights', () => {
    expect(nativePathInk('M0 0 Q10 -20 20 0 Z')).toEqual({ left: 0, right: 20, top: -10, bottom: 0 })
    expect(nativePathInk('M0 0 C0 -20 20 -20 20 0 Z').top).toBe(-15)
    const relative = nativePathInk('M1e1 10 q10 -20 20 0 h5 v5 l-5 0 z')
    expect(relative).toEqual({ left: 10, right: 35, top: 0, bottom: 15 })
  })
  it('unions translated primitives and their strokes', () => {
    expect(nativeSvgInk('<g transform="translate(10 20)"><circle cx="0" cy="0" r="2"/><path d="M0 0 L4 -6" stroke="black" stroke-width="2"/></g>', fallback))
      .toEqual({ left: 8, right: 15, top: 13, bottom: 22 })
  })
  it('preserves separate painted pieces through nested transforms', () => {
    expect(nativeSvgPieces('<g transform="translate(10 20)"><circle cx="0" cy="0" r="2"/><g transform="translate(100 5)"><rect x="0" y="0" width="10" height="3" stroke="black" stroke-width="2"/></g></g>', fallback))
      .toEqual([{ left: 8, right: 12, top: 18, bottom: 22 }, { left: 109, right: 121, top: 24, bottom: 29 }])
  })
  it('measures text style, baseline, advance, overhang, anchors and XML entities', () => {
    const painter = new NativeSymbols(measured)
    const svg = painter.text('p&g', 50, 60, 20, 'serif', { 'font-style': 'italic', 'text-anchor': 'middle' })
    const ink = nativeSvgInk(svg, measured)
    expect(ink.left).toBeCloseTo(27.5)
    expect(ink.right).toBeCloseTo(72.5)
    expect(ink.top).toBe(47)
    expect(ink.bottom).toBe(68)
  })
  it('uses actual Canvas ascent/descent and italic font selection', () => {
    const context = { font: '', measureText: () => ({ width: 13, actualBoundingBoxLeft: 2, actualBoundingBoxRight: 14, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 }) }
    const m = new CanvasTextMeasurer(context as unknown as CanvasRenderingContext2D).measureText('p', { fontSize: 22, fontStyle: 'italic', fontWeight: 700 })
    expect(context.font).toBe('italic 700 22px serif')
    expect(m).toMatchObject({ w: 13, h: 12, baseline: 9, advance: 13, inkLeft: -2, inkRight: 14 })
    const ink = nativeSvgInk('<text x="0" y="0" font-size="22" font-family="serif" font-style="italic" font-weight="700">A</text>', new CanvasTextMeasurer(context as unknown as CanvasRenderingContext2D))
    expect(ink.right - ink.left).toBe(16)
  })
  it.each(['<polygon/>', '<path d="M0 0 A1 1 0 0 0 2 2"/>', '<g transform="rotate(30)"><circle r="1"/></g>'])('rejects unimplemented geometry: %s', svg => {
    expect(() => nativeSvgInk(svg, fallback)).toThrow(/Unsupported/)
  })

  it.each([false, true])('contains every painted primitive within each system at unusual font metrics, uniform=%s', uniform => {
    const source = '{title=春天 g}{subtitle=演奏}{4/4}{order=A,B}\n===A{br}\nN: {chord=C}{text=春天} {lg}1{ac(2e 3e)}{tr}{p} 2{fermata} 3{prall} 4{/} |\n---V1\nN: (1d 2 3) 4{rit.} 5 :||\n---V2\nN: {cresc}1 2 3 4{/} | {br} {8va}5 6 7 1e{/} |||\nL: 春天在哪里呀 | 春天在哪里 | 春天在哪里 | 春天在哪里\nB: [1d3d5d:h]^^ | 1d^^^ | 1d^^^ | 1d^^^'
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 600, paged: true, measureNumbers: true, textMeasurer: measured, uniformSystemHeight: uniform })
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html')
    for (const system of layout.systems) {
      const node = root.querySelector(`#m3n-system-${system.page + 1}-${system.index}`)!
      const ink = nativeSvgInk(node.outerHTML, measured)
      expect(ink.top).toBeGreaterThanOrEqual(system.top - 0.001)
      expect(ink.bottom).toBeLessThanOrEqual(system.bottom + 0.001)
    }
  })
  it('keeps expressions outside nested arcs with measured clearance', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {lg}{p}1{tr} 2~ 2^{hold} 4{/} |||'), { width: 800, paged: false, textMeasurer: measured })
    const system = layout.systems[0]!, glyph = layout.projection.glyphs[0]!
    const relations = [...system.relationLayout!.values()]
    expect(relations).toHaveLength(2)
    const inner = relations[0]!.arc!, outer = relations[1]!.arc!
    const left = Math.max(inner.left, outer.left), right = Math.min(inner.right, outer.right)
    for (let i = 0; i <= 1000; i++) {
      const x = left + (right - left) * i / 1000
      expect(nativeArcSlice(inner.commands, x)!.top - nativeArcSlice(outer.commands, x)!.bottom)
        .toBeGreaterThanOrEqual(nativeStyle.music * .15 - 0.001)
    }
    const mark = glyph.markLayout!.find(m => m.name === 'tr')!
    expect(mark.top + mark.height).toBeLessThanOrEqual(Math.min(...relations.map(r => r.ink.top)) - nativeStyle.markGap + 0.001)
    // Expression/ornament placement must not feed back into note arc ports.
    expect(glyph.musicTop).toBeLessThan(-mark.top)
  })
})
