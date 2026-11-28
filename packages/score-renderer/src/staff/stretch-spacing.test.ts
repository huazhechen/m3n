import { expect, it } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreStretchForce, scoreStretchAtForce, mergeScoreStretch } from '@m3n/numbered-notation/layout'
import { projectStaffDocument } from './staff-document.js'
import { prepareStaffLineGraph, staffLineExtras } from './line-layout.js'
import { createStaffPreparation, createStaffMeasure, drawStaffMeasure, staffSpacingPositions, staffSpacingStretch } from './staff-engine.js'
import type { MeasureText } from './layout-svg.js'
const measureText: MeasureText = (text, size) => ({ width: text.length * size, left: 0, right: text.length * size, ascent: size * .8, descent: size * .2 })
it('uses one shared force across lyric-heavy and music-only measures, in scoring and drawing', () => {
  const doc = projectStaffDocument(analyzeM3N('{4/4}\nN: 1 2 3 4 | 5 6 7 1e |||\nL: Spring summer autumn winter').score)
  const graph = prepareStaffLineGraph(doc, 5000, false, measureText, .8)
  const line = graph.makeLines([2], false)[0]!
  line.target = line.minimum + 10
  const extras = staffLineExtras(line, false)
  const curves = line.measures.map((member, index) => member.stretch![index === 0 ? 1 : 0])
  const force = scoreStretchForce(mergeScoreStretch(curves), 10)
  expect(extras.reduce((a, b) => a + b, 0)).toBeCloseTo(10)
  expect(extras[0]! / line.measures[0]!.weight).toBeLessThan(extras[1]! / line.measures[1]!.weight)
  const preparation = createStaffPreparation(doc)
  line.measures.forEach((member, index) => {
    expect(extras[index]).toBeCloseTo(scoreStretchAtForce(curves[index]!, force))
    const model = createStaffMeasure(member.measure, index === 0, false, measureText, .8, 0, preparation)
    expect(staffSpacingStretch(model.prepared, .8)).toEqual(curves[index])
    const positions = staffSpacingPositions(model.prepared, .8, extras[index]!)
    drawStaffMeasure(model, model.minimum + extras[index]!, 0)
    const notes = model.entries[0]!
    const delta = notes.map(entry => entry.notes[0]!.x)
    for (let i = 1; i < delta.length; i++) expect(delta[i]! - delta[0]!).toBeCloseTo(positions[i]! - positions[0]!)
  })
  const equal = staffLineExtras(line, true)
  expect(line.measures[0]!.body + equal[0]!).toBeCloseTo(line.measures[1]!.body + equal[1]!)
})
