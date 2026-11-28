import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { projectStaffDocument } from './staff-document.js'
import { createStaffPreparation, createStaffMeasure, drawStaffMeasure } from './staff-engine.js'
import { SvgGeometry, textMeasurer, xml } from './layout-svg.js'

it('reuses only direction-invariant measure preparation and preserves fresh geometry through cache eviction', () => {
  const source = '{5/4}\nN: ' + Array(5).fill('((7 1e 7 1e))').join(' ') + ' | 1 2 3 4 5 |'
  const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer()
  const preparation = createStaffPreparation(document), item = document.measures[0]!, other = document.measures[1]!
  for (const first of [false, true]) {
    const baseline = preparation.measure(item, first, false, measure)
    const snapshot = structuredClone(baseline)
    const groups = baseline.beams.filter(beam => beam.flexible).map(beam => {
      const note = baseline.entries[beam.lane]!.flatMap(entry => entry.notes)[beam.indices[0]!]!
      return { id: note.item.id, direction: note.direction }
    })
    expect(groups).toHaveLength(5)
    const untouched = preparation.measure(other, first, false, measure)
    const combinations = Array.from({ length: 32 }, (_, mask) => mask)
    for (const mask of [...combinations, ...combinations.toReversed()]) {
      const choices = new Map(groups.filter((_, index) => mask & (1 << index)).map(group => [group.id, -group.direction]))
      const shared = preparation.withBeamDirections(choices, document), fresh = createStaffPreparation(document, choices)
      expect(shared.measure(other, first, false, measure)).toBe(untouched)
      if (mask === 0) expect(shared.measure(item, first, false, measure)).toBe(baseline)
      for (const extra of [0, 37.12345]) {
        const a = createStaffMeasure(item, first, false, measure, .6, 130, shared)
        const b = createStaffMeasure(item, first, false, measure, .6, 130, fresh)
        expect(a.prepared).toEqual(b.prepared)
        const actual = drawStaffMeasure(a, a.minimum + extra, -7.12345, false, true)
        const expected = drawStaffMeasure(b, b.minimum + extra, -7.12345, false, true)
        expect(new SvgGeometry(actual, measure).pieces(actual)).toEqual(new SvgGeometry(expected, measure).pieces(expected))
        expect(xml(actual)).toBe(xml(expected))
      }
    }
    expect(baseline).toEqual(snapshot)
  }
})

it('rebuilds incoming-tie context when the supplied preparation was not bound to this document', () => {
  const document = projectStaffDocument(analyzeM3N('{3/4}\nN: 7~ ((7 1e 7 1e)) 1d |').score), measure = textMeasurer()
  const item = document.measures[0]!, unbound = createStaffPreparation()
  const baseline = unbound.measure(item, true, false, measure)
  const beam = baseline.beams.find(beam => beam.flexible)!
  expect(beam).toBeDefined()
  const note = baseline.entries[beam.lane]!.flatMap(entry => entry.notes)[beam.indices[0]!]!
  const choices = new Map([[note.item.id, -note.direction]])
  const actual = unbound.withBeamDirections(choices, document).measure(item, true, false, measure)
  const expected = createStaffPreparation(document, choices).measure(item, true, false, measure)
  expect(actual.beams.some(beam => beam.flexible)).toBe(false)
  expect(actual).toEqual(expected)
})
