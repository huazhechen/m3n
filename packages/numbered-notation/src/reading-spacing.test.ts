import { describe, expect, it } from 'vitest'
import { fitSpacingSprings, solveNativeSpacing, type SpacingCell } from './native-spacing.js'

const music: SpacingCell = { lane: 'music', left: 4, right: 4, before: 0, after: 0 }
const lyric = (lane = 'verse1'): SpacingCell => ({ lane, sparse: true, left: 9, right: 9,
  before: 0, after: 0, beforeStretch: 0, afterStretch: 0, preferredAfter: 2 })

describe('natural reading spacing', () => {
  const columns = [{ cells: [music, lyric()] }, { cells: [music, lyric()] }, { cells: [music] }]
  it('opens a tight lyric interval while retaining total width', () => {
    const fit = fitSpacingSprings(columns, [9, 27, 50], [0, .1, 4, 0], 20)
    expect(fit.positions[1]! - fit.positions[0]!).toBeGreaterThan(18 + 20 * .1 / 4.1)
    expect(fit.positions[2]).toBeCloseTo(70)
    expect(fit.positions[2]! - fit.positions[1]!).toBeGreaterThanOrEqual(23)
  })
  it('takes the strongest verse instead of adding duplicate natural demands', () => {
    const many = columns.map(column => ({ cells: column.cells.some(cell => cell.sparse) ? [...column.cells, lyric('verse2')] : column.cells }))
    expect(fitSpacingSprings(many, [9, 27, 50], [0, .1, 4, 0], 20))
      .toEqual(fitSpacingSprings(columns, [9, 27, 50], [0, .1, 4, 0], 20))
  })
  it.each([40, 60, 100])('preserves rigid offsets, sparse lyric clearance and outer bounds at width %s', width => {
    const columns = [{ cells: [music, lyric()], fixedAfter: 20 }, { cells: [music, lyric()] }, { cells: [music, lyric()] }]
    const minimum = solveNativeSpacing(columns)
    const fitted = solveNativeSpacing(columns, width, true)
    expect(fitted.positions[1]! - fitted.positions[0]!).toBe(20)
    expect(fitted.positions[2]! - fitted.positions[1]!).toBeGreaterThanOrEqual(18)
    expect(fitted.positions.at(-1)! + 9).toBeLessThanOrEqual(Math.max(width, minimum.minimumWidth))
  })
  it('compresses below a natural reading target without making it a hard minimum', () => {
    const columns = [{ cells: [{ ...music, preferredAdvance: 30 }] }, { cells: [music] }]
    expect(solveNativeSpacing(columns).minimumWidth).toBe(16)
    const natural = solveNativeSpacing(columns, Infinity, false, { natural: true })
    expect(natural.positions[1]! - natural.positions[0]!).toBeCloseTo(30)
    const fitted = solveNativeSpacing(columns, 24, true)
    expect(fitted.positions[1]! - fitted.positions[0]!).toBeCloseTo(16)
    expect(fitted.compressionPenalty).toBeGreaterThan(0)
    expect(solveNativeSpacing(columns, 50, true).compressionPenalty).toBe(0)
  })
  it('shares a sparse lyric demand over intervening music columns', () => {
    const columns = [{ cells: [music, lyric()] }, { cells: [music] }, { cells: [music, lyric()] }]
    const fitted = fitSpacingSprings(columns, [9, 17, 25], [0, 1, 1, 0], 4)
    expect(fitted.positions).toEqual([9, 19, 29])
    expect(fitted.force).toBe(0)
  })
})
