import { describe, expect, it } from 'vitest'
import { solveElasticSprings, spacingStrainBadness } from './elastic-spacing.js'
import { scoreNaturalAdvance, scoreSpacingBasis } from './score-layout-policy.js'

describe('line strain against available compression travel', () => {
  it('rejects a line below the minimum and prices the fraction of available travel', () => {
    expect(spacingStrainBadness(8, 16, 7.99)).toBe(Infinity)
    expect(spacingStrainBadness(8, 16, 8)).toBe(1)
    expect(spacingStrainBadness(8, 16, 12)).toBe(.25)
    expect(spacingStrainBadness(8, 16, 16)).toBe(0)
    expect(spacingStrainBadness(8, 16, 20)).toBe(.25)
    expect(spacingStrainBadness(8, 16, 160)).toBeGreaterThan(1)
  })
  it('does not dilute compression cost with rigid ink or engraving scale', () => {
    expect(spacingStrainBadness(108, 116, 112)).toBe(.25)
    expect(spacingStrainBadness(80, 160, 120)).toBe(.25)
  })
})

describe('one strain curve with separate compression and stretch scales', () => {
  const policy = { stretchTravelRatio: .5 }
  it.each([[8, 1], [12, .25], [14, .0625], [16, 0], [18, .25], [20, 1], [24, 4]])(
    'prices a %spx clearance as %s at natural 16px and minimum 8px', (width, expected) => {
      expect(spacingStrainBadness(8, 16, width, policy)).toBe(expected)
    })
  it('keeps the hard minimum and continuously increases costs in both directions', () => {
    expect(spacingStrainBadness(8, 16, 7.99, policy)).toBe(Infinity)
    for (let i = 1; i <= 80; i++) {
      expect(spacingStrainBadness(8, 16, 16 - i / 10, policy)).toBeGreaterThan(spacingStrainBadness(8, 16, 16 - (i - 1) / 10, policy))
      expect(spacingStrainBadness(8, 16, 16 + i / 10, policy)).toBeGreaterThan(spacingStrainBadness(8, 16, 16 + (i - 1) / 10, policy))
    }
    expect(spacingStrainBadness(8, 16, 160, policy)).toBeGreaterThan(1)
  })
  it('excludes rigid ink, respects engraving scale and handles rows without elastic travel', () => {
    expect(spacingStrainBadness(108, 116, 112, policy)).toBe(.25)
    expect(spacingStrainBadness(80, 160, 120, policy)).toBe(.25)
    expect(spacingStrainBadness(108, 116, 120, policy)).toBe(1)
    expect(spacingStrainBadness(80, 160, 200, policy)).toBe(1)
    expect(spacingStrainBadness(16, 16, 16, policy)).toBe(0)
    expect(Number.isFinite(spacingStrainBadness(16, 16, 20, policy))).toBe(true)
  })
  it('rejects invalid stretch scales rather than introducing nonfinite planning costs', () => {
    for (const stretchTravelRatio of [0, -.5, NaN, Infinity]) expect(() => spacingStrainBadness(8, 16, 20, { stretchTravelRatio })).toThrow()
  })
})

describe('bidirectional spacing springs', () => {
  const springs = [{ minimum: 10, natural: 20, stretch: 1 }, { minimum: 15, natural: 35, stretch: 2 }]
  it.each([25, 35, 55, 85])('fits %s units while retaining collision limits', width => {
    const result = solveElasticSprings(springs, width)
    expect(result.lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(width, 10)
    result.lengths.forEach((length, index) => expect(length).toBeGreaterThanOrEqual(springs[index]!.minimum))
    expect(Math.sign(result.force)).toBe(Math.sign(width - 55))
  })
  it('returns natural lengths without force and preserves proportional stretch', () => {
    expect(solveElasticSprings(springs, 55).lengths).toEqual([20, 35])
    expect(solveElasticSprings(springs, 85).lengths).toEqual([30, 55])
  })
  it('locks compressed springs at their minima and reallocates remaining force', () => {
    const result = solveElasticSprings([
      { minimum: 9, natural: 10, stretch: 1, compress: 10 },
      { minimum: 5, natural: 20, stretch: 1, compress: 1 },
      { minimum: 7, natural: 7, stretch: 0, compress: 0 },
    ], 25)
    expect(result.lengths).toEqual([9, 9, 7])
    expect(result.force).toBe(-11)
  })
  it('keeps strain independent of engraving scale', () => {
    const small = [{ minimum: .1, natural: .2, stretch: .1 }, { minimum: .15, natural: .35, stretch: .2 }]
    const original = solveElasticSprings(small, .4)
    const scaled = solveElasticSprings(small.map(spring => ({ minimum: spring.minimum * 100,
      natural: spring.natural * 100, stretch: spring.stretch * 100 })), 40)
    expect(scaled.badness).toBeCloseTo(original.badness, 12)
    scaled.lengths.forEach((length, index) => expect(length).toBeCloseTo(original.lengths[index]! * 100, 10))
  })
  it('reports impossible widths through retained minima, without negative lengths', () => {
    expect(solveElasticSprings(springs, 1).lengths).toEqual([10, 15])
    expect(() => solveElasticSprings(springs, NaN)).toThrow()
    expect(() => solveElasticSprings([{ minimum: 5, natural: 2, stretch: 1 }], 10)).toThrow()
  })
})

describe('duration-based natural advances', () => {
  it('uses the common per-measure shortest duration with a maximum of an eighth', () => {
    expect(scoreSpacingBasis([[1, 2], [.5, 1], [.5, 2], [.125, 1]])).toBe(.5)
    expect(scoreSpacingBasis([[.25, 1], [.25, .5], [.5, 1]])).toBe(.25)
    expect(scoreSpacingBasis([[1, 2]])).toBe(.5)
    expect(scoreSpacingBasis([])).toBe(.5)
  })
  it('selects the same basis independently of measure order, including ties', () => {
    expect(scoreSpacingBasis([[.25], [.5]])).toBe(.25)
    expect(scoreSpacingBasis([[.5], [.25]])).toBe(.25)
  })
  it.each([[.125, 1.5], [.25, 1.8], [.5, 2.4], [1, 3.6], [2, 4.8], [4, 6]])('gives duration %s a natural advance of %s staff spaces', (duration, expected) => {
    expect(scoreNaturalAdvance(duration, .5, 1.2, 1.2)).toBeCloseTo(expected, 10)
  })
  it('retains actual glyph width and scales without pixel constants', () => {
    expect(scoreNaturalAdvance(.5, .5, 8.26, 8.4)).toBeCloseTo(16.66)
    expect(scoreNaturalAdvance(.5, .5, 16.52, 16.8)).toBeCloseTo(33.32)
  })
})
