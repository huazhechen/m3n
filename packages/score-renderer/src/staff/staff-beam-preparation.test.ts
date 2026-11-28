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
      const variant = shared.measure(item, first, false, measure)
      expect(variant.metrics).toBe(baseline.metrics)
      expect(variant.signatures).toBe(baseline.signatures)
      for (const [laneIndex, lane] of variant.entries.entries()) for (const [entryIndex, entry] of lane.entries())
        for (const [noteIndex, note] of entry.notes.entries()) {
          const original = baseline.entries[laneIndex]![entryIndex]!.notes[noteIndex]!
          if (note.direction === original.direction) expect(note).toBe(original)
        }
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


it.each([
  '{key=G}{4/4}\nN: ((7 1e 7 1e)) 3{tip} (4 5) 6 | ((6 7 6 7)) 1 2 3 |\nL: 啊 啊 啊 啊 啊 啊 啊 啊',
  '{4/4}\nN: ((7 1e 7 1e)) 2 {key=G} 3 4 |\nB: ((7d 1 7d 1)) 2d 3d 4d |',
  '{4/4}\nN: ((6# 7 6# 7)) ([123:2]) 4{ac(5 6)} 5 |',
])('matches full preparation when flexible direction views share mixed musical inputs: %s', source => {
  const document = projectStaffDocument(analyzeM3N(source).score), measure = textMeasurer()
  const task = createStaffPreparation(document)
  let tested = 0
  for (const item of document.measures) for (const first of [false, true]) {
    const base = task.measure(item, first, document.hasBass, measure)
    const groups = base.beams.filter(beam => beam.flexible).map(beam => {
      const note = base.entries[beam.lane]!.flatMap(entry => entry.notes)[beam.indices[0]!]!
      return { id: note.item.id, direction: note.direction }
    })
    for (let mask = 0; mask < 2 ** groups.length; mask++) {
      const choices = new Map(groups.filter((_, index) => mask & (1 << index)).map(group => [group.id, -group.direction]))
      const actual = task.withBeamDirections(choices, document)
      // Initial non-default preparation keeps the original complete pipeline.
      const reference = createStaffPreparation(document, choices)
      const descriptor = actual.measure(item, first, document.hasBass, measure)
      expect(descriptor).toEqual(reference.measure(item, first, document.hasBass, measure))
      expect(descriptor.metrics).toBe(base.metrics)
      for (const spacing of [.6, 1.8]) {
        const a = createStaffMeasure(item, first, document.hasBass, measure, spacing, 171.234, actual)
        const b = createStaffMeasure(item, first, document.hasBass, measure, spacing, 171.234, reference)
        const an = drawStaffMeasure(a, a.minimum + 73.12345, -19.3333, false, true)
        const bn = drawStaffMeasure(b, b.minimum + 73.12345, -19.3333)
        expect(xml(an)).toBe(xml(bn))
        expect(new SvgGeometry(an, measure).pieces(an)).toEqual(new SvgGeometry(bn, measure).pieces(bn))
      }
      if (mask) tested++
    }
  }
  expect(tested).toBeGreaterThan(0)
})
