import { expect, it } from 'vitest'
import { scoreHorizontalQuality, scoreLineQuality } from './layout-quality.js'

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

it('adds full-score stretch dispersion and squared font loss for numbered width selection', async () => {
  const { scoreNumberedCost } = await import('./layout-quality.js')
  const cost = scoreNumberedCost(528, [.5, .75])
  expect(cost.lineStretchCost).toBeCloseTo(.3125)
  expect(cost.lineUniformityCost).toBeCloseTo(.03125)
  expect(cost.totalCost).toBeCloseTo(.34375)
  expect(scoreNumberedCost(1056, [.5, .75]).fontSizeCost).toBe(3)
  expect(scoreNumberedCost(528, [.5, .75, .5, .75]).totalCost).toBeCloseTo(cost.totalCost * 2)
})
