import { describe, expect, it } from 'vitest'
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
