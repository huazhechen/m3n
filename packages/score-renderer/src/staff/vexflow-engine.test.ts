// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { findAll } from './layout-svg.js'
import { projectStaffDocument } from './staff-document.js'
import { createStaffContext, createVexMeasure, drawVexMeasure } from './vexflow-engine.js'

const measureText = () => ({ width: 0, left: 0, right: 0, ascent: 0, descent: 0 })
function model(source: string) {
  const measure = projectStaffDocument(analyzeM3N(source).score).measures[0]!
  return createVexMeasure(measure, true, false, measureText, 0.25)
}

describe('staff rhythm engraving', () => {
  it('beams eighth-note triplets by quarter-note beat in 4/4', () => {
    const result = model('{4/4}\nN: ([3 3 3:2]) ([1 1 1:2]) ([6d 6d 6d:2]) ([3d 3d 3d:2]) |')
    expect(result.beams.map(beam => beam.notes.length)).toEqual([3, 3, 3, 3])
    for (const entry of result.entries[0]!) {
      expect(entry.notes.every(note => note.getBeam() === entry.notes[0]!.getBeam())).toBe(true)
    }
  })
  it('beams ordinary eighth notes by beat, retaining dotted beats in compound time', () => {
    expect(model('{4/4}\nN: (1 2 3 4 5 6 7 1e) |').beams.map(beam => beam.notes.length)).toEqual([2, 2, 2, 2])
    expect(model('{6/8}\nN: (1 2 3 4 5 6) |').beams.map(beam => beam.notes.length)).toEqual([3, 3])
  })
  it('places rest-led tuplets on the pitched stem side, keeping their bracket', () => {
    for (const source of ['([0 0 3d:2])', '([0 7 7:2])']) {
      const result = model(`{4/4}\nN: 1 2 3 ${source} |`)
      const entry = result.entries[0]!.at(-1)!
      const pitched = entry.notes.find(note => !note.isRest())!
      const markup = drawVexMeasure(result, result.minimum, 0, createStaffContext())
      const y = entry.tuplet!.getYPosition()
      if (pitched.getStemDirection() === 1) expect(y).toBeLessThan(result.staves[0]!.getYForLine(0))
      else expect(y).toBeGreaterThan(result.staves[0]!.getYForLine(4))
      const label = findAll(markup, node => node.attributes.class === 'tupletNum')[0]!
      expect(findAll(label, node => node.tagName === 'rect')).toHaveLength(4)
    }
  })
})
