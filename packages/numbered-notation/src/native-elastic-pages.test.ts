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
  it('reserves overlay label page bounds without adding inter-row collision spacing', () => {
    const overlay = { ...row(), boundaryInk: [{ left: 0, right: 10, top: -15, bottom: -5 }] }
    const first = paginateNativeBlocks([overlay], { pageHeight: 60, margin: 0, gap: 16, elastic: true })
    expect(first.positions[0]!.top).toBe(15)
    const following = paginateNativeBlocks([row(), overlay], { pageHeight: 60, margin: 0, gap: 16, elastic: true })
    expect(following.positions.map(position => position.top)).toEqual([0, 26])
  })

  it.each([0, -20])('reserves only actual overlay overflow at a continuation-page top (music top %s)', musicTop => {
    const music = row(0, musicTop)
    const label = { ...music, boundaryInk: [{ left: 0, right: 10, top: -15, bottom: -5 }] }
    const options = { pageHeight: 40, margin: 0, gap: 16, elastic: true }
    const ordinary = paginateNativeBlocks([row(), row(), music], options)
    const numbered = paginateNativeBlocks([row(), row(), label], options)
    expect(ordinary.positions.map(position => position.page)).toEqual([0, 0, 1])
    expect(numbered.positions.map(position => position.page)).toEqual([0, 0, 1])
    expect(ordinary.positions[2]!.top).toBe(0 - musicTop)
    expect(numbered.positions[2]!.top).toBe(Math.max(-musicTop, 15))
    // A taller decoration already covers the label; no extra inset is added.
    if (musicTop < -15) expect(numbered.positions).toEqual(ordinary.positions)
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
  it('keeps continuous scores at 28px while paged layout stretches to 32px', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |{br} 1 2 3 4 |')
    const continuous = layoutNativeScore(document, { width: 320, paged: false, pageMargin: 0 })
    const paged = layoutNativeScore(document, { width: 320, paged: true, pageMargin: 0 })
    expect(continuous.pages[0]!.coreGap).toBeCloseTo(28)
    expect(paged.pages[0]!.coreGap).toBe(32)
    expect(paged.systems[1]!.top - paged.systems[0]!.top).toBeCloseTo(continuous.systems[1]!.top - continuous.systems[0]!.top + 4, 6)
  })
  it('fits whole scores together using one parameter before distributing remaining inter-score space', () => {
    const documents = [4, 4].map(count => parseM3NDocument('{4/4}\nN: ' + Array(count).fill('1 2 3 4 |{br}').join(' ')))
    const result = renderSharedNumberedNotationScores(documents, { width: 330, pageMargin: 0 }, 22)
    expect(result.coreGap).toBeGreaterThanOrEqual(28)
    expect(result.coreGap).toBeLessThan(32)
    expect(result.markup).toHaveLength(2)
    expect(result.markup).toEqual(documents.map(document => NativeNumberedNotationScore.create(document).render({ width: 330, pageMargin: 0, paged: false, coreGap: result.coreGap })[0]))
    expect(result.usedHeight).toBeLessThanOrEqual(Math.floor(330 * 273 / 186))
    // Shared fitting matches each score rendered with that exact parameter.
    const heights = documents.map(document => {
      const svg = NativeNumberedNotationScore.create(document).render({ width: 330, pageMargin: 0, paged: false, coreGap: result.coreGap })[0]!
      return Number(/^<svg\b[^>]*\bheight="([^"]+)"/.exec(svg)![1])
    })
    expect(result.usedHeight).toBeCloseTo(heights[0]! + heights[1]! + result.scoreGap + result.trailingGap, 8)
    expect(() => renderSharedNumberedNotationScores(Array(20).fill(documents[0]!), { width: 330, pageMargin: 0 })).toThrow('最小核心行距')
  })
})
