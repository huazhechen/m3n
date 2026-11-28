import { expect, it } from 'vitest'
import { A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { scoreLayoutConfig } from './score-layout-config.js'
import { scoreCoreGap, scoreVerticalSpacing, scoreVerticalCost, scoreRhythmicGapWeight } from './layout/policy.js'

it('preserves the configured staff space and physical print readability', () => {
  const staffHeight = scoreLayoutConfig.staff.music
  expect(staffHeight / 4).toBe(6.5)
  const widestAutomaticWidth = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.maximumMultiple
  expect(staffHeight / 4 * A4_CONTENT_WIDTH_MM / widestAutomaticWidth).toBeGreaterThanOrEqual(1.6)
})
it('derives vertical comfort bounds from each notation minimum independently', () => {
  expect(scoreCoreGap()).toBeCloseTo(28.8)
  expect(scoreCoreGap('staff')).toBeCloseTo(26)
  for (const notation of ['numbered', 'staff'] as const) {
    const spacing = scoreVerticalSpacing(notation)
    expect(spacing.minimum / scoreLayoutConfig[notation].music).toBeCloseTo(.8)
    expect(spacing.comfortable).toBeCloseTo(spacing.minimum * 1.5)
    expect(spacing.maximum).toBeCloseTo(spacing.minimum * 2)
    expect(scoreVerticalCost(spacing.minimum, spacing)).toBeCloseTo(1)
    expect(scoreVerticalCost(spacing.comfortable, spacing)).toBe(0)
    expect(scoreVerticalCost(spacing.maximum, spacing)).toBe(0)
  }
})

it('gives onset duration the larger share while keeping equal durations and controls stable', () => {
  expect(scoreRhythmicGapWeight(1, 1)).toBe(1)
  expect(scoreRhythmicGapWeight(undefined, undefined)).toBe(1)
  expect(scoreRhythmicGapWeight(0, 0)).toBe(1)
  expect(scoreRhythmicGapWeight(.5, .5, .5)).toBeCloseTo(Math.sqrt(.5) * .5)
  expect(scoreRhythmicGapWeight(.5, .5, .75)).toBeCloseTo(Math.sqrt(.5) * .75)
  expect(scoreRhythmicGapWeight(1.5, .5) / scoreRhythmicGapWeight(.5, 1.5)).toBeCloseTo(3 ** .25)
  expect(scoreRhythmicGapWeight(.5, 1)).toBeLessThan(scoreRhythmicGapWeight(1, .5))
})

it('supports equal duration shares for numbered spacing without changing staff defaults', () => {
  expect(scoreRhythmicGapWeight(1.5, .5, 1, .5)).toBeCloseTo(.75 ** .25)
  expect(scoreRhythmicGapWeight(.5, 1.5, 1, .5)).toBeCloseTo(.75 ** .25)
  expect(scoreRhythmicGapWeight(.5, .5, .75, .5)).toBeCloseTo(Math.sqrt(.5) * .75)
})

it('allows each notation to configure its own minimum while deriving the same comfort ratios', () => {
  const previous = scoreLayoutConfig.staff.minimumRowGapEm
  try {
    scoreLayoutConfig.staff.minimumRowGapEm = .9
    const staff = scoreVerticalSpacing('staff'), numbered = scoreVerticalSpacing()
    expect(staff.minimum).toBeCloseTo(scoreLayoutConfig.staff.music * .9)
    expect(staff.comfortable).toBeCloseTo(staff.minimum * 1.5)
    expect(staff.maximum).toBeCloseTo(staff.minimum * 2)
    expect(numbered.minimum).toBeCloseTo(scoreLayoutConfig.numbered.music * .8)
  } finally {
    scoreLayoutConfig.staff.minimumRowGapEm = previous
  }
})
