import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { createStaffPreparation } from './staff-engine.js'
import { createStaffMeasureMinimum, planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { findAll, hasClass, nodes, SvgGeometry, textMeasurer } from './layout-svg.js'

it.each([400, 640])('places the slur against the final tuplet numeral at width %s', width => {
  const doc = projectStaffDocument(analyzeM3N('{key=F}{3/4}\nN: {lg}([3 4 3:2]){/} 6. (3) |').score)
  const measure = textMeasurer(), preparation = createStaffPreparation(doc)
  const minimum = createStaffMeasureMinimum(false, measure, preparation)
  const lines = planStaffLines(doc, width, false, measure, .6, minimum)
  const system = engraveStaffSystems(doc, lines, width, measure, .6, false, 1, preparation)[0]!
  const geometry = new SvgGeometry(system.node, measure)
  const slur = findAll(system.node, node => hasClass(node, 'slur'))[0]!
  const label = findAll(system.node, node => hasClass(node, 'm3n-tuplet-label'))[0]!
  expect(label.attributes['data-m3n-below']).toBe('false')
  const values = nodes(slur)[0]!.attributes.d!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  const [left, y] = values as [number, number], right = values[6]!, rise = y - values[9]!
  const clearances = geometry.pieces(label).map(piece => {
    const a = (piece.left - left) / (right - left), b = (piece.right - left) / (right - left)
    return piece.top - y + 3 * rise * Math.min(a * (1 - a), b * (1 - b))
  })
  expect(Math.min(...clearances) * scoreLayoutConfig.staff.engine.scale).toBeCloseTo(scoreLayoutConfig.staff.attachmentGap, 8)
})

// Slurs span the outer head edges and live above the staff. Unlike ties,
// they must not need extra inter-note spacing or staff-rule apex correction.
it.each([.6, 1.2])('keeps short slurs visible outside the staff in tier %s', spacing => {
  for (const music of ['{lg}((1 1)){/}', '{lg}((1e 1e)){/}', '{lg}1{/}']) {
    const doc = projectStaffDocument(analyzeM3N(`{2/4}\nN: ${music} |||`).score)
    const measure = textMeasurer(), preparation = createStaffPreparation(doc)
    const minimum = createStaffMeasureMinimum(false, measure, preparation)
    const lines = planStaffLines(doc, 120, false, measure, spacing, minimum)
    const system = engraveStaffSystems(doc, lines, 120, measure, spacing, false, 1, preparation)[0]!
    const geometry = new SvgGeometry(system.node, measure)
    const slur = findAll(system.node, node => hasClass(node, 'slur'))[0]!
    expect(slur).toBeDefined()
    const bow = geometry.ink(slur)
    const staff = geometry.ink(findAll(system.node, node => hasClass(node, 'staff-line'))[0]!)
    expect(bow.right - bow.left).toBeGreaterThanOrEqual(10)
    expect(bow.bottom).toBeLessThanOrEqual(staff.top - 2)
  }
})
