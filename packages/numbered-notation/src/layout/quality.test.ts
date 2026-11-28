import { expect, it } from 'vitest'
import { scoreLayoutConfig } from '../score-layout-config.js'
import { scoreVerticalSpacing, scoreVerticalCost } from './policy.js'
import { scoreNumberedSpacing } from './quality.js'

it('keeps staff comfort independent of its highest minimum-gap tier', () => {
  const staff = scoreLayoutConfig.staff
  expect(staff.noteGapCandidates.map(gap => gap * staff.space)).toEqual([6, 12, 18])
  expect(staff.horizontalComfort).toEqual({ minimum: 12, maximum: 24 })
  for (const gap of [12, 18, 24]) {
    expect(scoreNumberedSpacing([gap], 18, 6, [gap], staff.horizontalComfort).spacingCost).toBe(0)
  }
  expect(scoreNumberedSpacing([6], 18, 6, [6], staff.horizontalComfort).spacingCrampedCost).toBe(1)
  expect(scoreNumberedSpacing([30], 18, 6, [30], staff.horizontalComfort).spacingExpandedCost).toBe(.0625)
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
