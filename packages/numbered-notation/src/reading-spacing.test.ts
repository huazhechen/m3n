import { describe, expect, it } from 'vitest'
import { distributeSpacingSurplus, solveNativeSpacing, type SpacingCell } from './native-spacing.js'

const music: SpacingCell = { lane: 'music', left: 4, right: 4, before: 0, after: 0 }
const lyric = (lane = 'verse1'): SpacingCell => ({ lane, sparse: true, left: 9, right: 9,
  before: 0, after: 0, beforeStretch: 0, afterStretch: 0, preferredAfter: 2 })

describe('bounded local reading surplus', () => {
  it('opens a tight lyric interval while preserving total width and most rhythmic stretch', () => {
    const columns = [{ cells: [music, lyric()] }, { cells: [music, lyric()] }, { cells: [music] }]
    const positions = [9, 27, 50], weights = [0, .1, 4, 0]
    const filled = distributeSpacingSurplus(columns, positions, weights, 20)
    const normal = positions.map((position, i) => position + 20 * weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / 4.1)
    expect(filled[1]! - filled[0]!).toBeGreaterThan(normal[1]! - normal[0]!)
    expect(filled[2]).toBeCloseTo(normal[2]!)
    expect(filled[2]! - filled[1]!).toBeGreaterThanOrEqual(positions[2]! - positions[1]!)
    expect(filled[1]! - positions[1]!).toBeLessThanOrEqual(5 + 20 * .1 / 4.1)
  })
  it('takes the strongest verse instead of adding duplicate demands', () => {
    const one = [{ cells: [music, lyric()] }, { cells: [music, lyric()] }]
    const many = one.map(column => ({ cells: [...column.cells, lyric('verse2')] }))
    expect(distributeSpacingSurplus(many, [9, 27], [0, .1, 4], 20))
      .toEqual(distributeSpacingSurplus(one, [9, 27], [0, .1, 4], 20))
  })
  it('keeps hard minima and rigid groups when there is no surplus', () => {
    const columns = [{ cells: [music, lyric()], fixedAfter: 20 }, { cells: [music, lyric()] }, { cells: [music, lyric()] }]
    const minimum = solveNativeSpacing(columns)
    expect(solveNativeSpacing(columns, minimum.minimumWidth, true).positions[1]!
      - solveNativeSpacing(columns, minimum.minimumWidth, true).positions[0]!).toBe(20)
    expect(distributeSpacingSurplus(columns, minimum.positions, [0, 1, 1, 0], 0)).toEqual(minimum.positions)
    const filled = solveNativeSpacing(columns, 100, true)
    expect(filled.positions[1]! - filled.positions[0]!).toBe(20)
    expect(filled.positions.at(-1)! + 9).toBeLessThanOrEqual(100)
  })
  it('does not change lyric-free or already comfortable rhythmic allocation', () => {
    const columns = [{ cells: [music] }, { cells: [music] }]
    expect(distributeSpacingSurplus(columns, [4, 12], [0, 1, 1], 20)).toEqual([4, 22])
    expect(distributeSpacingSurplus(columns.map(c => ({ cells: [...c.cells, lyric()] })), [9, 40], [0, 1, 1], 20)).toEqual([9, 50])
  })
})

it('opens a short music interval without inventing a hard minimum', () => {
  const columns = [{ cells: [{ ...music, preferredAdvance: 20 }] }, { cells: [music] }, { cells: [music] }]
  const normal = distributeSpacingSurplus(columns.map(() => ({ cells: [music] })), [4, 12, 20], [0, .1, 2, 0], 12)
  const preferred = distributeSpacingSurplus(columns, [4, 12, 20], [0, .1, 2, 0], 12)
  expect(preferred[1]! - preferred[0]!).toBeGreaterThan(normal[1]! - normal[0]!)
  expect(preferred.at(-1)).toBe(normal.at(-1))
  expect(solveNativeSpacing(columns).minimumWidth).toBe(24)
})

it('shares a lyric deficit across intervening empty music columns', () => {
  const columns = [{ cells: [music, lyric()] }, { cells: [music] }, { cells: [music, lyric()] }]
  const filled = distributeSpacingSurplus(columns, [9, 18, 27], [0, 1, 1, 4], 3)
  expect(filled[2]! - filled[0]!).toBeGreaterThan(19)
  expect(filled[1]! - filled[0]!).toBeGreaterThanOrEqual(9)
  expect(filled[2]! - filled[1]!).toBeGreaterThanOrEqual(9)
})
