import { expect, it } from 'vitest'
import { compareScoreSpacingTrials as compare } from './spacing-trials.js'

it('prioritizes pages over cost and cost over the looser spacing tier', () => {
  expect(compare({ pages: 1, cost: 100, spacing: 8 }, { pages: 2, cost: 0, spacing: 16 })).toBeLessThan(0)
  expect(compare({ pages: 1, cost: 1, spacing: 8 }, { pages: 1, cost: 2, spacing: 16 })).toBeLessThan(0)
  expect(compare({ pages: 1, cost: 1, spacing: 16 }, { pages: 1, cost: 1, spacing: 8 })).toBeLessThan(0)
})

it('retains deterministic ordering for infeasible and exactly tied trials', () => {
  const rejected = { pages: Infinity, cost: 1, spacing: 8 }
  expect(compare({ pages: 2, cost: 100, spacing: 8 }, rejected)).toBeLessThan(0)
  expect(compare(rejected, { ...rejected, spacing: 16 })).toBeGreaterThan(0)
  expect(compare(rejected, rejected)).toBe(0)
})
