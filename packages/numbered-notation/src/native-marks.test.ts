// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeMarkStack } from './native-marks.js'
import { nativeNoteMetrics } from './native-note-metrics.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { nativeStyle } from './native-style.js'
import { NativeNumberedNotationScore } from './native-score.js'

const options = { width: 800, paged: false }
describe('native articulation occupancy', () => {
  it.each([['tip', 7], ['brk', 7], ['hold', 1.26], ['str', 6]] as const)('measures %s by its own height', (name, height) => {
    const score = layoutNativeScore(parseM3NDocument(`{4/4}\nN: 1{${name}} 2 3 4 |||`), options)
    const glyph = score.projection.glyphs[0]!
    expect(glyph.top).toBeCloseTo(17.6 + 2.64 + height)
    expect(score.systems[0]!.lanes[0]!.top).toBeCloseTo(glyph.top)
  })

  it('places articulations before ornaments and expressions using boundary gaps', () => {
    const stack = nativeMarkStack(['mf', 'f1', 'tip', 'tr', 'hold'], 17.6)
    expect(stack.items.map(item => item.name)).toEqual(['tip', 'hold', 'f1', 'tr', 'mf'])
    let bottom = -17.6
    for (const mark of stack.items) {
      expect(bottom - mark.top - mark.height).toBeCloseTo(2.64)
      bottom = mark.top
    }
    expect(stack.top).toBeCloseTo(-bottom)
  })

  it('places a tuplet dynamic outside a later overlapping fingering', () => {
    const fallback = new DefaultTextMeasurer()
    const score = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 {p}([3 4 5:2]) (6{f1}) (7) |||'), {
      width:320,paged:false,textMeasurer:{measureText(text,style) {
        const metrics = fallback.measureText(text,style)
        return text === '1' && style.fontFamily === 'serif' ? {...metrics,w:220} : metrics
      }},
    })
    const dynamicGlyph = score.projection.glyphs.find(g => g.markLayout?.some(m => m.name === 'p'))!
    const ornamentGlyph = score.projection.glyphs.find(g => g.markLayout?.some(m => m.name === 'f1'))!
    const dynamic = dynamicGlyph.markLayout!.find(m => m.name === 'p')!
    const ornament = ornamentGlyph.markLayout!.find(m => m.name === 'f1')!
    expect(ornamentGlyph.x+ornament.left).toBeLessThan(dynamicGlyph.x+dynamic.right)
    expect(ornamentGlyph.x+ornament.right).toBeGreaterThan(dynamicGlyph.x+dynamic.left)
    expect(dynamic.top+dynamic.height).toBeLessThanOrEqual(ornament.top-nativeStyle.markGap+.001)
  })

  it('paints the triangle inside its measured box above a high stacked chord', () => {
    const document = parseM3NDocument('{4/4}\nN: [1 3e 5ee:h]{tip} 2 3 4 |||')
    const score = layoutNativeScore(document, options), glyph = score.projection.glyphs[0]!
    const body = nativeNoteMetrics(glyph.pitches, glyph.writtenBeats, false)
    const position = nativeMarkStack(glyph.marks, body.top).items[0]!
    expect(glyph.top).toBeCloseTo(-position.top)
    const svg = NativeNumberedNotationScore.create(document).render(options).join('')
    const root = new DOMParser().parseFromString(svg, 'text/html')
    const triangle = root.querySelector('[data-m3n-mark="tip"] path')!
    expect(triangle.getAttribute('d')).toBe('M-2.5 0 h5 l-2.5 7 Z')
    expect(triangle.parentElement!.getAttribute('transform')).toBe(`translate(${Number(glyph.x.toFixed(4))} ${Number((glyph.y + position.y).toFixed(4))})`)
    expect(triangle.hasAttribute('stroke')).toBe(false)
  })

  it('keeps repeated rows of staccatissimo at the natural measured stride', () => {
    const document = parseM3NDocument('{4/4}\nN: 1{tip} 2 3 4 | {br} 5{tip} 6 7 1e | {br} 1{tip} 2 3 4 |||')
    const score = layoutNativeScore(document, options)
    expect(score.systems).toHaveLength(3)
    for (let index = 1; index < score.systems.length; index++) {
      const before = score.systems[index - 1]!.lanes[0]!, next = score.systems[index]!.lanes[0]!
      expect(next.y - before.y).toBeCloseTo(before.bottom + 24 + next.top)
    }
    expect(score.systems[0]!.lanes[0]!.top).toBeCloseTo(27.24)
  })
})
