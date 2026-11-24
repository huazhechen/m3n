// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasureMinimum } from './line-layout.js'
import { xml } from './layout-svg.js'
import { createStaffContext, createStaffDrawingMeasure, createStaffDrawingScope, createStaffVexPreparation, createVexMeasure, drawVexMeasure } from './vexflow-engine.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
const measure = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
describe('private staff drawing scope', () => {
  it.each([
    '{key=F}{4/4}\nN: ||: 1# (2 3) 4 5 :|||',
    '{4/4}\nN: [135:h]{arp}{ac(6# 7)} 2{tip} 3{prall} 4 |||\nB: 1d 2d 3d 4d |||',
    '{4/4}\nN: ([0 2# 3:2]) 4 5 6 |||',
    '{4/4}\nN: 1 2 {key=G} 3 4 |||',
    '{4/4}\nN: 1. (2) 0 3 |||',
    '{4/4}\nN: (1d 2d 3d 4d) (5 6 7 1e) |||',
  ])('restores original mutable state across spacing, width and bass changes: %s', source => {
    const document = projectStaffDocument(analyzeM3N(source).score), task = createStaffVexPreparation()
    const item = document.measures[0]!
    const minimum = createStaffMeasureMinimum(document.hasBass, measure, task)
    minimum(item, false, 0.25); minimum(item, true, 0.25)
    for (const first of [false, true]) for (const bassY of [130, 180, 130]) for (const spacing of [0.25, 0.375, 0.3125]) {
      const scope = createStaffDrawingScope()
      try {
        const borrowed = createStaffDrawingMeasure(item, first, document.hasBass, measure, spacing, bassY, task, scope)
        const fresh = createVexMeasure(item, first, document.hasBass, measure, spacing, bassY)
        const extra = bassY === 130 ? 35 : 100
        expect(xml(drawVexMeasure(borrowed, borrowed.minimum + extra, 17, createStaffContext(task), task)))
          .toBe(xml(drawVexMeasure(fresh, fresh.minimum + extra, 17, createStaffContext())))
      } finally { scope.close() }
    }
  })
  it('rejects overlapping leases and isolates tasks', () => {
    const item = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 |||').score).measures[0]!
    const task = createStaffVexPreparation(), first = createStaffDrawingScope(), second = createStaffDrawingScope()
    const model = createStaffDrawingMeasure(item, true, false, measure, 0.25, 130, task, first)
    expect(() => createStaffDrawingMeasure(item, true, false, measure, 0.25, 130, task, second)).toThrow('同时借给')
    first.close()
    expect(createStaffDrawingMeasure(item, true, false, measure, 0.25, 130, task, second).measure).toBe(model.measure)
    second.close()
    const next = createStaffDrawingScope()
    expect(createStaffDrawingMeasure(item, true, false, measure, 0.25, 130, createStaffVexPreparation(), next)).not.toBe(model)
    next.close()
  })
})
