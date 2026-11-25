// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { createStaffMeasureMinimum } from './line-layout.js'
import { projectStaffDocument, splitStaffMeasure } from './staff-document.js'
import { textMeasurer, xml } from './layout-svg.js'
import { createStaffPreparation, createStaffMeasure, drawStaffMeasure } from './staff-engine.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

describe('fixed staff measure preparation', () => {
  it.each([
    '{key=F}{4/4}\nN: ||: 1# (2 3) 4 5 :|||',
    '{4/4}\nN: [135:h]{arp}{ac(6# 7)} 2{tip} 3{prall} 4 |||\nB: 1d 2d 3d 4d |||',
    '{4/4}\nN: ([0 2# 3:2]) 4 5 6 |||\nL: 春夏秋冬 |',
    '{4/4}\nN: 1 2 {key=G} 3 4 |||',
  ])('matches full model reconstruction across all spacing trials: %s', source => {
    const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer()
    const preparation = createStaffPreparation(), minimum = createStaffMeasureMinimum(document.hasBass, measure, preparation)
    for (const item of document.measures) for (const first of [true, false]) {
      for (const spacing of [0.375, 0.25, 0.34375, 0.28125, 0.3125, 0.25]) {
        const fresh = createStaffMeasure(item, first, document.hasBass, measure, spacing)
        expect(minimum(item, first, spacing)).toBe(fresh.minimum)
        const shared = createStaffMeasure(item, first, document.hasBass, measure, spacing, 160, preparation)
        const independent = createStaffMeasure(item, first, document.hasBass, measure, spacing, 160)
        expect(xml(drawStaffMeasure(shared, shared.minimum + 80, 20)))
          .toBe(xml(drawStaffMeasure(independent, independent.minimum + 80, 20)))
      }
    }
  })
  it('shares immutable descriptors within a task and isolates candidate anchors', () => {
    const item = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 |||').score).measures[0]!
    const task = createStaffPreparation(), measure = textMeasurer()
    const first = createStaffMeasure(item, true, false, measure, 0.25, 130, task)
    const second = createStaffMeasure(item, true, false, measure, 0.375, 180, task)
    expect(first.prepared).toBe(second.prepared)
    expect(first.entries[0]![0]!.notes[0]).not.toBe(second.entries[0]![0]!.notes[0])
    drawStaffMeasure(first, first.minimum, 0)
    const saved = xml(drawStaffMeasure(second, second.minimum + 80, 20))
    drawStaffMeasure(first, first.minimum + 200, 100)
    expect(xml(drawStaffMeasure(second, second.minimum + 80, 20))).toBe(saved)
    expect(createStaffPreparation().measure(item, true, false, measure)).not.toBe(first.prepared)
  })
  it('shares only identical fragment boundaries within one task', () => {
    const item = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 5 6 7 1e |||').score).measures[0]!
    const first = createStaffMeasureMinimum(false, textMeasurer(), createStaffPreparation())
    const a = first.split!(item, 3.1), b = first.split!(item, 3.9), c = first.split!(item, 4.1)
    expect(a).toEqual(splitStaffMeasure(item, 3.1))
    expect(b).toBe(a)
    expect(c).not.toBe(a)
    const next = createStaffMeasureMinimum(false, textMeasurer(), createStaffPreparation()).split!(item, 3.1)
    expect(next).toEqual(a)
    expect(next).not.toBe(a)
    expect(item.fragment).not.toBe(true)
  })

})
