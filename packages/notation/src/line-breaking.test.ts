import { expect, it } from 'vitest'
import { planScoreLines, type LineCandidate } from './line-breaking.js'

it('can wrap a collision-safe row when its ordinary reading spacing is overcrowded', () => {
  const compact: LineCandidate[][] = [[{ end: 1, density: .4 }, { end: 2, density: .8 }], [{ end: 2, density: .4 }]]
  expect(planScoreLines(compact)).toEqual([2])
  const reading = compact.map(rows => rows.map(row => ({ ...row, readingDensity: row.end === 2 && row.density === .8 ? 1.5 : .6 })))
  expect(planScoreLines(reading)).toEqual([1, 2])
})
