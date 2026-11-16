import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { measureNativeNavigation } from './native-navigation.js'
import { nativeSvgInk } from './native-ink.js'
import { layoutNativeScore } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'

// The music's measured axis is -8px. Navigation has a different ascent/descent
// ratio, a left overhang and ink extending beyond its advance width.
const measurer: TextMeasurer = { measureText(text, style) {
  if (style.fontFamily === 'M3N Numbers') return { w: 12, h: 18, baseline: 17 }
  return { w: text.length * style.fontSize * 0.6, advance: 26, inkLeft: -2, inkRight: 30, h: 9, baseline: 6 }
} }

describe('measured navigation geometry', () => {
  it.each(['ds', 'dc', 'fine'] as const)('centers %s on the measured music axis and contains its overhangs', name => {
    const mark = measureNativeNavigation(name, measurer), ink = nativeSvgInk(mark.svg, measurer)
    expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4)
    expect(ink.left).toBe(0)
    expect(ink.right).toBe(32)
    expect(mark.width).toBe(32)
    expect(mark.ink).toEqual(ink)
  })

  it.each(['ds', 'dc', 'fine'] as const)('keeps trailing advance space for %s without substituting it for ink height', name => {
    const advance: TextMeasurer = { measureText(text, style) {
      return { ...measurer.measureText(text, style), advance: 40 }
    } }
    const mark = measureNativeNavigation(name, advance)
    expect(mark.width).toBe(42)
    expect(mark.ink.right).toBe(32)
    expect((mark.ink.top + mark.ink.bottom) / 2).toBeCloseTo(-8, 4)
  })

  it.each([320, 800])('places all measured navigation fragments before their bar at %spx', width => {
    const source = '{4/4}\nN: ' + Array(6).fill('1 2 3 4 |').join(' ') + ' [135:h] 2 3 4 {fine}{ds} |||'
    const result = layoutNativeScore(parseM3NDocument(source), { width, paged: true, textMeasurer: measurer })
    const measure = result.projection.measures.at(-1)!, notes = measure.columns.flatMap(column => column.glyphs)
    const marks = measure.navigation!, first = marks[0]!, last = marks.at(-1)!
    expect(marks.map(mark => mark.text)).toEqual(['Fine.', 'D.S.'])
    expect(first.x!).toBeGreaterThan(Math.max(...notes.map(note => note.x + note.musicRight!)))
    expect(first.x! + first.width).toBeLessThan(marks[1]!.x!)
    expect(last.x! + last.width).toBeLessThan(measure.barX!)
    const system = result.systems.find(system => system.measures.includes(measure))!
    const fragments = system.decorationLayout!.filter(fragment => fragment.svg.includes('data-m3n-role="navigation"'))
    expect(fragments).toHaveLength(2)
    for (const fragment of fragments) {
      const ink = nativeSvgInk(fragment.svg, measurer)
      expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4)
      expect(ink.left).toBeGreaterThan(32)
      expect(ink.right).toBeLessThan(width - 32)
    }
  })
})
