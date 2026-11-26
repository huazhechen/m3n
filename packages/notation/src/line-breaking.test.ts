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
