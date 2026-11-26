import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { measureNativeHorizontal, nativeBarMetrics, nativeHorizontalSpacing, placeNativeHorizontal } from './native-horizontal.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { projectNativeScore } from './native-model.js'

const options = { minimumNoteGap: 9, minimumNoteGapFloor: 0}
const project = (notes: string) => {
  const result = projectNativeScore(parseM3NDocument(`{4/4}\nN: ${notes} |||`), { textMeasurer: new DefaultTextMeasurer() })
  return { ...result.measures[0]!, lastFragment: false }
}
const clearance = (measure: ReturnType<typeof project>, index: number) => {
  const left = measure.columns[index]!, right = measure.columns[index + 1]!
  return right.x - left.x - left.glyphs[0]!.musicRight! - right.glyphs[0]!.musicLeft!
}

describe('minimum-only 8px clearance', () => {
  it.each([
    ['1 2', 8],
    ['(1 2)', 8 * Math.sqrt(.5) / 2],
    ['((1 2))', 2],
  ])('retains rhythm and grouping for %s without compression', (notes, minimum) => {
    const measure = project(notes), options = { minimumNoteGap: 8 }
    const spacing = nativeHorizontalSpacing([measure], options)
    placeNativeHorizontal([measure], options, 0, spacing.minimumWidth)
    expect(clearance(measure, 0)).toBeCloseTo(minimum, 8)
    for (const extra of [16, 32]) {
      placeNativeHorizontal([measure], options, 0, spacing.minimumWidth + extra)
      expect(clearance(measure, 0)).toBeCloseTo(minimum + extra, 8)
    }
    placeNativeHorizontal([measure], options, 0, spacing.minimumWidth / 2)
    expect(clearance(measure, 0)).toBeCloseTo(minimum, 8)
  })
})

describe('absolute group boundary clearance', () => {
  it.each(['([123:2]) ([234:2]) ([345:2]) ([456:2])', '((1234)) ((2345)) ((3456)) ((4567))'])('reserves 9px between short-note groups: %s', notes => {
    const measure = project(notes)
    measureNativeHorizontal([measure], options)
    placeNativeHorizontal([measure], options, 0, measure.minimum)
    const boundary = notes.startsWith('([') ? 2 : 3
    expect(clearance(measure, boundary)).toBeCloseTo(9, 1)
    expect(clearance(measure, 0)).toBeLessThan(3)
  })

  it('uses the same fixed minimum for unequal-duration independent attacks', () => {
    const measure = project('1. (2) 3 4')
    measureNativeHorizontal([measure], options)
    placeNativeHorizontal([measure], options, 0, measure.minimum)
    expect(clearance(measure, 0)).toBeCloseTo(9, 1)
  })

  it('keeps group-internal justification growth at half the group-boundary growth', () => {
    const measure = project('([123:2]) ([234:2]) ([345:2]) ([456:2])')
    const gaps = (width: number) => {
      placeNativeHorizontal([measure], options, 0, width)
      return [clearance(measure, 0), clearance(measure, 2)]
    }
    const small = gaps(500), large = gaps(700)
    expect((large[0]! - small[0]!) / (large[1]! - small[1]!)).toBeCloseTo(.5, 8)
  })

  it('allocates surplus using square-root durations even when attack minima are equal', () => {
    const measure = project('1. (2) 3 4')
    const gaps = (width: number) => {
      placeNativeHorizontal([measure], options, 0, width)
      return [clearance(measure, 0), clearance(measure, 2)]
    }
    const small = gaps(500), large = gaps(700)
    expect((large[0]! - small[0]!) / (large[1]! - small[1]!))
      .toBeCloseTo((Math.sqrt(1.5) + Math.sqrt(.5)) / 2, 8)
  })

  it('does not increase rhythm weights for lyrics, accidentals or parentheses', () => {
    const growth = (source: string) => {
      const projection = projectNativeScore(parseM3NDocument(source), { textMeasurer: new DefaultTextMeasurer() })
      const gaps = (width: number) => {
        placeNativeHorizontal(projection.measures, options, 0, width)
        return projection.measures[0]!.columns.slice(1).map((column, index) => column.x - projection.measures[0]!.columns[index]!.x)
      }
      const small = gaps(700), large = gaps(900)
      return large.map((gap, index) => gap - small[index]!)
    }
    const plain = growth('{4/4}\nN: 1. (2) 3 4 |||')
    const decorated = growth('{4/4}\nN: {inst}1#. (2) 3 4{/} |||\nL: (春风吹过山间) 花 开 了')
    decorated.forEach((gap, index) => expect(gap).toBeCloseTo(plain[index]!, 8))
  })

  it('gives a zero-time bar the same minimum clearance and stretch as a quarter note', () => {
    const { measures } = projectNativeScore(parseM3NDocument('{4/4}\nN: 1 2 3 4 | 5 6 7 1e |||'), { textMeasurer: new DefaultTextMeasurer() })
    measureNativeHorizontal(measures, options)
    const gaps = (width: number) => {
      placeNativeHorizontal(measures, options, 0, width)
      const measure = measures[0]!, last = measure.columns.at(-1)!.glyphs[0]!
      return [clearance(measure, 2), measure.barX! - last.x - last.musicRight! - nativeBarMetrics('single').anchor]
    }
    const minimum = gaps(measures.reduce((sum, measure) => sum + measure.minimum, 0))
    expect(minimum[0]).toBeCloseTo(9, 8)
    expect(minimum[1]).toBeCloseTo(9, 8)
    const small = gaps(700), large = gaps(900)
    expect(large[1]! - small[1]!).toBeCloseTo(large[0]! - small[0]!, 8)
    expect(measures[0]!.beats).toBe(4)
  })
})
