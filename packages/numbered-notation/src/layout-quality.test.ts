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
  expect(scoreNumberedCost(720, [.5, .75]).fontSizeCost).toBe(4)
  expect(scoreNumberedCost(528, [.5, .75, .5, .75]).layoutCost).toBeCloseTo(cost.layoutCost * 2)
})

it('has zero crowding and expansion cost in the comfort band while retaining uniformity', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  for (const gaps of [[16], [24], [16, 20, 24], [16, 16, 24, 24]]) {
    expect(cost(gaps).spacingCrampedCost).toBe(0)
    expect(cost(gaps).spacingExpandedCost).toBe(0)
    expect(cost(gaps).spacingCost).toBe(cost(gaps).spacingUnevenCost)
  }
  expect(cost([16, 24]).spacingUnevenCost).toBeGreaterThan(0)
  expect(cost([]).spacingCost).toBe(0)
})

it('scores individual gaps before averaging and includes comfortable gaps in the denominator', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  // Their mean is comfortable, but neither interval is.
  expect(cost([8, 40]).meanRhythmicGap).toBe(24)
  expect(cost([8, 40]).spacingCrampedCost).toBeCloseTo(1 / 2)
  expect(cost([8, 40]).spacingExpandedCost).toBeCloseTo((40 / 24 - 1) ** 2 / 2)
  expect(cost([8, 16, 20, 24]).spacingCrampedCost).toBeCloseTo(1 / 4)
  expect(cost([12, 16, 24, 48]).spacingExpandedCost).toBeCloseTo(1 / 4)
  const gaps = [8, 48, 16, 24]
  expect(cost(gaps).spacingCost - cost(gaps).spacingUnevenCost).toBeCloseTo(1.25)
  expect(cost([...gaps, ...gaps]).spacingCost).toBeCloseTo(cost(gaps).spacingCost)
})

it('calibrates font loss at the readable and small-font ends of the search range', async () => {
  const { scoreNumberedFontCost: cost } = await import('./layout/quality.js')
  expect(cost(528)).toBe(0)
  expect(cost(552)).toBeCloseTo(.0625)
  expect(cost(696)).toBeCloseTo(3.0625)
  expect(cost(720)).toBe(4)
  expect(cost(552) - cost(528)).toBeLessThan(.3 ** 2)
  expect(cost(720) - cost(696)).toBeCloseTo(.9375)
})

it('uses normalized variance without an extra worst-row penalty', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  const few = cost([16, 16, 16, 32])
  expect(few.spacingMeanUnevenCost).toBeCloseTo(.12)
  expect(few.spacingUnevenCost).toBeCloseTo(.12)
  expect(cost([16, 16, 16, 32, 16, 16, 16, 32]).spacingUnevenCost).toBeCloseTo(.12)
  const many = cost([...Array<number>(19).fill(16), 32])
  expect(many.spacingUnevenCost).toBeCloseTo(19 / 441)
  expect(many.spacingUnevenCost).toBe(many.spacingMeanUnevenCost)
})

it('uses the same comfort rules at each notation scale and both endpoints', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  expect(cost([16, 24]).spacingCrampedCost + cost([16, 24]).spacingExpandedCost).toBe(0)
  expect(cost([15.99]).spacingCrampedCost).toBeGreaterThan(0)
  expect(cost([24.01]).spacingExpandedCost).toBeGreaterThan(0)
  expect(cost([8.4, 10.5, 12.6], 8.4).spacingCost).toBeCloseTo(cost([16, 20, 24]).spacingCost)
  expect(cost([6, 48]).spacingCost).toBeCloseTo(cost([3.15, 25.2], 8.4).spacingCost)
  expect(cost([16, 20], 16, 4).spacingCost).toBe(cost([16, 20], 16, 4).spacingUnevenCost)
})

it('derives the default comfort band from the configured loosest tier', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  const { scoreLayoutConfig } = await import('./score-layout-config.js')
  const saved = scoreLayoutConfig.numbered.noteGapCandidates
  try {
    scoreLayoutConfig.numbered.noteGapCandidates = [8, 12, 20]
    expect(cost([20, 30]).spacingCrampedCost).toBe(0)
    expect(cost([20, 30]).spacingExpandedCost).toBe(0)
    expect(cost([19.99]).spacingCrampedCost).toBeGreaterThan(0)
    expect(cost([30.01]).spacingExpandedCost).toBeGreaterThan(0)
  } finally {
    scoreLayoutConfig.numbered.noteGapCandidates = saved
  }
})

it('does not trade an isolated stretched tail for a marginally larger font', async () => {
  const { scoreNumberedSpacing: cost, scoreNumberedFontCost: font } = await import('./layout/quality.js')
  const ordinary = Array<number>(1100).fill(18)
  const isolated = cost([...ordinary, ...Array<number>(12).fill(120)])
  const balanced = cost([...ordinary, ...Array<number>(12).fill(42)])
  expect(isolated.spacingExpandedCost).toBeGreaterThan(balanced.spacingExpandedCost)
  expect(isolated.spacingUnevenCost).toBeGreaterThan(balanced.spacingUnevenCost)
  // Averaged expansion alone would choose the isolated row for its font gain.
  expect(isolated.spacingExpandedCost + font(738)).toBeLessThan(balanced.spacingExpandedCost + font(744))
  expect(balanced.spacingCost + font(744)).toBeLessThan(isolated.spacingCost + font(738))
})

it('compares row uniformity separately from individual interval comfort', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  const gaps = [8, 16, 24, 48]
  const balanced = cost(gaps, 16, 8, [18, 18])
  const uneven = cost(gaps, 16, 8, [12, 24])
  expect(balanced.spacingUnevenCost).toBe(0)
  expect(uneven.spacingUnevenCost).toBeGreaterThan(0)
  expect(balanced.spacingCrampedCost).toBeCloseTo(.25)
  expect(balanced.spacingExpandedCost).toBeCloseTo(.25)
  expect(uneven.spacingCrampedCost).toBe(balanced.spacingCrampedCost)
  expect(uneven.spacingExpandedCost).toBe(balanced.spacingExpandedCost)
  expect(cost(gaps, 16, 8, []).spacingUnevenCost).toBe(0)
})

it('prefers comfortable spacing over uniformly crowded rows at both notation scales', async () => {
  const { scoreNumberedSpacing: cost } = await import('./layout/quality.js')
  for (const scale of [1, .65]) {
    const crowded = cost([12 * scale], 16 * scale, 8 * scale, [12 * scale, 12 * scale])
    const comfortable = cost([16 * scale, 20 * scale], 16 * scale, 8 * scale, [12 * scale, 28 * scale])
    expect(crowded.spacingCrampedCost).toBeCloseTo(1 / 9)
    expect(crowded.spacingCost).toBeCloseTo(4 / 9)
    expect(comfortable.spacingCost).toBeCloseTo(.16)
    expect(crowded.spacingCost).toBeGreaterThan(comfortable.spacingCost)
  }
})
