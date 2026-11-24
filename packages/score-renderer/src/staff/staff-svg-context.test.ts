// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SVGContext } from 'vexflow/bravura'
import { analyzeM3N } from '@m3n/notation'
import { createStaffContext, createVexMeasure, drawVexMeasure } from './vexflow-engine.js'
import { projectStaffDocument } from './staff-document.js'
import { xml } from './layout-svg.js'

const measureText = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
function draw(source: string, context: SVGContext) {
  const measure = projectStaffDocument(analyzeM3N(source).score).measures[0]!
  const model = createVexMeasure(measure, true, false, measureText, 0.25)
  return xml(drawVexMeasure(model, model.minimum + 40, 10, context))
}
describe('direct VexFlow SVG collection', () => {
  it.each([
    '{key=F}{4/4}\nN: ||: 1# (2 3) 4 5 :|||',
    '{4/4}\nN: [1# 3 5:h]{arp}{ac(6 7)} 2 3 4 |||',
    '{4/4}\nN: ([0 0 3d:2]) 1 2 3 |||',
    '{4/4}\nN: ([1 2 3 4 5:3]) 1 2 (3) |||',
    '{4/4}\nN: 1 2 {key=G} 3 4 |||',
  ])('matches native SVGContext output: %s', source => {
    const native = draw(source, new SVGContext(document.createElement('div')))
    expect(draw(source, createStaffContext())).toBe(native)
  })
  it('collects ordinary music without allocating SVG DOM elements', () => {
    const create = vi.spyOn(document, 'createElementNS')
    try {
      expect(draw('{4/4}\nN: (1 2 3 4 5 6 7 1e) |||', createStaffContext())).toContain('class="beam"')
      expect(create).not.toHaveBeenCalled()
    } finally { create.mockRestore() }
  })
})
