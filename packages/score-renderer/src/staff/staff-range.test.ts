// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { createStaffMeasure, drawStaffMeasure, drawStaffTie, STAFF_SCALE } from './staff-engine.js'
import { engraveStaffSystems } from './staff-system.js'
import { planStaffLines } from './line-layout.js'
import { findAll, hasClass, SvgGeometry, textMeasurer, xml } from './layout-svg.js'

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

function systems(source: string) {
  const document = projectStaffDocument(analyzeM3N(source).score)
  const measure = textMeasurer()
  return engraveStaffSystems(document, planStaffLines(document, 640, false, measure, .25), 640, measure, .25, false)
}

it.each(['cresc', 'decres'])('spreads a single sustained %s over the duration instead of the head', kind => {
  const [system] = systems(`{4/4}\nN: {${kind}}1^^{/} |||`)
  const geometry = new SvgGeometry(system!.node, textMeasurer())
  const hairpin = geometry.ink(findAll(system!.node, node => hasClass(node, 'hairpin'))[0]!)
  const note = geometry.ink(findAll(system!.node, node => hasClass(node, 'notehead'))[0]!)
  const staff = geometry.ink(findAll(system!.node, node => hasClass(node, 'staff'))[0]!)
  expect(hairpin.right - hairpin.left).toBeGreaterThan(8 * (note.right - note.left))
  expect(hairpin.right).toBeLessThan(staff.right)
})

it('keeps successive single-event hairpins separate at their time boundaries', () => {
  const [system] = systems('{4/4}\nN: {cresc}1^{/} {decres}2^{/} |||')
  const geometry = new SvgGeometry(system!.node, textMeasurer())
  const [first, second] = findAll(system!.node, node => hasClass(node, 'hairpin')).map(node => geometry.ink(node))
  expect(first!.right - first!.left).toBeGreaterThan(30)
  expect(second!.right - second!.left).toBeGreaterThan(30)
  expect(first!.right).toBeLessThan(second!.left)
})

it('uses the common time axis for a bass duration ending between melody columns', () => {
  const document = projectStaffDocument(analyzeM3N('{4/4}\nN: 1^ 2^ |\nB: 1d. (2d) 3d 4d |').score)
  const model = createStaffMeasure(document.measures[0]!, true, true, textMeasurer(), .25)
  drawStaffMeasure(model, 700, 0)
  const [first, second] = model.entries[0]!.map(entry => entry.notes[0]!)
  const bass = model.entries[1]![0]!.notes[0]!
  expect(bass.durationEndX!).toBeGreaterThan(first!.headRight)
  expect(bass.durationEndX!).toBeLessThan(second!.headLeft)
})

it('covers the last tuplet child duration and stops before the following beat', () => {
  const [system] = systems('{4/4}\nN: {cresc}[123:2]{/} 4 5 |||')
  const geometry = new SvgGeometry(system!.node, textMeasurer())
  const hairpin = geometry.ink(findAll(system!.node, node => hasClass(node, 'hairpin'))[0]!)
  const heads = findAll(system!.node, node => hasClass(node, 'notehead')).map(node => geometry.ink(node))
  expect(heads).toHaveLength(5)
  expect(hairpin.right).toBeGreaterThan(heads[2]!.right + 10)
  expect(hairpin.right).toBeLessThan(heads[3]!.left)
})

it('retains duration coverage on every system of a crossing hairpin and on both staffs', () => {
  const result = systems('{4/4}\nN: {cresc}1^^ | {br}2^^{/} |||\nB: {decres}1d^^ | 2d^^{/} |')
  expect(result).toHaveLength(2)
  for (const system of result) {
    const marks = findAll(system.node, node => hasClass(node, 'hairpin'))
    expect(marks.map(node => node.attributes['data-m3n-staff'])).toEqual(['0', '1'])
    const geometry = new SvgGeometry(system.node, textMeasurer())
    for (const mark of marks) {
      const ink = geometry.ink(mark)
      expect(ink.right - ink.left).toBeGreaterThan(100)
    }
  }
})

// At the cubic midpoint a ribbon has 3/4 of its control thickness. Test
// actual visible width, rather than merely checking the configured constant.
it.each([1, -1])('keeps short ties visible in both stem directions (%s)', direction => {
  const document = projectStaffDocument(analyzeM3N('{2/4}\nN: 1~ 1 |||').score)
  const model = createStaffMeasure(document.measures[0]!, true, false, textMeasurer(), .25)
  drawStaffMeasure(model, 300, 0)
  const [first, last] = model.entries[0]!.map(entry => entry.notes[0]!)
  first!.direction = direction
  const markup = xml(drawStaffTie(first, last, 0, 300)[0]!)
  const d = /d="([^"]+)"/.exec(markup)![1]!
  const values = d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number)
  expect(Math.abs(values[5]! - values[9]!) * .75 * STAFF_SCALE).toBeGreaterThanOrEqual(1.2)
  expect(markup).toContain('fill="#000"')
})
