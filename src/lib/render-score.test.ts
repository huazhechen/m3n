import { describe, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { chooseNumberedScoreWidth, chooseStaffScoreWidth } from './render-score'

const { numberedQuality } = vi.hoisted(() => ({ numberedQuality: vi.fn() }))
const { staffPageCount } = vi.hoisted(() => ({ staffPageCount: vi.fn() }))
vi.mock('@m3n/score-renderer/staff', () => ({
  prepareStaffResources: vi.fn(),
  prepareStaffScore: async () => ({ pageCount: staffPageCount }),
}))
vi.mock('@m3n/numbered-notation', () => ({
  numberedLayoutQuality: numberedQuality,
}))

describe('numbered automatic width margins', () => {
  it.each([undefined, 0, 32])('uses the display margin %s for every layout pass', async margin => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width, pageMargin }) => ({ pageCount: width >= (pageMargin === 32 ? 610 : 590) ? 2 : 3, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true, pageMargin: margin })

    expect(selected).toBe(margin === 32 ? 610 : 590)
    expect(numberedQuality.mock.calls.every(([, options]) => options.pageMargin === (margin ?? 0))).toBe(true)
    expect(numberedQuality.mock.calls.every(([, options]) => options.paged === true)).toBe(true)
  })

  it('keeps the automatic width at least 540px when narrower layouts fit', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockReturnValue({ pageCount: 2, lineDensityVariation: 0, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(540)
    expect(numberedQuality.mock.calls.every(([, options]) => options.width >= 540 && options.width <= 640)).toBe(true)
  })

  it('prefers balanced three-row spacing over a short, uneven last row', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => width < 570
      ? { pageCount: 1, lineDensityVariation: 0.302, lastLineSlack: 0.424 }
      : width <= 580
        ? { pageCount: 1, lineDensityVariation: 0.125, lastLineSlack: 0 }
        : { pageCount: 1, lineDensityVariation: 0.099, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(570)
  })

  it('never trades a page for a higher balance score', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 600 ? 1 : 2, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(540)
  })

  it('chooses the minimum page count before comparing layout quality', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 570 ? 2 : 1, lineDensityVariation: width < 570 ? 0 : 0.8, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(570)
  })
})

describe('staff automatic width range', () => {
  it.each([510, 590, 640])('selects within 540–640px when the required width is %s', async requiredWidth => {
    staffPageCount.mockReset()
    staffPageCount.mockImplementation((_paged, width) => width >= requiredWidth ? 2 : 3)

    const selected = await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(Math.max(540, requiredWidth))
    expect(staffPageCount.mock.calls.every(([paged, width]) => paged && width >= 540 && width <= 640)).toBe(true)
  })
})
