import { expect, it } from 'vitest'
import { scoreLayoutConfig } from '../score-layout-config.js'
import { scoreVerticalSpacing, scoreVerticalCost } from './policy.js'
import { scoreNumberedSpacing } from './quality.js'

it('derives staff comfort from its highest minimum-gap tier', () => {
  const staff = scoreLayoutConfig.staff
  expect(staff.noteGapCandidates.map(gap => gap * staff.space)).toEqual([6, 12, 18])
  expect(staff.horizontalComfort).toEqual({ minimum: 18, maximum: 27 })
  for (const gap of [18, 22.5, 27]) {
    expect(scoreNumberedSpacing([gap], 18, 6, [gap], staff.horizontalComfort).spacingCost).toBe(0)
  }
  expect(scoreNumberedSpacing([6], 18, 6, [6], staff.horizontalComfort).spacingCrampedCost).toBe(4)
  expect(scoreNumberedSpacing([30], 18, 6, [30], staff.horizontalComfort).spacingExpandedCost).toBeCloseTo((30 / 27 - 1) ** 2)
  expect(scoreNumberedSpacing([12]).spacingCrampedCost).toBeGreaterThan(0)
})

it('uses staff S for vertical spacing while numbered retains M', () => {
  expect(scoreVerticalSpacing('staff')).toEqual({ minimum: 15, comfortable: 22.5, maximum: 30 })
  expect(scoreVerticalSpacing('numbered')).toEqual({ minimum: 18, comfortable: 27, maximum: 36 })
  const spacing = scoreVerticalSpacing('staff')
  expect(scoreVerticalCost(15, spacing)).toBe(1)
  expect(scoreVerticalCost(22.5, spacing)).toBe(0)
  expect(scoreVerticalCost(30, spacing)).toBe(0)
})
