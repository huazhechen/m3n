import { expect, it } from 'vitest'
import { compareScoreSpacingTrials as compare } from './spacing-trials.js'
import { scorePageCost } from './quality.js'

it('combines paper and spacing cost before the looser spacing tie breaker', () => {
  expect(compare({ pages: 1, cost: 100, spacing: 8 }, { pages: 2, cost: 0, spacing: 16 })).toBeGreaterThan(0)
  expect(compare({ pages: 1, cost: 1, spacing: 8 }, { pages: 1, cost: 2, spacing: 16 })).toBeLessThan(0)
  expect(compare({ pages: 1, cost: 1, spacing: 16 }, { pages: 1, cost: 1, spacing: 8 })).toBeLessThan(0)
})

it('retains deterministic ordering for infeasible and exactly tied trials', () => {
  const rejected = { pages: Infinity, cost: 1, spacing: 8 }
  expect(compare({ pages: 2, cost: 100, spacing: 8 }, rejected)).toBeLessThan(0)
  expect(compare(rejected, { ...rejected, spacing: 16 })).toBeGreaterThan(0)
  expect(compare(rejected, rejected)).toBe(0)
})

it('charges two for the first extra page with decreasing marginal cost', () => {
  expect(scorePageCost(1)).toBe(0)
  expect(scorePageCost(2)).toBeCloseTo(2)
  expect(scorePageCost(3) - scorePageCost(2)).toBeLessThan(2)
  expect(scorePageCost(4) - scorePageCost(3)).toBeLessThan(scorePageCost(3) - scorePageCost(2))
  expect(compare({pages:1,cost:1.9,spacing:8},{pages:2,cost:0,spacing:16})).toBeLessThan(0)
  expect(compare({pages:1,cost:2.1,spacing:8},{pages:2,cost:0,spacing:16})).toBeGreaterThan(0)
})
