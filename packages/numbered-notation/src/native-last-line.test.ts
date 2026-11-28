import { parseM3NDocument } from '@m3n/notation'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nativeHorizontalSpacing, nativeLastLineWidth, type NativeHorizontalSpacing } from './native-horizontal.js'
import { layoutNativeScore } from './native-layout.js'
import { DefaultTextMeasurer } from './native-measure.js'

const previous: NativeHorizontalSpacing = { minimumWidth: 400, stretchWeight: 10 }
const quarters = '1 2 3 4 | '
const options = { width: 800, paged: false, textMeasurer: new DefaultTextMeasurer() }

describe('short final rows', () => {
  it.each([0, 32])('fills the C-section ending at measure 61 of Turkish March, margin=%s', pageMargin => {
    const document = parseM3NDocument(readFileSync(new URL('../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8'))
    const layout = layoutNativeScore(document, { ...options, width: 672, pageMargin, minimumNoteGap: 8 })
    const ending = layout.systems.find(system => system.measures.some(measure => measure.number === 61))!
    expect(ending.measures.at(-1)!.number).toBe(61)
    expect(ending.measures.at(-1)!.end).toBeCloseTo(672 - pageMargin, 6)
  })
  it('fills a normal-spaced ending even after an unusually compact preceding row', () => {
    const ending = { minimumWidth: 320, stretchWeight: 6 }
    // The old surplus-only rule keeps this at 560/800; physical spacing is
    // only 40% looser than the section average and should fill the row.
    expect(nativeLastLineWidth(ending, 800, previous, 800, { current: 28, reference: 20 })).toBe(800)
    expect(nativeLastLineWidth(ending, 800, previous, 800, { current: 30, reference: 20 })).toBe(800)
    expect(nativeLastLineWidth(ending, 800, previous, 800, { current: 31, reference: 20 })).toBe(560)
    expect(nativeLastLineWidth(ending, 800, previous, 800, { current: 28, reference: 0 })).toBe(560)
  })

  it('inherits surplus per rhythm weight without scaling glyphs or minimum clearances', () => {
    expect(nativeLastLineWidth({ minimumWidth: 100, stretchWeight: 2 }, 800, previous, 800)).toBe(180)
  })

  it('keeps middle-band rows open when filling would greatly increase preceding stretch', () => {
    expect(nativeLastLineWidth({ minimumWidth: 400, stretchWeight: 2 }, 800, previous, 800)).toBe(480)
    expect(nativeLastLineWidth({ minimumWidth: 400.01, stretchWeight: 2 }, 800, previous, 800)).toBe(480.01)
    // Longer final rows keep their inherited rhythm spacing as well.
    expect(nativeLastLineWidth({ minimumWidth: 300, stretchWeight: 5 }, 800, previous, 800)).toBe(500)
  })

  it('fills near-complete terminal rows and uses rhythm density in the middle band', () => {
    expect(nativeLastLineWidth({ minimumWidth: 600, stretchWeight: 2 }, 800, previous, 800)).toBe(800)
    expect(nativeLastLineWidth({ minimumWidth: 80, stretchWeight: 12 }, 800, previous, 800)).toBe(800)
    expect(nativeLastLineWidth({ minimumWidth: 320, stretchWeight: 6 }, 800, previous, 800)).toBe(560)
  })

  it('falls back to the available width when inherited stretch would overflow', () => {
    expect(nativeLastLineWidth({ minimumWidth: 100, stretchWeight: 30 }, 800, previous, 800)).toBe(800)
    expect(nativeLastLineWidth({ minimumWidth: 120, stretchWeight: 4 }, 400, { minimumWidth: 320, stretchWeight: 8 }, 640)).toBe(280)
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

  it.each([false, true])('shortens named-section endings with the same horizontal layout in both display modes, equal=%s', equalMeasures => {
    const source = `{4/4}\n===A\nN: ${quarters.repeat(4)} {br} 5 6 7 1e |\n===B\nN: ${quarters.repeat(4)} {br} 5 6 7 1e |||`
    const layouts = [false, true].map(paged => layoutNativeScore(parseM3NDocument(source), { ...options, paged, equalMeasures }))
    for (const layout of layouts) {
      expect(layout.systems).toHaveLength(4)
      for (const index of [0, 2]) expect(layout.systems[index]!.measures.at(-1)!.end).toBeCloseTo(768, 8)
      for (const index of [1, 3]) {
        const current = layout.systems[index]!.measures, preceding = layout.systems[index - 1]!.measures
        const expected = nativeLastLineWidth(nativeHorizontalSpacing(current, layout.options), 736,
          nativeHorizontalSpacing(preceding, layout.options), 736)
        expect(current.at(-1)!.end - 32).toBeCloseTo(expected, 8)
        expect(expected).toBeLessThanOrEqual(736 * .6)
      }
    }
    expect(layouts[0]!.projection.glyphs.map(glyph => glyph.x)).toEqual(layouts[1]!.projection.glyphs.map(glyph => glyph.x))
  })

  it('keeps single-row sections full instead of inheriting from another section', () => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\n===A\nN: ${quarters.repeat(4)} |\n===B\nN: 5 6 7 1e |||`), options)
    expect(layout.systems).toHaveLength(2)
    for (const system of layout.systems) expect(system.measures.at(-1)!.end).toBeCloseTo(768, 8)
  })

  it.each(['{br}', '{br}\n---\nN:'])('keeps a short intermediate row full at a plain boundary: %s', boundary => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${quarters.repeat(4)} {br} 5 6 7 1e | ${boundary} ${quarters.repeat(4)} |||`), options)
    expect(layout.systems.length).toBeGreaterThanOrEqual(3)
    expect(layout.systems[1]!.measures.at(-1)!.end).toBeCloseTo(768, 8)
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
    const last = layout.systems.at(-1)!, spacing = nativeHorizontalSpacing(last.measures, layout.options)
    const previous = nativeHorizontalSpacing(layout.systems.at(-2)!.measures, layout.options)
    expect(last.measures.at(-1)!.end - 32).toBeCloseTo(nativeLastLineWidth(spacing, 736, previous, 736), 6)
    expect(last.measures.at(-1)!.end - 32).toBeGreaterThanOrEqual(spacing.minimumWidth)
  })
})
