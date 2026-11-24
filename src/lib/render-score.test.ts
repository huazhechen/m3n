import { describe, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { chooseNumberedScoreWidth, chooseStaffScoreWidth } from './render-score'

const { numberedQuality } = vi.hoisted(() => ({ numberedQuality: vi.fn() }))
const { staffPageCount, staffLayoutInfo } = vi.hoisted(() => ({ staffPageCount: vi.fn(), staffLayoutInfo: vi.fn() }))
vi.mock('@m3n/score-renderer/staff', () => ({
  prepareStaffResources: vi.fn(),
  prepareStaffScore: async () => ({ pageCount: staffPageCount, layoutInfo: staffLayoutInfo }),
}))
vi.mock('@m3n/numbered-notation', () => ({ prepareNumberedNotationFonts: vi.fn(), NumberedTextMeasurementCache: class {} }))
vi.mock('../../tools/lib/numbered-width-measurement.mjs', () => ({
  measureNumberedWidth: (document: ScoreDocument, width: number, { settings }: { settings: Record<string, unknown> }) => {
    const quality = numberedQuality(document, { ...settings, width, paged: true, pageMargin: settings.pageMargin ?? 0 })
    return { candidate: { width, ...quality, rows: 1, outside: [], overlaps: [] } }
  },
}))
vi.mock('../../tools/lib/staff-width-measurement.mjs', () => ({
  measureStaffWidth: async (_document: ScoreDocument, width: number) => {
    const info = staffLayoutInfo(width)
    const densities = info.lines.map((line: { minimum: number }) => line.minimum / info.availableWidth)
    const mean = densities.reduce((a: number, b: number) => a + b, 0) / densities.length
    const lineDensityVariation = Math.sqrt(densities.reduce((sum: number, density: number) => sum + (density - mean) ** 2, 0) / densities.length) / mean
    return { width, pageCount: staffPageCount(true, width), rows: info.lines.length, outside: [], overlaps: [], lineDensityVariation,
      lastLineSlack: 1 - info.lines.at(-1).target / info.availableWidth }
  },
}))

describe('numbered automatic width margins', () => {
  it.each([undefined, 0, 32])('uses the display margin %s for every layout pass', async margin => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width, pageMargin }) => ({ pageCount: width >= (pageMargin === 32 ? 620 : 600) ? 2 : 3, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true, pageMargin: margin })

    expect(selected).toBe(margin === 32 ? 620 : 600)
    expect(numberedQuality.mock.calls.every(([, options]) => options.pageMargin === (margin ?? 0))).toBe(true)
    expect(numberedQuality.mock.calls.every(([, options]) => options.paged === true)).toBe(true)
    expect(new Set(numberedQuality.mock.calls.map(([, options]) => options.textMeasurementCache)).size).toBe(1)
  })

  it('keeps the automatic width at least 480px when narrower layouts fit', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockReturnValue({ pageCount: 2, lineDensityVariation: 0, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(480)
    expect(numberedQuality.mock.calls.every(([, options]) => options.width >= 480 && options.width <= 720)).toBe(true)
  })

  it('prefers balanced three-row spacing over a short, uneven last row', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => width < 570
      ? { pageCount: 1, lineDensityVariation: 0.302, lastLineSlack: 0.424 }
      : width <= 580
        ? { pageCount: 1, lineDensityVariation: 0.125, lastLineSlack: 0 }
        : { pageCount: 1, lineDensityVariation: 0.099, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(580)
  })

  it('never trades a page for a higher balance score', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 600 ? 1 : 2, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(480)
  })

  it('chooses the minimum page count before comparing layout quality', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 570 ? 2 : 1, lineDensityVariation: width < 570 ? 0 : 0.8, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(580)
  })
})

describe('staff automatic width range', () => {
  it.each([510, 590, 640])('selects within 480–720px when the required width is %s', async requiredWidth => {
    staffPageCount.mockReset()
    staffPageCount.mockImplementation((_paged, width) => width >= requiredWidth ? 2 : 3)
    staffLayoutInfo.mockImplementation(width => ({ pageCount: width >= requiredWidth ? 2 : 3, availableWidth: width,
      lines: [{ minimum: width * 0.6, target: width }, { minimum: width * 0.7, target: width }] }))

    const selected = await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(Math.max(480, Math.ceil(requiredWidth / 20) * 20))
    expect(staffPageCount.mock.calls.every(([paged, width]) => paged && width >= 480 && width <= 720)).toBe(true)
  })

  it('uses the same font-size and line-balance score as numbered notation', async () => {
    staffPageCount.mockReset(); staffLayoutInfo.mockReset()
    staffPageCount.mockReturnValue(1)
    staffLayoutInfo.mockImplementation(width => ({ pageCount: 1, availableWidth: width,
      lines: width < 570
        ? [{ minimum: width * 0.88, target: width }, { minimum: width * 0.69, target: width }, { minimum: width * 0.4, target: width * 0.58 }]
        : width < 590
          ? [{ minimum: width * 0.55, target: width }, { minimum: width * 0.73, target: width }, { minimum: width * 0.59, target: width }]
          : [{ minimum: width * 0.99, target: width }, { minimum: width * 0.81, target: width }],
    }))
    expect(await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })).toBe(580)
  })
})
