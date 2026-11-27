import { expect, it } from 'vitest'
import { scoreHorizontalQuality, scoreLineQuality } from './layout/quality.js'

it('distinguishes uniformly loose lines from equally uniform readable lines', () => {
  const loose = scoreLineQuality([.4, .4, .4], 0)
  const compact = scoreLineQuality([.8, .8, .8], 0)
  expect(loose.lineDensityVariation).toBeCloseTo(0)
  expect(compact.lineDensityVariation).toBeCloseTo(0)
  expect(scoreHorizontalQuality(640, compact)).toBeGreaterThan(scoreHorizontalQuality(640, loose))
})
it('does not confuse a deliberate short ending with excessive rhythmic stretching', () => {
  expect(scoreLineQuality([.8, .8, .4], .5).lineStretchPenalty).toBe(0)
  expect(scoreLineQuality([.8, .8, .4], 0).lineStretchPenalty).toBeGreaterThan(0)
  expect(scoreLineQuality([.2], 0).lineStretchPenalty).toBe(0)
})

it('keeps stretch in the break diagnostics without defining the final spacing cost', async () => {
  const { scoreNumberedCost } = await import('./layout/quality.js')
  const cost = scoreNumberedCost(528, [.5, .75])
  expect(cost.lineStretchCost).toBeCloseTo(.3125)
  expect(cost.lineUniformityCost).toBeCloseTo(.03125)
  expect(cost.layoutCost).toBeCloseTo(.34375)
  expect(scoreNumberedCost(768, [.5, .75]).fontSizeCost).toBe(4)
  expect(scoreNumberedCost(528, [.5, .75, .5, .75]).layoutCost).toBeCloseTo(cost.layoutCost * 2)
})

it('has zero spacing cost throughout the comfort band, independently of uniformity', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  for (const gaps of [[12], [24], [12, 16, 24], [12, 12, 24, 24]])
    expect(cost(gaps).spacingCost).toBe(0)
  expect(cost([12, 24]).spacingUnevenCost).toBeGreaterThan(0)
  expect(cost([]).spacingCost).toBe(0)
})

it('scores individual gaps before averaging and includes comfortable gaps in the denominator', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  // Their mean is comfortable, but neither interval is.
  expect(cost([8, 40]).meanRhythmicGap).toBe(24)
  expect(cost([8, 40]).spacingCrampedCost).toBeCloseTo(.25 / 2)
  expect(cost([8, 40]).spacingExpandedCost).toBeCloseTo((40 / 24 - 1) ** 2 / 2)
  expect(cost([6, 12, 16, 24]).spacingCrampedCost).toBeCloseTo(1 / 4)
  expect(cost([12, 16, 24, 48]).spacingExpandedCost).toBeCloseTo(1 / 4)
  expect(cost([6, 48, 12, 24]).spacingCost).toBeCloseTo(.5)
  expect(cost([6, 48, 12, 24, 6, 48, 12, 24]).spacingCost).toBeCloseTo(.5)
})

it('calibrates font loss at the readable and small-font ends of the search range', async () => {
  const { scoreNumberedFontCost: cost } = await import('./layout/quality.js')
  expect(cost(528)).toBe(0)
  expect(cost(552)).toBeCloseTo(.04)
  expect(cost(744)).toBeCloseTo(3.24)
  expect(cost(768)).toBe(4)
  expect(cost(552) - cost(528)).toBeLessThan(.3 ** 2)
  expect(cost(768) - cost(744)).toBeCloseTo(.76)
})

it('keeps an exceptional row visible instead of averaging its unevenness away', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  const few = cost([16, 16, 16, 32])
  expect(few.spacingMeanUnevenCost).toBeCloseTo(.12)
  expect(few.spacingWorstUnevenCost).toBeCloseTo(.36)
  expect(few.spacingUnevenCost).toBeCloseTo(.48)
  const many = cost([...Array<number>(19).fill(16), 32])
  expect(many.spacingWorstUnevenCost).toBeGreaterThan(.8)
  expect(many.spacingUnevenCost).toBeGreaterThan(many.spacingMeanUnevenCost * 10)
})

it('uses the same comfort rules at each notation scale and both endpoints', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  expect(cost([12, 24]).spacingCost).toBe(0)
  expect(cost([11.99]).spacingCrampedCost).toBeGreaterThan(0)
  expect(cost([24.01]).spacingExpandedCost).toBeGreaterThan(0)
  expect(cost([6.3, 8.4, 12.6], 8.4).spacingCost).toBeCloseTo(0)
  expect(cost([6, 48]).spacingCost).toBeCloseTo(cost([3.15, 25.2], 8.4).spacingCost)
  expect(cost([10, 20], 16, 4).spacingCost).toBe(0)
})
