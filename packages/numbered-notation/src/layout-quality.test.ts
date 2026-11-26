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

it('keeps stretch in the break diagnostics without defining the final spacing cost', async () => {
  const { scoreNumberedCost } = await import('./layout-quality.js')
  const cost = scoreNumberedCost(528, [.5, .75])
  expect(cost.lineStretchCost).toBeCloseTo(.3125)
  expect(cost.lineUniformityCost).toBeCloseTo(.03125)
  expect(cost.layoutCost).toBeCloseTo(.34375)
  expect(scoreNumberedCost(768, [.5, .75]).fontSizeCost).toBe(3)
  expect(scoreNumberedCost(528, [.5, .75, .5, .75]).layoutCost).toBeCloseTo(cost.layoutCost * 2)
})

it('balances common physical spaciousness against relative unevenness', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout-quality.js')
  expect(cost([12, 12]).spacingCost).toBeCloseTo(1.7777777778)
  expect(cost([16, 16]).spacingCost).toBe(1)
  expect(cost([12, 20]).spacingUnevenCost).toBe(.0625)
  expect(cost([12, 20]).spacingCost).toBeLessThan(cost([15, 15]).spacingCost)
  expect(cost([8, 24]).spacingCost).toBeGreaterThan(cost([15, 15]).spacingCost)
  expect(cost([16, 16, 16, 16]).spacingCost).toBe(cost([16, 16]).spacingCost)
  expect(cost([]).spacingCost).toBe(0)
})

it('calibrates font loss at the readable and small-font ends of the search range', async () => {
  const { scoreNumberedFontCost: cost } = await import('./layout-quality.js')
  expect(cost(528)).toBe(0)
  expect(cost(552)).toBeCloseTo(.03)
  expect(cost(744)).toBeCloseTo(2.43)
  expect(cost(768)).toBe(3)
  expect(cost(552) - cost(528)).toBeLessThan(.2 ** 2)
  expect(cost(768) - cost(744)).toBeCloseTo(.57)
})
