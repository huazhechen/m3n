import { describe, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { chooseNumberedScoreWidth } from './render-score'

const { pageCount } = vi.hoisted(() => ({ pageCount: vi.fn() }))
vi.mock('@m3n/numbered-notation', () => ({
  NumberedNotationScore: { create: () => ({ pageCount }) },
}))

describe('numbered automatic width margins', () => {
  it.each([undefined, 0, 32])('uses the display margin %s for every layout pass', async margin => {
    pageCount.mockReset()
    pageCount.mockImplementation(({ width, pageMargin }) => width >= (pageMargin === 32 ? 560 : 510) ? 2 : 3)

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true, pageMargin: margin })

    expect(selected).toBe(margin === 32 ? 560 : 510)
    expect(pageCount.mock.calls.every(([options]) => options.pageMargin === (margin ?? 0))).toBe(true)
    expect(pageCount.mock.calls.some(([options]) => options.minimumNoteGapEm === 0.4)).toBe(true)
    expect(pageCount.mock.calls.some(([options]) => options.width === selected && options.minimumNoteGapEm === undefined)).toBe(true)
  })
})
