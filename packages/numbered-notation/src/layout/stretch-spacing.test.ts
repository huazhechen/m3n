import { expect, it } from 'vitest'
import { prepareScoreStretch, scoreStretchForce, scoreStretchAtForce, mergeScoreStretch, distributeScoreStretchGroups, inheritScoreStretchWidth } from './stretch-spacing.js'
import { cacheScoreMinimumSpacing, scoreSpacingStretch, solveScoreMinimumSpacing, type SpacingColumn } from './spacing.js'

const additions = (weights: number[], credits: number[], extra: number) => {
  const plan = prepareScoreStretch(weights, credits), force = scoreStretchForce(plan, extra)
  return weights.map((weight, index) => Math.max(0, force * weight - credits[index]!))
}
it('credits lyric-opened space before stretching it again, then resumes common pressure', () => {
  expect(additions([1, 1], [0, 12], 8)).toEqual([8, 0])
  expect(additions([1, 1], [0, 12], 20)).toEqual([16, 4])
})
it('normalizes existing space by rhythm instead of penalizing the absolute space of long notes', () => {
  expect(additions([1, 2], [6, 12], 9)).toEqual([3, 6])
  expect(additions([1, 2], [6, 24], 6)).toEqual([6, 0])
})
it('preserves units, fixed springs and the exact available width', () => {
  const original = additions([0, .5, 2], [0, 3, 20], 37)
  const scaled = additions([0, .5, 2], [0, 3 * 7.5, 20 * 7.5], 37 * 7.5)
  expect(original[0]).toBe(0)
  expect(original.reduce((a, b) => a + b, 0)).toBeCloseTo(37)
  scaled.forEach((value, index) => expect(value).toBeCloseTo(original[index]! * 7.5))
  expect(additions([1, 1], [2, 4], 0)).toEqual([0, 0])
})
it('keeps all pressure breakpoints when grouping intervals into measures', () => {
  const groups = [prepareScoreStretch([1, 1], [0, 20]), prepareScoreStretch([1, 1], [10, 10])]
  expect(distributeScoreStretchGroups(groups, 4)).toEqual([4, 0])
  for (const extra of [0, 4, 25, 100]) {
    const force = scoreStretchForce(mergeScoreStretch(groups), extra)
    const parts = distributeScoreStretchGroups(groups, extra)
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(extra)
    groups.forEach((plan, index) => {
      expect(scoreStretchAtForce(plan, force)).toBeCloseTo(parts[index]!)
      const ownForce = scoreStretchForce(plan, parts[index]!)
      expect(scoreStretchAtForce(plan, ownForce)).toBeCloseTo(parts[index]!)
    })
  }
})
it.each(['lyrics', 'tie', 'other-constraint'])('credits any sparse constraint (%s), with direct/cached/measure-curve parity', lane => {
  const music = () => ({ lane: 'music', left: 3, right: 3, before: 0, after: 0, beforeStretch: 1, afterStretch: 1 })
  const lyric = (right: number) => ({ lane, sparse: true, left: 0, right, before: 0, after: 0, beforeStretch: 0, afterStretch: 0 })
  const columns: SpacingColumn[] = [{ cells: [music()] }, { cells: [music(), lyric(18)] }, { cells: [music(), lyric(0)] }]
  const fresh = structuredClone(columns)
  cacheScoreMinimumSpacing(columns)
  expect(solveScoreMinimumSpacing(columns).positions).toEqual([3, 9, 27])
  expect(solveScoreMinimumSpacing(columns, 38, true).positions).toEqual([3, 17, 35])
  expect(solveScoreMinimumSpacing(columns, 50, true).positions).toEqual([3, 25, 47])
  expect(solveScoreMinimumSpacing(columns, 38, true)).toEqual(solveScoreMinimumSpacing(fresh, 38, true))
  expect(scoreSpacingStretch(columns).credits).toEqual([0, 0, 12, 0])
  expect(columns).toEqual(fresh)
})

it('inherits the same pressure for short endings even when their lyric credits differ', () => {
  const previous = { minimumWidth: 30, stretch: prepareScoreStretch([1, 1], [0, 12]) }
  const current = { minimumWidth: 18, stretch: prepareScoreStretch([1], [12]) }
  expect(inheritScoreStretchWidth(current, previous, 38)).toBe(18)
  expect(inheritScoreStretchWidth(current, previous, 50)).toBe(22)
})

it('credits extra reservations on the music lane itself without classifying their source', () => {
  const music = () => ({ lane: 'music', left: 3, right: 3, before: 0, after: 0, beforeStretch: 1, afterStretch: 1 })
  const columns = [{ cells: [music()] }, { cells: [{ ...music(), right: 15, stretchRight: 3 }] }, { cells: [music()] }]
  expect(scoreSpacingStretch(columns).credits).toEqual([0, 0, 12, 0])
  expect(solveScoreMinimumSpacing(columns, 38, true).positions).toEqual([3, 17, 35])
})
