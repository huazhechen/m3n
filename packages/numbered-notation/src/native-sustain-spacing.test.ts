import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { measureNativeHorizontal, placeNativeHorizontal } from './native-horizontal.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { projectNativeScore } from './native-model.js'

const options = { noteGapEm: .6, minimumNoteGapEm: .4, minimumNoteGapFloorEm: 0, pairedSpacing: true }
const project = (source: string) => projectNativeScore(parseM3NDocument(source), { textMeasurer: new DefaultTextMeasurer() })

describe('sustain group spacing', () => {
  it.each([
    ['quarter head', '1~ 1^.', 1],
    ['eighth head', '(0 1~) 1^.', .5],
    ['sixteenth head', '(0 (0 1~)) 1^.', .25],
    ['dotted head', '1^.. (0)', 1.5],
  ])('retains square-root group clearances for a %s into a dash', (_name, notes, duration) => {
    const { measures } = project(`{4/4}\nN: ${notes} |||`)
    const measure = measures[0]!
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    const index = glyphs.findIndex((glyph, index) => index > 0 && glyph.sustain && !glyphs[index - 1]!.sustain)
    const head = glyphs[index - 1]!, dash = glyphs[index]!
    expect(head.beats).toBe(duration)
    expect(dash.beats).toBe(1)
    // Retain identical ink, lyrics and boundaries; change only this grouping.
    // A chain has two affected gaps if the selected dash is followed by a dash,
    // so isolate the head/dash pair before comparing the exact spring lengths.
    const pair = { ...measure, columns: measure.columns.filter(column => column.glyphs.includes(head) || column.glyphs.includes(dash)), lastFragment: false }
    measureNativeHorizontal([pair], options)
    const pairGrouped = { natural: pair.natural, minimum: pair.minimum }
    dash.sustain = false
    measureNativeHorizontal([pair], options)
    const roots = Math.sqrt(duration) + 1
    expect(pair.natural - pairGrouped.natural).toBeCloseTo(22 * .6 / 4 * roots, 8)
    // The independent attack now reserves a fixed 0.4em, while the
    // sustain pair still uses its original duration-scaled half clearance.
    expect(pair.minimum - pairGrouped.minimum).toBeCloseTo(22 * .4 - 22 * .4 / 4 * roots, 8)
  })

  it('gives head/dash and dash/dash gaps half the justification surplus of a new attack', () => {
    const { measures } = project('{5/4}\nN: 1^. 2^ |||')
    const measure = { ...measures[0]!, lastFragment: false }
    const positions = (width: number) => {
      placeNativeHorizontal([measure], options, 0, width)
      return measure.columns.map(column => column.x)
    }
    const small = positions(300), large = positions(500)
    const growth = (index: number) => large[index + 1]! - large[index]! - small[index + 1]! + small[index]!
    expect(growth(0) / growth(2)).toBeCloseTo(.5, 8)
    expect(growth(1) / growth(2)).toBeCloseTo(.5, 8)
    expect(growth(3) / growth(2)).toBeCloseTo(.5, 8)
  })

  it('keeps barlines as group boundaries even if the next bar starts with a dash', () => {
    const { measures } = project('{1/4}\nN: 1~ | 1 |||')
    measureNativeHorizontal(measures, options)
    const widths = measures.map(measure => [measure.natural, measure.minimum])
    measures[1]!.columns[0]!.glyphs[0]!.sustain = true
    measureNativeHorizontal(measures, options)
    expect(measures.map(measure => [measure.natural, measure.minimum])).toEqual(widths)
  })

  it('keeps repeated same-pitch attacks outside sustain groups', () => {
    const { measures } = project('{4/4}\nN: 1 1 1 1 |||')
    const measure = { ...measures[0]!, lastFragment: false }
    const positions = (width: number) => {
      placeNativeHorizontal([measure], options, 0, width)
      return measure.columns.map(column => column.x)
    }
    const small = positions(300), large = positions(500)
    const growth = small.slice(1).map((_, index) => large[index + 1]! - large[index]! - small[index + 1]! + small[index]!)
    expect(growth[0]).toBeCloseTo(growth[1]!, 8)
    expect(growth[1]).toBeCloseTo(growth[2]!, 8)
  })
})
