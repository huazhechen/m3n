import { describe, expect, it } from 'vitest' 
import { a4ImagePlacement, a4SourcePageHeight } from './score-export'

describe('PDF export pagination', () => {
  it('keeps the A4 content ratio at every configured source width', () => {
    expect(a4SourcePageHeight(800)).toBe(1174)
    expect(a4SourcePageHeight(1600)).toBe(2348)
  })

  it('fits a rendered page inside the A4 margins without changing its ratio', () => {
    const placement = a4ImagePlacement(800, 1300)

    expect(placement.y).toBe(12)
    expect(placement.height).toBe(273)
    expect(placement.width / placement.height).toBeCloseTo(800 / 1300)
    expect(placement.x).toBeGreaterThan(12)
    expect(placement.x + placement.width).toBeLessThan(198)
  })

  it('uses the full A4 content width for a correctly reserved page', () => {
    const placement = a4ImagePlacement(800, a4SourcePageHeight(800))

    expect(placement.x).toBeCloseTo(12)
    expect(placement.y).toBe(12)
    expect(placement.width).toBeCloseTo(186)
  })
})
