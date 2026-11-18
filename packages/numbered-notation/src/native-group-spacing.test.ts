import { parseM3NDocument } from '@m3n/notation'
import { describe, expect, it } from 'vitest'
import { measureNativeHorizontal, placeNativeHorizontal } from './native-horizontal.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { projectNativeScore } from './native-model.js'

const options = { noteGapEm: .6, minimumNoteGapEm: .4, minimumNoteGapFloorEm: 0, pairedSpacing: true }
const project = (notes: string) => {
  const result = projectNativeScore(parseM3NDocument(`{4/4}\nN: ${notes} |||`), { textMeasurer: new DefaultTextMeasurer() })
  return { ...result.measures[0]!, lastFragment: false }
}
const clearance = (measure: ReturnType<typeof project>, index: number) => {
  const left = measure.columns[index]!, right = measure.columns[index + 1]!
  return right.x - left.x - left.glyphs[0]!.musicRight! - right.glyphs[0]!.musicLeft!
}

describe('absolute group boundary clearance', () => {
  it.each(['([123:2]) ([234:2]) ([345:2]) ([456:2])', '((1234)) ((2345)) ((3456)) ((4567))'])('reserves 0.4em between short-note groups: %s', notes => {
    const measure = project(notes)
    measureNativeHorizontal([measure], options)
    placeNativeHorizontal([measure], options, 0, measure.minimum)
    const boundary = notes.startsWith('([') ? 2 : 3
    expect(clearance(measure, boundary)).toBeCloseTo(8.8, 1)
    expect(clearance(measure, 0)).toBeLessThan(3)
  })

  it('uses the same fixed minimum for unequal-duration independent attacks', () => {
    const measure = project('1. (2) 3 4')
    measureNativeHorizontal([measure], options)
    placeNativeHorizontal([measure], options, 0, measure.minimum)
    expect(clearance(measure, 0)).toBeCloseTo(8.8, 1)
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
})
