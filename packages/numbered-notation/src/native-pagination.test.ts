import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
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
  const step = (layout: ReturnType<typeof layoutNativeScore>) => layout.systems[1]!.top - layout.systems[0]!.bottom
  expect(step(natural)).toBeCloseTo(24)
  expect(step(continuous)).toBeCloseTo(step(natural))
  const uniform = layoutNativeScore(document, { ...options, uniformSystemHeight: true })
  expect(step(uniform)).toBeCloseTo(24)
  for (const width of [320, 600, 800, 1000]) {
    const paged = layoutNativeScore(document, { width, paged: true })
    const continuous = layoutNativeScore(document, { width, paged: false })
    expect(paged.systems).toHaveLength(continuous.systems.length)
    paged.systems.forEach((system, index) => {
      const counterpart = continuous.systems[index]!
      expect(system.bottom - system.top).toBeCloseTo(counterpart.bottom - counterpart.top)
      const previous = paged.systems[index - 1]
      if (previous?.page === system.page) expect(system.top - previous.bottom).toBeCloseTo(24)
    })
  }
})
