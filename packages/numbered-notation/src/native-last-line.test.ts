import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { nativeHorizontalSpacing, nativeLastLineWidth, type NativeHorizontalSpacing } from './native-horizontal.js'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer } from './native-measure.js'

const previous: NativeHorizontalSpacing = { minimumWidth: 400, stretchWeight: 10 }
const quarters = '1 2 3 4 | '
const options = { width: 800, paged: false, textMeasurer: new DefaultTextMeasurer() }

describe('short final rows', () => {
  it('inherits surplus per rhythm weight without scaling glyphs or minimum clearances', () => {
    expect(nativeLastLineWidth({ minimumWidth: 100, stretchWeight: 2 }, 800, previous, 800)).toBe(180)
  })

  it('uses the trial width for the 60% threshold, including its exact boundary', () => {
    expect(nativeLastLineWidth({ minimumWidth: 400, stretchWeight: 2 }, 800, previous, 800)).toBe(480)
    expect(nativeLastLineWidth({ minimumWidth: 400.01, stretchWeight: 2 }, 800, previous, 800)).toBe(800)
    // A small minimum is insufficient when inheriting stretch makes it long.
    expect(nativeLastLineWidth({ minimumWidth: 300, stretchWeight: 5 }, 800, previous, 800)).toBe(800)
  })

  it('falls back to the available width when inherited stretch would overflow', () => {
    expect(nativeLastLineWidth({ minimumWidth: 100, stretchWeight: 30 }, 800, previous, 800)).toBe(800)
    expect(nativeLastLineWidth({ minimumWidth: 120, stretchWeight: 4 }, 400, { minimumWidth: 320, stretchWeight: 8 }, 640)).toBe(400)
  })

  it('does not invent surplus when the preceding row has no elastic gaps', () => {
    expect(nativeLastLineWidth({ minimumWidth: 100, stretchWeight: 2 }, 800, { minimumWidth: 200, stretchWeight: 0 }, 800)).toBe(100)
  })

  it('inherits equal cell widths but reserves wider current music and checks overflow', () => {
    const equalPrevious = { ...previous, equalCells: { count: 4, tailRight: 5 } }
    const current = { minimumWidth: 120, stretchWeight: 2, equalCells: { count: 1, tailRight: 10 } }
    expect(nativeLastLineWidth(current, 805, equalPrevious, 805)).toBe(210)
    expect(nativeLastLineWidth({ ...current, minimumWidth: 250 }, 805, equalPrevious, 805)).toBe(250)
    expect(nativeLastLineWidth({ ...current, equalCells: { count: 5, tailRight: 10 } }, 805, equalPrevious, 805)).toBe(805)
  })

  it('places a genuinely short terminal bar with the same quarter-note gaps as the preceding row', () => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${quarters.repeat(4)} {br} 5 6 7 1e |||`), options)
    expect(layout.systems).toHaveLength(2)
    const [first, last] = layout.systems.map(system => system.measures)
    const gap = (measures: typeof first) => measures![0]!.columns[1]!.x - measures![0]!.columns[0]!.x
    expect(gap(last)).toBeCloseTo(gap(first), 8)
    expect(first!.at(-1)!.end).toBeCloseTo(768, 8)
    expect(last!.at(-1)!.end - 32).toBeLessThanOrEqual(736 * .6)
  })

  it.each([false, true])('keeps all intermediate page endings full and only shortens the score ending, equal=%s', equalMeasures => {
    const source = `{4/4}\nN: ${Array(40).fill(`${quarters.repeat(4)} {br}`).join(' ')} 5 6 7 1e |||`
    const layout = layoutNativeScore(parseM3NDocument(source), { ...options, width: 600, paged: true, equalMeasures })
    expect(layout.pages.length).toBeGreaterThan(1)
    const last = layout.systems.at(-1)!
    for (const system of layout.systems.slice(0, -1)) expect(system.measures.at(-1)!.end).toBeCloseTo(568, 6)
    expect(last.measures.at(-1)!.end - 32).toBeLessThanOrEqual(536 * .6)
    if (equalMeasures) {
      const previous = layout.systems.at(-2)!.measures
      expect(last.measures[0]!.barX! - 32).toBeCloseTo(previous[1]!.barX! - previous[0]!.barX!, 6)
    }
  })

  it('keeps the existing full-width fallback for a score with no preceding row', () => {
    const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), options)
    expect(layout.systems).toHaveLength(1)
    expect(layout.systems[0]!.measures.at(-1)!.end).toBeCloseTo(768, 8)
  })

  it('does not overflow when a densely populated final bar inherits a sparse preceding bar', () => {
    const layout = layoutNativeScore(parseM3NDocument('{1/4}\nN: 1 | {br} ((1 2 3 4)) |||'), options)
    expect(layout.systems).toHaveLength(2)
    const current = nativeHorizontalSpacing(layout.systems[1]!.measures, {})
    const preceding = nativeHorizontalSpacing(layout.systems[0]!.measures, {})
    const inherited = current.minimumWidth + (736 - preceding.minimumWidth) / preceding.stretchWeight * current.stretchWeight
    expect(inherited).toBeGreaterThan(736)
    expect(layout.systems[1]!.measures.at(-1)!.end).toBeCloseTo(768, 8)
    for (const glyph of layout.projection.glyphs) expect(glyph.x + glyph.musicRight!).toBeLessThan(768)
  })

  it('measures the actual constraints for parallel voices and rigid multi-rests', () => {
    const source = `{4/4}\nN: ${quarters.repeat(4)} {br} {rest=3} |||\nB: ${quarters.repeat(4)} {br} {rest=3} |||`
    const layout = layoutNativeScore(parseM3NDocument(source), options)
    const last = layout.systems.at(-1)!, spacing = nativeHorizontalSpacing(last.measures, {})
    const previous = nativeHorizontalSpacing(layout.systems.at(-2)!.measures, {})
    expect(last.measures.at(-1)!.end - 32).toBeCloseTo(nativeLastLineWidth(spacing, 736, previous, 736), 6)
    expect(last.measures.at(-1)!.end - 32).toBeGreaterThanOrEqual(spacing.minimumWidth)
  })
})
