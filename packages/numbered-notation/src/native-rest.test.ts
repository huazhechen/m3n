// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { renderNativePages } from './native-svg.js'
import { NativeMusicPainter } from './native-music.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'

const measurer = new DefaultTextMeasurer()
const painter = new NativeMusicPainter(measurer)
const layoutRest = (count: number, width = 800) => layoutNativeScore(parseM3NDocument(`{4/4}\nN: 1 2 3 4 | {rest=${count}} | 4 3 2 1 |||`), { width, paged: false, textMeasurer: measurer, minimumNoteGap: 9 })

describe('native multi-measure rests', () => {
  it('paints a beam with two caps and a smaller count, and reserves its actual ink', () => {
    const layout = layoutRest(12), glyph = layout.projection.glyphs.find(g => g.multiRest)!
    const svg = painter.music(glyph)
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml')
    expect(root.querySelectorAll('line')).toHaveLength(3)
    expect([...root.querySelectorAll('text')].map(t => [t.textContent,t.getAttribute('font-size')])).toEqual([['12',String(nativeStyle.music * 0.75)]])
    const ink = nativeSvgInk(svg, measurer)
    expect(glyph.musicLeft).toBeGreaterThanOrEqual(glyph.x - ink.left - 0.001)
    expect(glyph.musicRight).toBeGreaterThanOrEqual(ink.right - glyph.x)
    expect(glyph.musicTop).toBeCloseTo(glyph.y - ink.top, 3)
    expect(glyph.musicBottom).toBeCloseTo(ink.bottom - glyph.y, 3)
  })
  it('does not expand springs with the number of silent measures, but measures wide counts', () => {
    const rest = (n: number) => layoutRest(n).projection.measures[1]!
    expect(rest(4).minimum).toBeCloseTo(rest(1).minimum, 8)
    expect(rest(4).minimum).toBeCloseTo(rest(1).minimum, 8)
    expect(rest(123456789).minimum).toBeGreaterThan(rest(4).minimum)
  })
  it('keeps the actual bar-to-rest clearance unchanged as the system expands', () => {
    const clearances = [320,800].map(width => {
      const layout = layoutRest(4,width), glyph = layout.projection.glyphs.find(g => g.multiRest)!
      const measure = layout.systems.flatMap(s => s.measures).find(m => m.id === glyph.measureId)!
      const ink = nativeSvgInk(painter.music(glyph), measurer)
      expect(measure.barX!).toBeGreaterThan(ink.right)
      return measure.barX! - glyph.x
    })
    expect(clearances[0]).toBeCloseTo(clearances[1]!, 8)
  })
  it('uses the inherited active meter for silent beats', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {6/8}1 2 3 | {rest=4} | 1 2 3 |||'), { width:800,paged:false })
    expect(layout.projection.glyphs.find(g => g.multiRest)!.beats).toBe(12)
  })
  it('preserves a rest-only Segno and advances visible measure numbers by the rest count', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {segno}{rest=4} | 4 3 2 1 |||')
    const layout = layoutNativeScore(document, { width:800,paged:false,measureNumbers:true })
    const glyph = layout.projection.glyphs.find(g => g.multiRest)!
    expect(glyph.controls.map(c => c.kind)).toContain('segno')
    expect(layout.projection.measures.map(m => m.number)).toEqual([1,2,6])
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''),'text/html')
    expect(root.querySelector('[data-m3n-role="multi-rest"]')).not.toBeNull()
    expect(root.querySelector('[data-m3n-control="segno"]')).not.toBeNull()
  })
})
