import { describe, expect, it } from 'vitest'
import { paginateNativeBlocks } from './native-pagination.js'
import { layoutNativeScore } from './native-layout.js'
import { parseM3NDocument } from '@m3n/notation'
import { NativeNumberedNotationScore, renderSharedNumberedNotationScores } from './native-score.js'

const row = (left = 0, top = 0, bottom = 10) => ({ height: bottom - top, core: { top: 0, bottom: 10 }, ink: [{ left, right: left + 10, top, bottom }] })
const fit = (blocks: ReturnType<typeof row>[], height: number) => paginateNativeBlocks(blocks, { pageHeight: height, margin: 0, gap: 16, maxGap: 32, elastic: true })

describe('elastic page core parameter', () => {
  it('breaks at 16px, then fits each page independently, including the last page', () => {
    const result = fit(Array.from({ length: 5 }, () => row()), 80)
    expect(result.positions.map(p => p.page)).toEqual([0, 0, 0, 1, 1])
    expect(result.coreGaps![0]).toBeCloseTo(25, 5)
    expect(result.coreGaps![1]).toBe(32)
    expect(result.positions.map(p => p.top)).toEqual([0, 35, 70, 0, 42])
  })
  it('scales collision clearance with half the core parameter instead of adding the full increase', () => {
    const blocks = [row(0, 0, 38), row(0, -12, 10), row(100)]
    const fitted = fit(blocks, 110)
    const minimum = paginateNativeBlocks(blocks, { pageHeight: 110, margin: 0, gap: 16, elastic: true })
    expect(fitted.coreGaps![0]).toBeCloseTo(80 / 3, 5)
    expect(fitted.positions[1]!.top - fitted.positions[0]!.top).toBeCloseTo(190 / 3, 5)
    expect(minimum.positions[1]!.top).toBe(58)
    expect(fitted.positions[1]!.top - minimum.positions[1]!.top).toBeCloseTo((fitted.coreGaps![0]! - 16) / 2, 5)
    expect(fitted.positions[2]!.top).toBeCloseTo(100, 5)
  })
  it('leaves spare room when every page gap reaches the maximum', () => {
    const result = fit([row(), row()], 200)
    expect(result.coreGaps).toEqual([32])
    expect(result.positions[1]!.top).toBe(42)
  })
  it('keeps continuous scores at 1.2em while paged layout stretches to 32px', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |{br} 1 2 3 4 |')
    const continuous = layoutNativeScore(document, { width: 320, paged: false, pageMargin: 0 })
    const paged = layoutNativeScore(document, { width: 320, paged: true, pageMargin: 0 })
    expect(continuous.pages[0]!.coreGap).toBeCloseTo(26.4)
    expect(paged.pages[0]!.coreGap).toBe(32)
    expect(paged.systems[1]!.top - paged.systems[0]!.top).toBeCloseTo(continuous.systems[1]!.top - continuous.systems[0]!.top + 5.6, 6)
  })
  it('fits whole scores together using one parameter before distributing remaining inter-score space', () => {
    const documents = [4, 4].map(count => parseM3NDocument('{4/4}\nN: ' + Array(count).fill('1 2 3 4 |{br}').join(' ')))
    const result = renderSharedNumberedNotationScores(documents, { width: 320, pageMargin: 0 }, 22)
    expect(result.coreGap).toBeGreaterThanOrEqual(26.4)
    expect(result.coreGap).toBeLessThan(32)
    expect(result.markup).toHaveLength(2)
    expect(result.markup).toEqual(documents.map(document => NativeNumberedNotationScore.create(document).render({ width: 320, pageMargin: 0, paged: false, coreGap: result.coreGap })[0]))
    expect(result.usedHeight).toBeLessThanOrEqual(Math.floor(320 * 273 / 186))
    // Shared fitting matches each score rendered with that exact parameter.
    const heights = documents.map(document => Math.ceil(layoutNativeScore(document, { width: 320, pageMargin: 0, paged: false, coreGap: result.coreGap }).pages[0]!.height))
    expect(result.usedHeight).toBe(heights[0]! + heights[1]! + result.scoreGap)
    expect(() => renderSharedNumberedNotationScores(Array(20).fill(documents[0]!), { width: 320, pageMargin: 0 })).toThrow('最小核心行距')
  })
})
