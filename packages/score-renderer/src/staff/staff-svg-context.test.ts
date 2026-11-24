// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SVGContext } from 'vexflow/bravura'
import { analyzeM3N } from '@m3n/notation'
import { createStaffContext, createStaffVexPreparation, createVexMeasure, drawVexMeasure } from './vexflow-engine.js'
import { projectStaffDocument } from './staff-document.js'
import { element, readXml, SvgGeometry, xml, type XmlNode } from './layout-svg.js'
import { captureStaffDrawing, StaffSvgContext } from './staff-svg-context.js'

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
    expect(draw(source, createStaffContext(createStaffVexPreparation()))).toBe(native)
  })
  it('collects ordinary music without allocating SVG DOM elements', () => {
    const create = vi.spyOn(document, 'createElementNS')
    try {
      expect(draw('{4/4}\nN: (1 2 3 4 5 6 7 1e) |||', createStaffContext())).toContain('class="beam"')
      expect(create).not.toHaveBeenCalled()
    } finally { create.mockRestore() }
  })
  it('records rounded curve extrema and independent subpaths exactly like SVG parsing', () => {
    let seed = 173
    const value = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 200 }
    const context = new StaffSvgContext()
    const shapes = captureStaffDrawing(context, () => {
      for (let i = 0; i < 100; i++) {
        context.beginPath().moveTo(value(), value())
        for (let j = 0; j < 4; j++) context.bezierCurveTo(value(), value(), value(), value(), value(), value())
        context.closePath().moveTo(value(), value())
        context.quadraticCurveTo(value(), value(), value(), value()).lineTo(value(), value()).fill()
      }
      // Constant, almost-quadratic and cubic derivative degeneracies.
      context.beginPath().moveTo(0, 0).bezierCurveTo(0, 0, 0, 0, 0, 0).fill()
      context.beginPath().moveTo(0, 0).bezierCurveTo(10, 10, 20, 10, 30, 0).fill()
    })
    expect(shapes.every(shape => shape.pathInk)).toBe(true)
    const root = element('g', { transform: 'rotate(13) scale(0.7)' }, shapes)
    const parsed = readXml(xml(root))
    expect(new SvgGeometry(root, measureText).pieces(root)).toEqual(new SvgGeometry(parsed, measureText).pieces(parsed))
  })
  it('keeps earlier fill/stroke snapshots immutable and falls back for arcs or changed paths', () => {
    const context = new StaffSvgContext()
    const shapes = captureStaffDrawing(context, () => {
      context.beginPath().moveTo(1, 2).lineTo(3, 4).fill().stroke()
      context.lineTo(20, 30).fill()
      context.beginPath().arc(10, 10, 5, 0, Math.PI, false).stroke()
      context.beginPath().moveTo(0, 0)
      context.path = 'M40 50 L60 70'
      context.stroke()
    })
    expect(shapes[0]!.pathInk!.boxes).toEqual([{ left: 1, right: 3, top: 2, bottom: 4 }])
    expect(shapes[1]!.pathInk!.boxes).toEqual(shapes[0]!.pathInk!.boxes)
    expect(shapes[2]!.pathInk!.boxes[0]!.right).toBe(20)
    expect(shapes[3]!.pathInk).toBeUndefined()
    expect(shapes[4]!.pathInk).toBeUndefined()
    const root = element('g', {}, shapes), parsed = readXml(xml(root))
    const geometry = new SvgGeometry(root, measureText)
    expect(geometry.pieces(root)).toEqual(new SvgGeometry(parsed, measureText).pieces(parsed))
    const first = shapes[0] as XmlNode
    first.attributes.d = 'M-40 -50 L-60 -70'
    const changed = readXml(xml(root))
    expect(geometry.pieces(root)).toEqual(new SvgGeometry(changed, measureText).pieces(changed))
  })
})
