import { describe, expect, it } from 'vitest'
import { lastLineWidth } from './last-line-width.js'

describe('section-ending justification', () => {
  it('keeps trials up to 50% open, including the boundary', () => {
    expect(lastLineWidth(100, 400, 1000)).toBe(400)
    expect(lastLineWidth(100, 500, 1000)).toBe(500)
  })

  it('fills trials from 80% onward, including overflow', () => {
    expect(lastLineWidth(100, 800, 1000)).toBe(1000)
    expect(lastLineWidth(100, 990, 1000)).toBe(1000)
    expect(lastLineWidth(100, 1200, 1000)).toBe(1000)
  })

  it('uses preceding stretch in the middle band rather than a fixed cutoff', () => {
    // Same 70% occupancy: the required stretch is 1.5x versus 2x.
    expect(lastLineWidth(100, 700, 1000)).toBe(1000)
    expect(lastLineWidth(400, 700, 1000)).toBe(700)
    expect(lastLineWidth(100, 699.99, 1000)).toBe(699.99)
  })

  it('does not invent inherited stretch or shrink hard minima', () => {
    expect(lastLineWidth(650, 650, 1000)).toBe(650)
    expect(lastLineWidth(1100, 1200, 1000)).toBe(1100)
  })

  it('compares equal-cell widths independently of their ink minima', () => {
    expect(lastLineWidth(600, 700, 1000, 0)).toBe(1000)
    expect(lastLineWidth(550, 600, 1000, 0)).toBe(600)
  })
})
