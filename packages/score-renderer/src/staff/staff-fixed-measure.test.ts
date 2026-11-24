// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { createStaffMeasureMinimum } from './line-layout.js'
import { projectStaffDocument } from './staff-document.js'
import { textMeasurer, xml } from './layout-svg.js'
import { createStaffContext, createStaffVexPreparation, createVexMeasure, drawVexMeasure } from './vexflow-engine.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

describe('fixed staff measure preparation', () => {
  it.each([
    '{key=F}{4/4}\nN: ||: 1# (2 3) 4 5 :|||',
    '{4/4}\nN: [135:h]{arp}{ac(6# 7)} 2{tip} 3{prall} 4 |||\nB: 1d 2d 3d 4d |||',
    '{4/4}\nN: ([0 2# 3:2]) 4 5 6 |||\nL: 春夏秋冬 |',
    '{4/4}\nN: 1 2 {key=G} 3 4 |||',
  ])('matches full model reconstruction across all spacing trials: %s', source => {
    const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer()
    const preparation = createStaffVexPreparation(), minimum = createStaffMeasureMinimum(document.hasBass, measure, preparation)
    for (const item of document.measures) for (const first of [true, false]) {
      for (const spacing of [0.375, 0.25, 0.34375, 0.28125, 0.3125, 0.25]) {
        const fresh = createVexMeasure(item, first, document.hasBass, measure, spacing)
        expect(minimum(item, first, spacing)).toBe(fresh.minimum)
        const shared = createVexMeasure(item, first, document.hasBass, measure, spacing, 160, preparation)
        const independent = createVexMeasure(item, first, document.hasBass, measure, spacing, 160)
        expect(xml(drawVexMeasure(shared, shared.minimum + 80, 20, createStaffContext())))
          .toBe(xml(drawVexMeasure(independent, independent.minimum + 80, 20, createStaffContext())))
      }
    }
  })
  it('isolates descriptors by clef and task and leaves fresh drawing objects independent', () => {
    const item = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 |||').score).measures[0]!
    const preparation = createStaffVexPreparation(), event = item.melody[0]!
    expect(preparation.note(event, 'treble')).toBe(preparation.note(event, 'treble'))
    expect(preparation.note(event, 'bass')).not.toBe(preparation.note(event, 'treble'))
    expect(createStaffVexPreparation().note(event, 'treble')).not.toBe(preparation.note(event, 'treble'))
    const first = createVexMeasure(item, true, false, textMeasurer(), 0.25, 130, preparation)
    const second = createVexMeasure(item, true, false, textMeasurer(), 0.25, 130, preparation)
    expect(first.staves[0]).not.toBe(second.staves[0])
    expect(first.entries[0]![0]!.notes[0]).not.toBe(second.entries[0]![0]!.notes[0])
    first.entries[0]![0]!.notes[0]!.keys[0] = 'g/7'
    expect(second.entries[0]![0]!.notes[0]!.keys[0]).toBe('c/4')
    expect(preparation.note(event, 'treble').keys[0]).toBe('c/4')
  })
})
