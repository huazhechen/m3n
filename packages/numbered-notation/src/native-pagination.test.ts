import { describe, expect, it } from 'vitest'
import { normalizePageConfig, paginateLayoutLines } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeLanePieces } from './native-lanes.js'
import { paginateNativeBlocks } from './native-pagination.js'

const options = { pageHeight: 400, margin: 20, gap: 10 }
describe('native measured-block pagination', () => {
  it('keeps the header and all pages at natural gaps, leaving unused space below', () => {
    const result = paginateNativeBlocks([{ height: 60 }, { height: 100 }, { height: 100 }, { height: 200 }], options)
    expect(result.heights).toEqual([400, 400])
    expect(result.positions.map(position => position.page)).toEqual([0, 0, 0, 1])
    expect(result.positions[1]!.top).toBe(90)
    expect(result.positions[2]!.top).toBe(200)
    expect(result.positions[3]!.top).toBe(20)
  })
  it('retains fixed gaps when a later block moves to another page', () => {
    const result = paginateNativeBlocks([{ height: 100 }, { height: 100 }, { height: 200 }], options)
    expect(result.positions.map(position => position.top)).toEqual([20, 130, 20])
  })
  it('omits a section gap at the start of a page', () => {
    const result = paginateNativeBlocks([{ height: 280 }, { height: 100, gapBefore: 30 }], options)
    expect(result.positions[1]).toEqual({ page: 1, top: 20 })
  })
  it('uses natural height in continuous mode and rejects an unplaceable block', () => {
    expect(paginateNativeBlocks([{ height: 60 }, { height: 100 }], { ...options, pageHeight: Infinity }).heights).toEqual([210])
    expect(() => paginateNativeBlocks([{ height: 361 }], options)).toThrow('单个谱行')
  })
})

it('keeps the same natural system gaps across page sizes and in continuous mode', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array.from({ length: 30 }, () => '1 2 3 4 |').join(' '))
  const options = { width: 320, paged: true }
  const natural = layoutNativeScore(document, options)
  const continuous = layoutNativeScore(document, { ...options, paged: false })
  expect(natural.pages.length).toBeGreaterThan(1)
  const step = (layout: ReturnType<typeof layoutNativeScore>) => {
    const [first, second] = layout.systems
    const before = nativeLanePieces(first!, layout.measurer, true).get(first!.lanes[0]!.id)!
    const after = nativeLanePieces(second!, layout.measurer, true).get(second!.lanes[0]!.id)!
    return second!.lanes[0]!.y + Math.min(...after.map(r => r.top)) - first!.lanes[0]!.y - Math.max(...before.map(r => r.bottom))
  }
  expect(step(natural)).toBeCloseTo(24)
  expect(step(continuous)).toBeCloseTo(step(natural))
  const uniform = layoutNativeScore(document, { ...options, uniformSystemHeight: true })
  expect(step(uniform)).toBeGreaterThanOrEqual(24)
  for (const width of [320, 600, 800, 1000]) {
    const paged = layoutNativeScore(document, { width, paged: true })
    const continuous = layoutNativeScore(document, { width, paged: false })
    expect(paged.systems).toHaveLength(continuous.systems.length)
    paged.systems.forEach((system, index) => {
      const counterpart = continuous.systems[index]!
      expect(system.bottom - system.top).toBeCloseTo(counterpart.bottom - counterpart.top)
      const previous = paged.systems[index - 1]
      if (previous?.page === system.page) expect(system.lanes[0]!.y - previous.lanes[0]!.y).toBeGreaterThanOrEqual(24 - 1e-6)
    })
  }
})


it('shares natural block positions with jpFun across capacities and section gaps', () => {
  const blocks = Array.from({ length: 25 }, (_, i) => ({ height: 18 + i * 17 % 70, gapBefore: i % 3 ? 0 : 12 }))
  for (const height of [180, 240, 400, Infinity]) for (const gap of [0, 10, 24]) {
    const native = paginateNativeBlocks(blocks, { pageHeight: height, margin: 20, gap })
    const reference = paginateLayoutLines(blocks.map(b => b.height), normalizePageConfig({
      height, marginTop: 20, marginBottom: 20, lineGap: gap,
    }), [], blocks.map(b => b.gapBefore))
    expect(reference.pages.map(p => p.bounds.h)).toEqual(native.heights)
    for (const [index, position] of native.positions.entries()) {
      const page = reference.pages[position.page]!
      expect(index).toBeGreaterThanOrEqual(page.lineStart)
      expect(index).toBeLessThan(page.lineEnd)
      expect(reference.lineTops[index]! - page.bounds.y).toBeCloseTo(position.top, 8)
    }
  }
})


it('uses 24px core clearance and 12px ornament clearance without combining remote extremes', () => {
  const block = (left: number, top: number, bottom: number) => ({ height: bottom - top, baseline: 0, core: { top: -2, bottom: 2 }, ink: [{ left, right: left + 10, top, bottom }] })
  const overlapping = paginateNativeBlocks([block(0, -8, 20), block(0, -18, 4)], { ...options, elastic: true, gap: 24 })
  expect(overlapping.positions[1]!.top - overlapping.positions[0]!.top).toBe(50)
  const remote = paginateNativeBlocks([block(0, -20, 40), block(100, -40, 2)], { ...options, elastic: true, gap: 24 })
  expect(remote.positions[1]!.top - remote.positions[0]!.top).toBe(28)
})

it('reserves the entire core even without horizontal overlap and resets at page starts', () => {
  const blocks = [
    { height: 35, baseline: 2, core: { top: 0, bottom: 35 }, ink: [{ left: 0, right: 10, top: 0, bottom: 35 }] },
    { height: 4, baseline: 2, core: { top: 0, bottom: 4 }, ink: [{ left: 100, right: 110, top: 0, bottom: 4 }] },
  ]
  const continuous = paginateNativeBlocks(blocks, { pageHeight: Infinity, margin: 10, gap: 24, elastic: true })
  expect(continuous.positions[1]!.top - continuous.positions[0]!.top).toBe(59)
  const paged = paginateNativeBlocks(blocks, { pageHeight: 70, margin: 10, gap: 24, elastic: true })
  expect(paged.positions).toEqual([{ page: 0, top: 10 }, { page: 1, top: 10 }])
})
