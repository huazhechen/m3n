import { expect, it } from 'vitest'
import { A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { nativeBarMetrics } from './native-horizontal.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import { scoreCoreGap, scoreMaximumCoreGap } from './score-layout-policy.js'

it('calibrates staff height against the numbered bar frame without shrinking print readability', () => {
  const frame = nativeBarMetrics('single').size
  const staffHeight = scoreLayoutConfig.staff.music
  expect(Math.abs(staffHeight / frame - 1)).toBeLessThanOrEqual(.1)
  const widestAutomaticWidth = scoreLayoutConfig.pageWidth.unit * scoreLayoutConfig.pageWidth.maximumMultiple
  expect(staffHeight / 4 * A4_CONTENT_WIDTH_MM / widestAutomaticWidth).toBeGreaterThanOrEqual(1.6)
})
it('uses the same leading and proportional stretch ceiling regardless of music font em', () => {
  expect(scoreCoreGap()).toBeCloseTo(28.8)
  expect(scoreCoreGap({ coreGapEm: .8 })).toBeCloseTo(19.2)
  expect(scoreMaximumCoreGap(scoreCoreGap({ coreGapEm: .8 }))).toBeCloseTo(21.12)
  expect(scoreMaximumCoreGap(scoreCoreGap({ coreGapEm: 2 }))).toBeCloseTo(52.8)
})
