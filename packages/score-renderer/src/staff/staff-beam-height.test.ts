import { expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { createStaffPreparation, createStaffMeasure, drawStaffMeasure } from './staff-engine.js'
import { createStaffMeasureMinimum, planStaffLines } from './line-layout.js'
import { engraveStaffSystems, prepareStaffSystems } from './staff-system.js'
import { SvgGeometry, textMeasurer, xml } from './layout-svg.js'
import { staffInvariantMusicInk } from './staff-invariant-music.js'

it('bounds every direction combination using actual invariant head and stem points', () => {
  const source = '{7/4}\nN: 1ee ' + Array(5).fill('((7 1e 7 1e))').join(' ') + ' 1d |'
  const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer(), preparation = createStaffPreparation(document)
  const item = document.measures[0]!, base = preparation.measure(item, true, false, measure)
  const groups = base.beams.filter(beam => beam.flexible).map(beam => {
    const note = base.entries[beam.lane]!.flatMap(entry => entry.notes)[beam.indices[0]!]!
    return { id: note.item.id, direction: note.direction }
  })
  expect(groups).toHaveLength(5)
  let invariant: ReturnType<typeof staffInvariantMusicInk> | undefined
  for (let mask = 0; mask < 32; mask++) {
    const choices = new Map(groups.filter((_, index) => mask & (1 << index)).map(group => [group.id, -group.direction]))
    const model = createStaffMeasure(item, true, false, measure, .6, 130, preparation.withBeamDirections(choices, document))
    const node = drawStaffMeasure(model, model.minimum + 37.12345, -7.12345, false, true)
    const actual = new SvgGeometry(node, measure).pieces(node)
    invariant ??= staffInvariantMusicInk([model])
    const ink = new Set(actual.map(piece => JSON.stringify(piece)))
    for (const piece of invariant) expect(ink.has(JSON.stringify(piece)), JSON.stringify(piece)).toBe(true)
  }
})

it.each([
  '{3/4}\nN: 1ee ((7 1e 7 1e)) 1d |',
  '{2/4}\nN: 1ee ((3 2e 2e 2e)) |',
  '{2/4}\nN: 1d ((5 2e 5 5)) |',
  '{3/4}\nN: 1ee ((7 1e 7 1e)) 1d |\nL: 啊 啊 啊 啊 啊 啊',
])('certified direction rejection has the same SVG and geometry as all trials: %s', source => {
  const previous = scoreLayoutConfig.staff.reuseBeamOuterSpace
  scoreLayoutConfig.staff.reuseBeamOuterSpace = true
  try {
    const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer()
    for (const numeric of [false, true]) {
      const preparation = createStaffPreparation(document), minimum = createStaffMeasureMinimum(false, measure, preparation)
      const lines = planStaffLines(document, 640, false, measure, .8, minimum)
      const trials = vi.spyOn(preparation, 'withBeamDirections')
      try {
        const actual = prepareStaffSystems(document, lines, 640, measure, .8, false, 1, preparation).map(row => row.complete())
        const calls = trials.mock.calls.length
        trials.mockClear()
        // Ordinary complete rows do not compute the optional staged proof,
        // so this is the original exhaustive per-group direction algorithm.
        const expected = engraveStaffSystems(document, lines, 640, measure, .8, false, 1, preparation, undefined, undefined, numeric, false)
        expect(actual.map(row => xml(row.node))).toEqual(expected.map(row => xml(row.node)))
        expect(actual.map(({ node: _, ...row }) => row)).toEqual(expected.map(({ node: _, ...row }) => row))
        expect(calls).toBeLessThanOrEqual(trials.mock.calls.length)
        if (source === '{3/4}\nN: 1ee ((7 1e 7 1e)) 1d |') expect(calls).toBeLessThan(trials.mock.calls.length)
      } finally { trials.mockRestore() }
    }
  } finally { scoreLayoutConfig.staff.reuseBeamOuterSpace = previous }
})
