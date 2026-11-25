import { expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { measureNumberedWidth } from '../../tools/lib/numbered-width-measurement.mjs'
const mocks = vi.hoisted(() => ({ layout: vi.fn(), render: vi.fn(), inspect: vi.fn(), height: vi.fn() }))
vi.mock('@m3n/numbered-notation', () => ({
  PreparedNumberedNotationScore: class {
    pageCount = 1
    systemCount = 12
    quality = { lineDensityVariation: .1, lastLineSlack: .2 }
    continuousHeight = mocks.height
    renderPaged = mocks.render
    renderContinuous = mocks.render
    constructor(...args: unknown[]) { mocks.layout(...args) }
  },
}))
vi.mock('../../tools/lib/score-geometry.mjs', () => ({ inspectScorePages: mocks.inspect }))

it('production selection runs the layout while skipping SVG generation, DOM mounting and independent audits', () => {
  expect(typeof document).toBe('undefined')
  mocks.height.mockReturnValue(666)
  const score = {} as ScoreDocument
  const { candidate } = measureNumberedWidth(score, 560)
  expect(mocks.layout).toHaveBeenCalledExactlyOnceWith(score, { width: 560, pageMargin: 0 }, expect.any(Object))
  expect(candidate).toMatchObject({ width: 560, pageCount: 1, rows: 12, naturalHeight: 666 })
  expect(candidate.qualityScore).toBeCloseTo((576 / 560) ** 2 / 1.2)
  expect(mocks.render).not.toHaveBeenCalled()
  expect(mocks.inspect).not.toHaveBeenCalled()
  expect(candidate.timings).not.toHaveProperty('svgRenderMs')
  expect(candidate.timings).not.toHaveProperty('inkBoundsMs')
  expect(candidate.timings).not.toHaveProperty('collisionsMs')
})
