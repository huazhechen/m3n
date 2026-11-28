/** Physical clearance between two visible music elements. Exterior margins have no interval. */
export type ScoreRhythmicInterval = { start: number; end: number; left: number; right: number; weight: number }
export function measureScoreRhythmicIntervals(positions: readonly number[], intervals: readonly ScoreRhythmicInterval[]) {
  let clearance = 0, weight = 0
  const gaps = intervals.map(interval => {
    const value = Math.max(0, positions[interval.end]! - interval.left - positions[interval.start]! - interval.right)
    clearance += value; weight += interval.weight
    return value / interval.weight
  })
  return { gap: weight > 0 ? clearance / weight : undefined, clearance, weight, gaps }
}
