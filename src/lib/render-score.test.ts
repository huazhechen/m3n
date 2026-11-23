import { describe, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { chooseNumberedScoreWidth, chooseStaffScoreWidth } from './render-score'

const { pageCount } = vi.hoisted(() => ({ pageCount: vi.fn() }))
const { staffPageCount } = vi.hoisted(() => ({ staffPageCount: vi.fn() }))
vi.mock('@m3n/score-renderer/staff', () => ({
  prepareStaffResources: vi.fn(),
  prepareStaffScore: async () => ({ pageCount: staffPageCount }),
}))
vi.mock('@m3n/numbered-notation', () => ({
  NumberedNotationScore: { create: () => ({ pageCount }) },
}))

describe('numbered automatic width margins', () => {
  it.each([undefined, 0, 32])('uses the display margin %s for every layout pass', async margin => {
    pageCount.mockReset()
    pageCount.mockImplementation(({ width, pageMargin }) => width >= (pageMargin === 32 ? 610 : 590) ? 2 : 3)

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true, pageMargin: margin })

    expect(selected).toBe(margin === 32 ? 610 : 590)
    expect(pageCount.mock.calls.every(([options]) => options.pageMargin === (margin ?? 0))).toBe(true)
    expect(pageCount.mock.calls.some(([options]) => options.minimumNoteGapEm === 0.4)).toBe(true)
    expect(pageCount.mock.calls.some(([options]) => options.width === selected && options.minimumNoteGapEm === undefined)).toBe(true)
  })

  it('keeps the automatic width at least 540px when narrower layouts fit', async () => {
    pageCount.mockReset()
    pageCount.mockImplementation(({ width }) => width >= 510 ? 2 : 3)

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(540)
    expect(pageCount.mock.calls.every(([options]) => options.width >= 540 && options.width <= 640)).toBe(true)
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
