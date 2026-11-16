import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { paginateNativeBlocks } from './native-pagination.js'

const options = { pageHeight: 400, margin: 20, gap: 10, justify: true }
describe('native measured-block pagination', () => {
  it('includes the header when sharing complete-page surplus, leaving the last page natural', () => {
    const result = paginateNativeBlocks([{ height: 60 }, { height: 100 }, { height: 100 }, { height: 200 }], options)
    expect(result.heights).toEqual([400, 400])
    expect(result.positions.map(position => position.page)).toEqual([0, 0, 0, 1])
    expect(result.positions[1]!.top).toBeCloseTo(90 + 80 / 3)
    expect(result.positions[2]!.top).toBeCloseTo(200 + 160 / 3)
    expect(result.positions[3]!.top).toBe(20)
  })
  it('retains fixed system gaps when uniform height is requested', () => {
    const result = paginateNativeBlocks([{ height: 100 }, { height: 100 }, { height: 200 }], { ...options, justify: false })
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

it('defaults to natural page gaps and enables baseline page fill only explicitly', () => {
  const document = parseM3NDocument('{4/4}\nN: ' + Array.from({ length: 30 }, () => '1 2 3 4 |').join(' '))
  const options = { width: 320, paged: true }
  const natural = layoutNativeScore(document, options)
  const continuous = layoutNativeScore(document, { ...options, paged: false })
  const compatible = layoutNativeScore(document, { ...options, justifyPages: true })
  expect(natural.pages.length).toBeGreaterThan(1)
  const step = (layout: ReturnType<typeof layoutNativeScore>) => layout.systems[1]!.top - layout.systems[0]!.bottom
  expect(step(natural)).toBeCloseTo(24)
  expect(step(continuous)).toBeCloseTo(step(natural))
  expect(step(compatible)).toBeGreaterThan(step(natural))
  const uniform = layoutNativeScore(document, { ...options, justifyPages: true, uniformSystemHeight: true })
  expect(step(uniform)).toBeCloseTo(24)
})
