import { expect, it } from 'vitest'
import { planScoreLines, type LineCandidate } from './line-breaking.js'

it('can wrap a collision-safe row when its ordinary reading spacing is overcrowded', () => {
  const compact: LineCandidate[][] = [[{ end: 1, density: .4 }, { end: 2, density: .8 }], [{ end: 2, density: .4 }]]
  expect(planScoreLines(compact)).toEqual([2])
  const reading = compact.map(rows => rows.map(row => ({ ...row, readingDensity: row.end === 2 && row.density === .8 ? 1.5 : .6 })))
  expect(planScoreLines(reading)).toEqual([1, 2])
})

it('can supply nearby automatic plans by changing only the soft row cost', () => {
  const candidates: LineCandidate[][] = [[{ end: 1, density: .4 }, { end: 2, density: .8, readingDensity: 1.13 }], [{ end: 2, density: .4 }]]
  expect(planScoreLines(candidates, { rowCost: .85 })).toEqual([1, 2])
  expect(planScoreLines(candidates, { rowCost: 1.15 })).toEqual([2])
  // A plan cannot invent a row omitted by the collision-feasibility table.
  expect(planScoreLines([[{ end: 1, density: .4 }], [{ end: 2, density: .4 }]], { rowCost: 100 })).toEqual([1, 2])
})

it('compares compression against stretching over the complete following region', () => {
  const candidates: LineCandidate[][] = [
    [{ end: 1, density: .4, naturalDensity: .5, elasticBadness: .6 },
      { end: 2, density: .8, naturalDensity: 1.1, elasticBadness: .04 }],
    [{ end: 2, density: .4, naturalDensity: .6, elasticBadness: 0 },
      { end: 3, density: .8, naturalDensity: 1, elasticBadness: 0 }],
    [{ end: 3, density: .2, naturalDensity: .3, elasticBadness: 2 }],
  ]
  // Keeping two bars on the first line is locally cheaper, but leaves a
  // severely stretched final line. The full-region optimum moves bar two.
  expect(planScoreLines(candidates)).toEqual([1, 3])
  candidates[2]![0]!.elasticBadness = 0
  expect(planScoreLines(candidates)).toEqual([2, 3])
})
