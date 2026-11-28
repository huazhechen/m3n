import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { createStaffPreparation } from './staff-engine.js'
import { createStaffMeasureMinimum, planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { findAll, hasClass, SvgGeometry, textMeasurer, xml, readXml } from './layout-svg.js'

function draw(source: string, enabled: boolean, numeric = false) {
  const previous = scoreLayoutConfig.staff.reuseBeamOuterSpace
  scoreLayoutConfig.staff.reuseBeamOuterSpace = enabled
  try {
    const document = projectStaffDocument(analyzeM3N(source).score)
    const measure = textMeasurer(), preparation = createStaffPreparation(document)
    const minimum = createStaffMeasureMinimum(document.hasBass, measure, preparation)
    const lines = planStaffLines(document, 640, false, measure, .8, minimum)
    return engraveStaffSystems(document, lines, 640, measure, .8, false, 1, preparation, undefined, undefined, numeric, false)[0]!
  } finally { scoreLayoutConfig.staff.reuseBeamOuterSpace = previous }
}
function directions(system: ReturnType<typeof draw>) {
  return findAll(readXml(xml(system.node)), node => hasClass(node, 'stem') && !!node.attributes['data-m3n-join']).map(node => {
    const coordinates = node.attributes.d!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number)
    return Math.sign(coordinates[1]! - coordinates[3]!)
  })
}

it.each([
  ['1ee ((3 2e 2e 2e))', 1],
  ['1d ((5 2e 5 5))', -1],
] as const)('uses existing outer space at either side, regardless of neighboring stem direction: %s', (music, direction) => {
  const source = `{2/4}\nN: ${music} |`
  const before = draw(source, false), after = draw(source, true)
  expect(directions(before)).toEqual(Array(4).fill(-direction))
  expect(directions(after)).toEqual(Array(4).fill(direction))
  expect(after.ink.bottom - after.ink.top).toBeLessThan(before.ink.bottom - before.ink.top)
  expect(after.core).toEqual(before.core)
})

it('prefers upward beams beside lyrics when both sides fit the existing row height', () => {
  const source = '{3/4}\nN: 1ee ((7 1e 7 1e)) 1d |'
  expect(directions(draw(source, true))).toEqual(Array(4).fill(-1))
  const withLyrics = source + '\nL: 啊 啊 啊 啊 啊 啊'
  const before = draw(withLyrics, false), after = draw(withLyrics, true)
  expect(directions(after)).toEqual(Array(4).fill(1))
  expect(after.ink.bottom - after.ink.top).toBeLessThanOrEqual(before.ink.bottom - before.ink.top + 1e-7)
})

it('keeps optimized numeric and painted geometry identical and leaves prepared directions unchanged', () => {
  const source = '{2/4}\nN: 1ee ((3 2e 2e 2e)) |'
  const numeric = draw(source, true, true), painted = draw(source, true)
  const measure = textMeasurer()
  expect(new SvgGeometry(numeric.node, measure).ink(numeric.node)).toEqual(new SvgGeometry(painted.node, measure).ink(painted.node))
  expect(directions(numeric)).toEqual(directions(painted))
  expect(directions(draw(source, false))).toEqual(Array(4).fill(-1))
})
