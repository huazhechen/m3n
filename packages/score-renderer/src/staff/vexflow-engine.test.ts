// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { analyzeM3N } from '@m3n/notation'
import { element, findAll, SvgGeometry } from './layout-svg.js'
import { projectStaffDocument } from './staff-document.js'
import { captureStaffDrawing } from './staff-svg-context.js'
import { StaveModifierPosition } from 'vexflow/bravura'
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

it('uses meter-specific defaults for 4/8 and 6/4 instead of splitting every denominator unit', () => {
  expect(model('{4/8}\nN: (1 2 3 4) |').beams.map(beam => beam.notes.length)).toEqual([2, 2])
  expect(model('{6/4}\nN: (1 2 3 4 5 6 7 1e 2e 3e 4e 5e) |').beams.map(beam => beam.notes.length)).toEqual([6, 6])
})

it('keeps short tuplets separate and beams a longer tuplet as a complete unit', () => {
  const short = model('{4/4}\nN: (([1 2 3:2]) ([4 5 6:2])) 1 2 3 |')
  expect(short.beams.map(beam => beam.notes.length)).toEqual([3, 3])
  const long = model('{4/4}\nN: ([1 2 3 4 5:4]) 1 2 |')
  expect(long.beams.map(beam => beam.notes.length)).toEqual([5])
})

it('shows the occupied-note ratio for unusual tuplets and brackets unbeamed groups', () => {
  const result = model('{4/4}\nN: ([1 2 3 4 5:3]) 1 2 (3) |')
  const drawing = drawVexMeasure(result, result.minimum, 0, createStaffContext())
  const label = findAll(drawing, node => node.attributes.class === 'tupletNum')[0]!
  // Numerator, denominator, and the two colon dots are separate paths.
  expect(findAll(label, node => node.tagName === 'path')).toHaveLength(4)
  const unbeamed = model('{4/4}\nN: [1 2 3:2] 4 5 |')
  const bracket = drawVexMeasure(unbeamed, unbeamed.minimum, 0, createStaffContext())
  expect(findAll(findAll(bracket, n => n.attributes.class === 'tupletNum')[0]!, n => n.tagName === 'rect')).toHaveLength(4)
})

it('breaks beams at an inline key signature without shifting the following beat grid', () => {
  const result = model('{4/4}\nN: (1 {key=G} 2 3 4 5 6 7 1e) |')
  expect(result.beams.map(beam => beam.notes.length)).toEqual([2, 2, 2])
  expect(result.entries[0]![0]!.notes[0]!.getBeam()).toBeUndefined()
  expect(result.entries[0]![1]!.notes[0]!.getBeam()).toBeUndefined()
})

it('reserves arpeggio width along with accidentals and grace notes', () => {
  const plain = model('{4/4}\nN: [1# 3 5:h] 2 3 4 |')
  const rolled = model('{4/4}\nN: [1# 3 5:h]{arp} 2 3 4 |')
  const grace = model('{4/4}\nN: [1# 3 5:h]{arp}{ac(6 7)} 2 3 4 |')
  expect(rolled.minimum).toBeGreaterThan(plain.minimum)
  expect(grace.minimum).toBeGreaterThan(rolled.minimum)
  const drawing = drawVexMeasure(grace, grace.minimum, 0, createStaffContext())
  expect(findAll(drawing, n => n.attributes.class === 'arpeg')).toHaveLength(1)
})

it('aligns pickup beaming with the end of the bar while the complementary final bar starts on the beat', () => {
  const analysis = analyzeM3N('{4/4}\nN: (1 2 3) | (1 2 3 4 5 6 7 1e) | (1 2 3 4 5) |||')
  expect(analysis.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  const document = projectStaffDocument(analysis.score)
  const pickup = createVexMeasure(document.measures[0]!, true, false, measureText, 0.25)
  expect(pickup.entries[0]![0]!.notes[0]!.getBeam()).toBeUndefined()
  expect(pickup.beams[0]!.notes).toEqual(pickup.entries[0]!.slice(1).flatMap(entry => entry.notes))
  const final = createVexMeasure(document.measures.at(-1)!, true, false, measureText, 0.25)
  expect(final.beams.map(beam => beam.notes.length)).toEqual([2, 2])
  expect(final.entries[0]!.at(-1)!.notes[0]!.getBeam()).toBeUndefined()
})

it('keeps measure 32 of Do-Re-Mi clear of its ending repeat at compact and stretched widths', () => {
  const source = readFileSync(resolve(process.cwd(), '../../src/scores/duo_lai_mi_01.m3n'), 'utf8')
  const measure = projectStaffDocument(analyzeM3N(source).score).measures[31]!
  expect(measure.source.right).toBe('rptend')
  for (const first of [false, true]) for (const extra of [0, 80]) {
    const result = createVexMeasure(measure, first, false, measureText, 0.25)
    const drawing = drawVexMeasure(result, result.minimum + extra, 20, createStaffContext())
    const geometry = new SvgGeometry(drawing, measureText)
    const stave = result.staves[0]!
    const context = createStaffContext()
    const repeat = element('g', {}, captureStaffDrawing(context, () => {
      stave.setContext(context)
      stave.getModifiers(StaveModifierPosition.END).forEach(modifier => modifier.draw(stave))
    }))
    const note = findAll(drawing, node => node.attributes.id === measure.melody.at(-1)!.id)[0]!
    expect(geometry.ink(repeat).left - geometry.ink(note).right).toBeGreaterThanOrEqual(3)
  }
})
