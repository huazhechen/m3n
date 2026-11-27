// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasure, drawStaffMeasure } from './staff-engine.js'
import { element, SvgGeometry, xml } from './layout-svg.js'
import { arrangeStaffSystem } from './system-layout.js'

const measure = () => ({width: 0, left: 0, right: 0, ascent: 0, descent: 0})

it.each([
  '{4/4}\nN: ((1d 2d 3d 4d)) 5 6. (7) |||',
  '{4/4}\nN: 1eee 2eee 3eee 4eee |||\nB: [1dd3dd5dd:h]^^ |||',
  '{key=Eb}{4/4}\nN: 0 2# 3 4 |||',
])('empty verse containers have no effect on pure music geometry or output: %s', source => {
  const document = projectStaffDocument(analyzeM3N(source).score)
  for (const numeric of [false, true]) for (const defer of [false, true]) for (const width of [300, 600]) {
    const node = () => element('g', {class: 'system'}, [drawStaffMeasure(
      createStaffMeasure(document.measures[0]!, true, document.hasBass, measure, .6), width, 0, false, numeric)])
    const actualNode = node(), expectedNode = node(), empty = element('g', {class:'verse',id:'empty-v1'})
    expectedNode.children.push(empty)
    const actual = arrangeStaffSystem(actualNode, new SvgGeometry(actualNode, measure, true), width, new Set(), defer)
    const expected = arrangeStaffSystem(expectedNode, new SvgGeometry(expectedNode, measure, true), width, new Set(), defer)
    expect(actual.ink).toEqual(expected.ink)
    actual.materializeInk?.(); expected.materializeInk?.()
    for (const field of ['ink','core','pieces','spacingPieces','boundaryPieces','edgePieces','section','staffSpacing','hasLyrics'] as const)
      expect(actual[field]).toEqual(expected[field])
    expectedNode.children = expectedNode.children.filter(child => child !== empty)
    expect(xml(actualNode)).toBe(xml(expectedNode))
  }
})
