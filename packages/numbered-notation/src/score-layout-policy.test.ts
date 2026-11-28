import { expect, it } from 'vitest'
import { A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { scoreLayoutConfig } from './score-layout-config.js'
import { scoreCoreGap, scoreMaximumCoreGap, scoreRhythmicGapWeight } from './layout/policy.js'

it('preserves the configured staff space and physical print readability', () => {
  const staffHeight = scoreLayoutConfig.staff.music
  expect(staffHeight / 4).toBe(6.5)
  const widestAutomaticWidth = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.maximumMultiple
  expect(staffHeight / 4 * A4_CONTENT_WIDTH_MM / widestAutomaticWidth).toBeGreaterThanOrEqual(1.6)
})
it('applies dimensionless leading to each notation base and preserves its stretch ceiling', () => {
  expect(scoreCoreGap()).toBeCloseTo(28.8)
  expect(scoreCoreGap({ coreGapEm: .8 })).toBeCloseTo(23.04)
  expect(scoreMaximumCoreGap(scoreCoreGap({ coreGapEm: .8 }))).toBeCloseTo(25.344)
  expect(scoreMaximumCoreGap(scoreCoreGap({ coreGapEm: 2 }))).toBeCloseTo(63.36)
  expect(scoreCoreGap(undefined, 'staff')).toBeCloseTo(26)
  expect(scoreCoreGap({ coreGapEm: .8 }, 'staff')).toBeCloseTo(20.8)
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
