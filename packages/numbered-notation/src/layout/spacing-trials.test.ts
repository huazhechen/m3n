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

it('derives a page ceiling only from a losing combined lower bound including tie order', async () => {
  const { scoreSpacingTrialPageCeiling } = await import('./spacing-trials.js')
  for (const cost of [0, .1, 1, 3]) for (const spacing of [.8, 1.2, 1.6])
    for (const pages of [1, 2, 3, 6]) for (const incumbentCost of [0, .5, 2.1]) for (const incumbentSpacing of [.8, 1.2, 1.6]) {
      const incumbent = { pages, cost: incumbentCost, spacing: incumbentSpacing }
      const ceiling = scoreSpacingTrialPageCeiling(cost, spacing, incumbent, 12)
      for (let candidatePages = 1; candidatePages <= 12; candidatePages++)
        if (ceiling !== undefined && candidatePages > ceiling)
          for (const vertical of [0, .2, 1]) expect(compare({ pages: candidatePages, cost: cost + vertical, spacing }, incumbent)).toBeGreaterThanOrEqual(0)
    }
})

it('keeps affordable extra pages and narrower score ties under exact global bounds', async () => {
  const { scoreWidthCandidateCanWin, scoreWidthCandidatePageCeiling } = await import('./spacing-trials.js')
  const { scorePageCost } = await import('./quality.js')
  const bound = { width: 600, quality: 1 / (1 + 2.1) }
  expect(scoreWidthCandidateCanWin(606, 0, 2, bound)).toBe(true)
  const tie = { width: 600, quality: 1 / (1 + .25 + scorePageCost(2)) }
  expect(scoreWidthCandidateCanWin(594, .25, 2, tie)).toBe(true)
  expect(scoreWidthCandidateCanWin(606, .25, 2, tie)).toBe(false)
  // A roundoff-level difference is never sufficient to omit geometry.
  expect(scoreWidthCandidatePageCeiling(606, .25, 2, tie)).toBeUndefined()
  for (const width of [528, 600, 720]) for (const cost of [0, .1, .5, 2, 5])
    for (const pages of [1, 2, 4]) for (const incumbentCost of [0, .2, 3]) {
      const incumbent = { width: 600, quality: 1 / (1 + incumbentCost + scorePageCost(pages)) }
      const ceiling = scoreWidthCandidatePageCeiling(width, cost, 12, incumbent)
      if (ceiling !== undefined) for (let page = ceiling + 1; page <= 12; page++)
        for (const vertical of [0, .1, 1]) expect(scoreWidthCandidateCanWin(width, cost + vertical, page, incumbent)).toBe(false)
    }
})
